'use strict';
/**
 * png.js — 零依赖 PNG 读写（Node.js 内置 fs + zlib）
 *
 * 为什么自带而不引第三方库：skill 要能在一台裸 Node 机器上直接跑，
 * 装 pngjs 之类的包等于给用户环境加依赖，收益不抵成本。
 *
 * 读：支持 color type 0/2/3/4/6、bit depth 1/2/4/8/16、tRNS，非隔行。
 * 写：固定 8bit RGBA（color type 6），每行 filter 0，zlib deflate。
 */

const fs = require('fs');
const zlib = require('zlib');

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

// ---------------------------------------------------------------- CRC32 ----

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

// ------------------------------------------------------------------ 读 ----

function sampleAt(line, index, depth) {
  if (depth === 16) return line[index * 2]; // 取高字节
  if (depth === 8) return line[index];
  const perByte = 8 / depth;
  const byte = line[Math.floor(index / perByte)];
  const shift = 8 - depth * ((index % perByte) + 1);
  return (byte >> shift) & ((1 << depth) - 1);
}

function scaleSample(v, depth) {
  if (depth === 16) return v; // 已取高字节
  if (depth === 8) return v;
  return Math.round((v * 255) / ((1 << depth) - 1));
}

/**
 * 读 PNG，返回 { width, height, data }，data 是 RGBA8 的 Buffer（每像素 4 字节）。
 */
function readPNG(path) {
  const buf = fs.readFileSync(path);
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`不是 PNG 文件: ${path}`);
  }

  let pos = 8;
  let ihdr = null;
  let palette = null;
  let transparency = null;
  const idat = [];

  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        depth: data[8],
        color: data[9],
        compression: data[10],
        filter: data[11],
        interlace: data[12],
      };
    } else if (type === 'PLTE') {
      palette = Buffer.from(data);
    } else if (type === 'tRNS') {
      transparency = Buffer.from(data);
    } else if (type === 'IDAT') {
      idat.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    pos += 12 + len;
  }

  if (!ihdr) throw new Error(`PNG 缺少 IHDR: ${path}`);
  if (ihdr.interlace !== 0) throw new Error(`暂不支持隔行 PNG（Adam7）: ${path}`);
  if (!(ihdr.color in CHANNELS)) throw new Error(`不支持的 color type ${ihdr.color}: ${path}`);

  const { width, height, depth, color } = ihdr;
  const channels = CHANNELS[color];
  const bitsPerPixel = channels * depth;
  const bytesPerLine = Math.ceil((width * bitsPerPixel) / 8);
  const filterUnit = Math.max(1, Math.ceil(bitsPerPixel / 8));

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const lines = Buffer.alloc(height * bytesPerLine);
  let prev = Buffer.alloc(bytesPerLine);
  let off = 0;

  for (let y = 0; y < height; y++) {
    const filter = raw[off++];
    const line = Buffer.from(raw.subarray(off, off + bytesPerLine));
    off += bytesPerLine;
    for (let i = 0; i < bytesPerLine; i++) {
      const a = i >= filterUnit ? line[i - filterUnit] : 0;
      const b = prev[i];
      const c = i >= filterUnit ? prev[i - filterUnit] : 0;
      let v = line[i];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v = (v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      } else if (filter !== 0) {
        throw new Error(`未知的 PNG filter ${filter}: ${path}`);
      }
      line[i] = v;
    }
    line.copy(lines, y * bytesPerLine);
    prev = line;
  }

  const out = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    const line = lines.subarray(y * bytesPerLine, (y + 1) * bytesPerLine);
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (color === 6) {
        out[p] = sampleAt(line, x * 4 + 0, depth);
        out[p + 1] = sampleAt(line, x * 4 + 1, depth);
        out[p + 2] = sampleAt(line, x * 4 + 2, depth);
        out[p + 3] = sampleAt(line, x * 4 + 3, depth);
      } else if (color === 2) {
        out[p] = sampleAt(line, x * 3 + 0, depth);
        out[p + 1] = sampleAt(line, x * 3 + 1, depth);
        out[p + 2] = sampleAt(line, x * 3 + 2, depth);
        out[p + 3] = 255;
      } else if (color === 0) {
        const g = scaleSample(sampleAt(line, x, depth), depth);
        out[p] = g;
        out[p + 1] = g;
        out[p + 2] = g;
        out[p + 3] = transparency && transparency.length >= 2 && sampleAt(line, x, depth) === transparency.readUInt16BE(0) ? 0 : 255;
      } else if (color === 4) {
        const g = scaleSample(sampleAt(line, x * 2 + 0, depth), depth);
        out[p] = g;
        out[p + 1] = g;
        out[p + 2] = g;
        out[p + 3] = sampleAt(line, x * 2 + 1, depth);
      } else {
        // palette
        const idx = sampleAt(line, x, depth);
        out[p] = palette[idx * 3 + 0];
        out[p + 1] = palette[idx * 3 + 1];
        out[p + 2] = palette[idx * 3 + 2];
        out[p + 3] = transparency && idx < transparency.length ? transparency[idx] : 255;
      }
    }
  }

  return { width, height, data: out };
}

// ------------------------------------------------------------------ 写 ----

/** 把 RGBA8 数据写成 PNG 文件。 */
function writePNG(path, width, height, data) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: None
    data.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  fs.writeFileSync(
    path,
    Buffer.concat([
      PNG_SIGNATURE,
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
}

module.exports = { readPNG, writePNG };
