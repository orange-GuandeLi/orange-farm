'use strict';
/**
 * aseprite.js — 读写 .aseprite（Aseprite/LibreSprite 原生工程格式）
 *
 * 为什么需要它：PNG 是"烘焙"后的产物，改不动；.aseprite 才是可编辑的母版，
 * 打开就能在 Aseprite/LibreSprite 里逐帧逐像素地改。所以 spec 渲染器的输出
 * 应该能直接写 .aseprite，人接手后还能继续画。
 *
 * 格式依据：Aseprite File Format Specifications（128 字节文件头 + 每帧若干 chunk）。
 * 本实现的字节布局用 LibreSprite 自己产出的 .aseprite 做过逐字段对照验证。
 *
 * 依赖：只用内置 fs / zlib / path，无第三方 npm 依赖。
 */

const fs = require('fs');
const zlib = require('zlib');

const MAGIC_FILE = 0xa5e0;
const MAGIC_FRAME = 0xf1fa;

const CHUNK_LAYER = 0x2004;
const CHUNK_CEL = 0x2005;
const CHUNK_PALETTE = 0x2019;

const CEL_RAW = 0;
const CEL_LINKED = 1;
const CEL_COMPRESSED = 2;

// ------------------------------------------------------------ 基础工具 ----

class AsepriteError extends Error {}

function w16(buf, off, v) { buf.writeUInt16LE(v & 0xffff, off); }
function w32(buf, off, v) { buf.writeUInt32LE(v >>> 0, off); }

function stringBytes(s) {
  const b = Buffer.from(s, 'utf8');
  const out = Buffer.alloc(2 + b.length);
  out.writeUInt16LE(b.length, 0);
  b.copy(out, 2);
  return out;
}

/** 收集一张 RGBA 图里出现的所有不透明颜色（按首次出现顺序，去重）。 */
function collectPalette(rgba, w, h) {
  const seen = new Map();
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (rgba[o + 3] === 0) continue;
    const key = `${rgba[o]},${rgba[o + 1]},${rgba[o + 2]},${rgba[o + 3]}`;
    if (!seen.has(key)) seen.set(key, [rgba[o], rgba[o + 1], rgba[o + 2], rgba[o + 3]]);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------- chunk ----

function layerChunk({ name, flags = 3, type = 0, childLevel = 0, opacity = 255, blendMode = 0 }) {
  // 固定 16 字节：flags(2) type(2) childLevel(2) width(2) height(2) blendMode(2) opacity(1) 保留(3)
  // 之后是 STRING（WORD 长度 + UTF-8 字节）
  const nb = Buffer.from(name, 'utf8');
  const data = Buffer.alloc(16 + 2 + nb.length);
  w16(data, 0, flags);           // 1=Visible 2=Editable
  w16(data, 2, type);            // 0=Normal image layer
  w16(data, 4, childLevel);      // 图层级嵌套
  w16(data, 6, 0);               // default width（忽略）
  w16(data, 8, 0);               // default height（忽略）
  w16(data, 10, blendMode);      // 0=Normal
  data[12] = opacity;            // 仅当文件头 flags bit0 置位时有效
  // 13..15 保留为 0
  w16(data, 16, nb.length);      // STRING 长度
  nb.copy(data, 18);
  return chunk(CHUNK_LAYER, data);
}

function celChunk({ layerIndex, x = 0, y = 0, opacity = 255, celType = CEL_COMPRESSED, width, height, rgba }) {
  let payload;
  if (celType === CEL_COMPRESSED) {
    payload = zlib.deflateSync(rgba);
  } else if (celType === CEL_RAW) {
    payload = rgba;
  } else {
    throw new AsepriteError(`不支持的 cel type ${celType}（只支持 raw=0 / compressed=2）`);
  }
  // 固定 20 字节头：layerIndex(2) x(2) y(2) opacity(1) celType(2) zIndex(2) reserved(5) w(2) h(2)
  const data = Buffer.alloc(20 + payload.length);
  w16(data, 0, layerIndex);
  data.writeInt16LE(x, 2);
  data.writeInt16LE(y, 4);
  data[6] = opacity;
  w16(data, 7, celType);
  w16(data, 9, 0);              // z-index
  // 11..15 保留为 0
  w16(data, 16, width);
  w16(data, 18, height);
  payload.copy(data, 20);
  return chunk(CHUNK_CEL, data);
}

function paletteChunk(colors) {
  if (!colors.length) return null;
  const data = Buffer.alloc(4 + 4 + 4 + 8 + colors.length * 6);
  w32(data, 0, colors.length);   // new palette size
  w32(data, 4, 0);              // first color index
  w32(data, 8, colors.length - 1); // last color index
  // 12..19 保留为 0
  let off = 20;
  for (const [r, g, b, a] of colors) {
    w16(data, off, 0);           // entry flags（0 = 无名字）
    data[off + 2] = r;
    data[off + 3] = g;
    data[off + 4] = b;
    data[off + 5] = a;
    off += 6;
  }
  return chunk(CHUNK_PALETTE, data);
}

function chunk(type, data) {
  const out = Buffer.alloc(6 + data.length);
  w32(out, 0, 6 + data.length);  // chunk size（含这 6 字节头）
  w16(out, 4, type);
  data.copy(out, 6);
  return out;
}

// ----------------------------------------------------------------- 写 ----

/**
 * 写一个 .aseprite 文件。
 *
 * @param {string} filePath
 * @param {object} doc
 * @param {number} doc.width      画布宽（单帧）
 * @param {number} doc.height     画布高（单帧）
 * @param {Array}  doc.frames     [{ durationMs, layers: [{ name, rgba, x, y }] }]  下层在前
 * @param {number} [doc.speed]    默认帧时长（毫秒）
 * @param {Array}  [doc.palette]  [[r,g,b,a], ...]；不给则自动从像素里收集
 */
function writeAseprite(filePath, doc) {
  const { width, height, frames } = doc;
  if (!width || !height) throw new AsepriteError('writeAseprite: 缺少 width/height');
  if (!frames || !frames.length) throw new AsepriteError('writeAseprite: 缺少 frames');

  const speed = doc.speed || (frames[0].durationMs || 100);

  // 调色板：优先用调用方给的，否则从所有帧的像素里收集
  let palette = doc.palette;
  if (!palette) {
    const map = new Map();
    for (const f of frames) {
      for (const L of f.layers) {
        const c = collectPalette(L.rgba, width, height);
        for (const [r, g, b, a] of c) {
          const k = `${r},${g},${b},${a}`;
          if (!map.has(k)) map.set(k, [r, g, b, a]);
        }
      }
    }
    palette = [...map.values()];
  }

  const frameBlocks = [];
  frames.forEach((f, fi) => {
    const parts = [];
    // 调色板写在第 0 帧（调色板是精灵级属性，只需出现一次）
    if (fi === 0) {
      const pc = paletteChunk(palette);
      if (pc) parts.push(pc);
    }
    // 图层定义 + cel
    f.layers.forEach((L, li) => {
      parts.push(layerChunk({ name: L.name, childLevel: 0 }));
    });
    f.layers.forEach((L, li) => {
      parts.push(celChunk({
        layerIndex: li,
        x: L.x || 0,
        y: L.y || 0,
        width,
        height,
        rgba: L.rgba,
      }));
    });
    const body = Buffer.concat(parts);
    const fh = Buffer.alloc(16);
    w32(fh, 0, 16 + body.length); // bytes in this frame（含 16 字节帧头）
    w16(fh, 4, MAGIC_FRAME);
    w16(fh, 6, parts.length);     // chunk count
    w16(fh, 8, f.durationMs || speed);
    // 10..15 保留为 0
    frameBlocks.push(Buffer.concat([fh, body]));
  });

  const header = Buffer.alloc(128);
  w32(header, 0, 0);             // file size（回填）
  w16(header, 4, MAGIC_FILE);
  w16(header, 6, frames.length);
  w16(header, 8, width);
  w16(header, 10, height);
  w16(header, 12, 32);           // 32 bpp = RGBA
  w32(header, 14, 1);            // flags：layer opacity 有效
  w16(header, 18, speed);
  // 20..27 保留为 0
  header[28] = 0;                // transparent color index（仅 indexed 用）
  // 29..31 保留为 0
  w16(header, 32, palette.length); // number of colors
  header[34] = 0;                // pixel width
  header[35] = 0;                // pixel height
  // 36..127 保留为 0

  const body = Buffer.concat(frameBlocks);
  w32(header, 0, 128 + body.length);

  fs.writeFileSync(filePath, Buffer.concat([header, body]));
  return { path: filePath, frames: frames.length, width, height, layers: frames[0].layers.length, palette: palette.length };
}

// ----------------------------------------------------------------- 读 ----

function readAseprite(filePath) {
  const b = fs.readFileSync(filePath);
  if (b.length < 128) throw new AsepriteError(`文件太短，不是 .aseprite: ${filePath}`);
  if (b.readUInt16LE(4) !== MAGIC_FILE) throw new AsepriteError(`magic 不对，不是 .aseprite: ${filePath}`);

  const frameCount = b.readUInt16LE(6);
  const width = b.readUInt16LE(8);
  const height = b.readUInt16LE(10);
  const depth = b.readUInt16LE(12);
  if (depth !== 32) throw new AsepriteError(`只支持 32bpp RGBA，该文件是 ${depth}bpp`);

  const frames = [];
  let off = 128;
  for (let fi = 0; fi < frameCount; fi++) {
    const bytesInFrame = b.readUInt32LE(off);
    if (b.readUInt16LE(off + 4) !== MAGIC_FRAME) throw new AsepriteError(`第 ${fi} 帧 magic 不对`);
    let chunkCount = b.readUInt16LE(off + 6);
    if (chunkCount === 0xffff) chunkCount = b.readUInt32LE(off + 12);
    const durationMs = b.readUInt16LE(off + 8);

    const layers = [];
    const cels = [];
    let c = off + 16;
    const end = off + bytesInFrame;
    for (let k = 0; k < chunkCount && c + 6 <= end; k++) {
      const csize = b.readUInt32LE(c);
      const ctype = b.readUInt16LE(c + 4);
      const data = b.subarray(c + 6, c + csize);
      if (ctype === CHUNK_LAYER) {
        const nb = data.readUInt16LE(16);
        layers.push({
          flags: data.readUInt16LE(0),
          type: data.readUInt16LE(2),
          childLevel: data.readUInt16LE(4),
          opacity: data[12],
          name: data.subarray(18, 18 + nb).toString('utf8'),
        });
      } else if (ctype === CHUNK_CEL) {
        const celType = data.readUInt16LE(7);
        const cw = data.readUInt16LE(16);
        const ch = data.readUInt16LE(18);
        let rgba = null;
        if (celType === CEL_RAW) {
          rgba = Buffer.from(data.subarray(20, 20 + cw * ch * 4));
        } else if (celType === CEL_COMPRESSED) {
          rgba = zlib.inflateSync(data.subarray(20));
        } else if (celType === CEL_LINKED) {
          rgba = null; // linked cel：引用别的帧，由调用方决定如何处理
        }
        cels.push({
          layerIndex: data.readUInt16LE(0),
          x: data.readInt16LE(2),
          y: data.readInt16LE(4),
          opacity: data[6],
          celType,
          width: cw,
          height: ch,
          rgba,
        });
      }
      c += csize;
    }
    frames.push({ durationMs, layers, cels });
    off = end;
  }
  return { width, height, frames, depth };
}

/** 把一个 cel 按 (x,y) 以 source-over 混合到画布上。 */
function blendCel(canvas, cw, ch, cel) {
  if (!cel.rgba) return;
  const src = cel.rgba;
  for (let sy = 0; sy < cel.height; sy++) {
    const dy = cel.y + sy;
    if (dy < 0 || dy >= ch) continue;
    for (let sx = 0; sx < cel.width; sx++) {
      const dx = cel.x + sx;
      if (dx < 0 || dx >= cw) continue;
      const so = (sy * cel.width + sx) * 4;
      const sa = src[so + 3];
      if (sa === 0) continue;
      const dof = (dy * cw + dx) * 4;
      const da = canvas[dof + 3];
      if (sa === 255) {
        canvas[dof] = src[so];
        canvas[dof + 1] = src[so + 1];
        canvas[dof + 2] = src[so + 2];
        canvas[dof + 3] = 255;
        continue;
      }
      const inv = 255 - sa;
      const outA = sa + Math.round((da * inv) / 255);
      if (outA === 0) { canvas[dof] = canvas[dof + 1] = canvas[dof + 2] = canvas[dof + 3] = 0; continue; }
      for (let k = 0; k < 3; k++) {
        canvas[dof + k] = Math.round((src[so + k] * sa + (canvas[dof + k] * da * inv) / 255) / outA);
      }
      canvas[dof + 3] = outA;
    }
  }
}

/**
 * 把 .aseprite 读成"横向条带"RGBA（和 PNG 条带同样的形状），
 * 这样 sheet_probe 的 diff / find / ascii 可以直接吃 .aseprite，不用改。
 *
 * @returns {{width, height, data, frames: number}} width = frames × 单帧宽
 */
function asepriteToStrip(filePath) {
  const doc = readAseprite(filePath);
  const { width, height, frames } = doc;
  const out = Buffer.alloc(width * frames.length * height * 4);
  frames.forEach((f, fi) => {
    const canvas = Buffer.alloc(width * height * 4);
    // 按图层顺序（下的先画）叠 cel
    for (const cel of f.cels) blendCel(canvas, width, height, cel);
    for (let y = 0; y < height; y++) {
      const srcOff = y * width * 4;
      const dstOff = (y * width * frames.length + fi * width) * 4;
      canvas.copy(out, dstOff, srcOff, srcOff + width * 4);
    }
  });
  return { width: width * frames.length, height, data: out, frames: frames.length };
}

module.exports = { writeAseprite, readAseprite, asepriteToStrip, blendCel, AsepriteError };
