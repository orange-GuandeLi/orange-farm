'use strict';
/**
 * sprite_spec.js — 通用像素精灵渲染器
 *
 * 读一份声明式 spec（JSON），渲染出 PNG。
 * spec 描述"哪个文件、哪一块、什么颜色"，脚本只负责画。
 * 所以改颜色 / 挪色块 = 改 spec 后重跑，不用重新分析素材。
 *
 * 用法
 *   node sprite_spec.js <spec.json>              渲染
 *   node sprite_spec.js <spec.json> --check      只校验不写文件
 *   node sprite_spec.js <spec.json> --preview    额外出对照图
 *   node sprite_spec.js <spec.json> --scale 4    对照图放大倍率
 *   node sprite_spec.js <spec.json> --root DIR   覆盖 spec 里的 root
 *
 * spec 结构见 references/spec-format.md
 */

const fs = require('fs');
const path = require('path');
const { readPNG, writePNG } = require('./png.js');
const { writeAseprite, asepriteToStrip } = require('./aseprite.js');

class SpecError extends Error {}

/** 是不是 .aseprite / .ase 文件（可编辑母版）。 */
function isAseprite(p) {
  return /\.(aseprite|ase)$/i.test(p);
}

// ------------------------------------------------------------ 基础工具 ----

function hexToRgb(hex) {
  const h = hex.replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new SpecError(`颜色格式应为 #RRGGBB: ${hex}`);
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function rgbToHex(rgb) {
  return '#' + rgb.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

/** 颜色可以是 '#RRGGBB' 或 palette 里的名字。 */
function getColor(spec, ref) {
  if (typeof ref !== 'string') throw new SpecError(`颜色必须是字符串或 palette 名: ${JSON.stringify(ref)}`);
  if (ref.startsWith('#')) return hexToRgb(ref);
  const palette = spec.palette || {};
  if (!(ref in palette)) {
    throw new SpecError(`palette 里没有 '${ref}'，可选: ${JSON.stringify(Object.keys(palette).sort())}`);
  }
  return getColor(spec, palette[ref]);
}

function resolvePath(p, root) {
  return path.isAbsolute(p) ? p : path.join(root, p);
}

function sourcePath(spec, ref, root) {
  const srcs = spec.sources || {};
  return resolvePath(ref in srcs ? srcs[ref] : ref, root);
}

// -------------------------------------------------------------- 画布 ----

function createCanvas(w, h) {
  return { width: w, height: h, data: Buffer.alloc(w * h * 4) };
}

/** src over dst 的 alpha 混合（对应 PIL.Image.alpha_composite）。dst/src 都是 RGBA Buffer。 */
function blendPixel(dst, dOff, src, sOff) {
  const sa = src[sOff + 3];
  if (sa === 255) {
    dst[dOff] = src[sOff];
    dst[dOff + 1] = src[sOff + 1];
    dst[dOff + 2] = src[sOff + 2];
    dst[dOff + 3] = 255;
    return;
  }
  if (sa === 0) return;
  const da = dst[dOff + 3];
  const inv = 255 - sa;
  const outA = sa + Math.round((da * inv) / 255);
  if (outA === 0) {
    dst[dOff] = 0;
    dst[dOff + 1] = 0;
    dst[dOff + 2] = 0;
    dst[dOff + 3] = 0;
    return;
  }
  for (let c = 0; c < 3; c++) {
    const sc = src[sOff + c];
    const dc = dst[dOff + c];
    dst[dOff + c] = Math.round((sc * sa + (dc * da * inv) / 255) / outA);
  }
  dst[dOff + 3] = outA;
}

/** 把 src 的矩形区域 over 到 dst 上（超出 dst 边界自动裁剪）。src/dst 都是画布对象。 */
function blendRegion(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      blendPixel(dst.data, (ty * dst.width + tx) * 4, src.data, ((sy + y) * src.width + (sx + x)) * 4);
    }
  }
}

/** 用 src 的矩形区域覆盖 dst（直接写像素，不做混合）。 */
function overwriteRegion(dst, src, sx, sy, sw, sh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.height) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dst.width) continue;
      const sOff = ((sy + y) * src.width + (sx + x)) * 4;
      src.data.copy(dst.data, (ty * dst.width + tx) * 4, sOff, sOff + 4);
    }
  }
}

// -------------------------------------------------------------- 算子 ----

const OPS = {
  /** 从别的文件贴一块过来。 */
  copy(canvas, spec, op, ctx) {
    const src = ctx.loadImage(op.src);
    const cw = ctx.cellW;
    const ch = ctx.cellH;
    const f = op.frame || 0;
    const at = op.at || [0, 0];
    const rect = op.rect;
    // flip: "h" / "v" / "hv" —— 贴之前先翻转（左右/上下）
    const flip = op.flip || '';
    if (flip) {
      const x = rect ? rect[0] : 0;
      const y = rect ? rect[1] : 0;
      const w = rect ? rect[2] : cw;
      const h = rect ? rect[3] : ch;
      const sx0 = f * cw + x;
      const piece = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
      for (let yy = 0; yy < h; yy++) {
        for (let xx = 0; xx < w; xx++) {
          const tx = flip.includes('h') ? w - 1 - xx : xx;
          const ty = flip.includes('v') ? h - 1 - yy : yy;
          const sOff = ((y + yy) * src.width + sx0 + xx) * 4;
          src.data.copy(piece.data, (ty * w + tx) * 4, sOff, sOff + 4);
        }
      }
      blendRegion(canvas, piece, 0, 0, w, h, at[0], at[1]);
      return;
    }
    if (rect) {
      const [x, y, w, h] = rect;
      blendRegion(canvas, src, f * cw + x, y, w, h, at[0], at[1]);
    } else {
      blendRegion(canvas, src, f * cw, 0, cw, ch, at[0], at[1]);
    }
  },

  /** 填一个矩形（色块）。 */
  fill(canvas, spec, op, ctx) {
    const [x, y, w, h] = op.rect;
    const color = getColor(spec, op.color);
    for (let yy = 0; yy < h; yy++) {
      const ty = y + yy;
      if (ty < 0 || ty >= canvas.height) continue;
      for (let xx = 0; xx < w; xx++) {
        const tx = x + xx;
        if (tx < 0 || tx >= canvas.width) continue;
        const off = (ty * canvas.width + tx) * 4;
        canvas.data[off] = color[0];
        canvas.data[off + 1] = color[1];
        canvas.data[off + 2] = color[2];
        canvas.data[off + 3] = 255;
      }
    }
  },

  /** 擦成透明。必须覆盖写，不能用 alpha 混合（透明叠透明等于没擦）。 */
  clear(canvas, spec, op, ctx) {
    const [x, y, w, h] = op.rect;
    for (let yy = 0; yy < h; yy++) {
      const ty = y + yy;
      if (ty < 0 || ty >= canvas.height) continue;
      for (let xx = 0; xx < w; xx++) {
        const tx = x + xx;
        if (tx < 0 || tx >= canvas.width) continue;
        canvas.data.fill(0, (ty * canvas.width + tx) * 4, (ty * canvas.width + tx) * 4 + 4);
      }
    }
  },

  /** 整体换色（换发色、换衣服色）。按 RGB 精确匹配，保留 alpha。 */
  remap(canvas, spec, op, ctx) {
    const region = op.rect || [0, 0, canvas.width, canvas.height];
    const [rx, ry, rw, rh] = region;
    const mapping = new Map();
    for (const [from, to] of Object.entries(op.map || {})) {
      mapping.set(hexToRgb(from).join(','), getColor(spec, to));
    }
    for (let y = 0; y < rh; y++) {
      const ty = ry + y;
      if (ty < 0 || ty >= canvas.height) continue;
      for (let x = 0; x < rw; x++) {
        const tx = rx + x;
        if (tx < 0 || tx >= canvas.width) continue;
        const off = (ty * canvas.width + tx) * 4;
        const hit = mapping.get(`${canvas.data[off]},${canvas.data[off + 1]},${canvas.data[off + 2]}`);
        if (hit) {
          canvas.data[off] = hit[0];
          canvas.data[off + 1] = hit[1];
          canvas.data[off + 2] = hit[2];
        }
      }
    }
  },

  /** ASCII 像素画：art 里每个字符对应一个颜色（legend 可放 spec 顶层当默认）。 */
  brush(canvas, spec, op, ctx) {
    const legend = op.legend || spec.legend || {};
    const [x0, y0] = op.at || [0, 0];
    op.art.forEach((row, dy) => {
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === ' ' || ch === '.') continue;
        if (!(ch in legend)) throw new SpecError(`brush 用了未定义的字符 '${ch}'，legend 缺这一项`);
        const ref = legend[ch];
        if (ref === null || ref === undefined) continue; // null = 透明
        const color = getColor(spec, ref);
        const px = x0 + dx;
        const py = y0 + dy;
        if (px < 0 || px >= canvas.width || py < 0 || py >= canvas.height) continue;
        const off = (py * canvas.width + px) * 4;
        canvas.data[off] = color[0];
        canvas.data[off + 1] = color[1];
        canvas.data[off + 2] = color[2];
        canvas.data[off + 3] = 255;
      }
    });
  },

  /** 镜像：axis h = 左右翻，v = 上下翻。 */
  mirror(canvas, spec, op, ctx) {
    const flip = (buf, w, h, axis) => {
      const out = Buffer.alloc(buf.length);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = axis === 'h' ? w - 1 - x : x;
          const sy = axis === 'h' ? y : h - 1 - y;
          buf.copy(out, (y * w + x) * 4, (sy * w + sx) * 4, (sy * w + sx) * 4 + 4);
        }
      }
      return out;
    };
    const axis = op.axis === 'v' ? 'v' : 'h';
    if (op.rect) {
      const [x, y, w, h] = op.rect;
      const piece = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
      for (let yy = 0; yy < h; yy++) {
        canvas.data.copy(piece.data, yy * w * 4, ((y + yy) * canvas.width + x) * 4, ((y + yy) * canvas.width + x + w) * 4);
      }
      piece.data = flip(piece.data, w, h, axis);
      blendRegion(canvas, piece, 0, 0, w, h, x, y);
    } else {
      const flipped = flip(canvas.data, canvas.width, canvas.height, axis);
      flipped.copy(canvas.data, 0);
    }
  },
};

// -------------------------------------------------------------- 渲染 ----

function render(spec, root) {
  const cellW = (spec.cell && spec.cell.w) || 96;
  const cellH = (spec.cell && spec.cell.h) || 64;
  const n = spec.frames;
  if (!n) throw new SpecError('spec 缺少 frames');

  const cache = new Map();
  const ctx = {
    cellW,
    cellH,
    loadImage(ref) {
      const p = sourcePath(spec, ref, root);
      if (!cache.has(p)) {
        if (!fs.existsSync(p)) throw new SpecError(`找不到来源文件: ${p}`);
        // .aseprite 母版可以直接当来源用：转成同尺寸条带，copy/mirror 算子照常工作
        const img = isAseprite(p) ? asepriteToStrip(p) : readPNG(p);
        cache.set(p, img);
      }
      return cache.get(p);
    },
  };

  const rendered = new Map();
  const log = [];
  // 每个 output alias 对应的"逐帧单格画布"，写 .aseprite 时要一帧一个 cel
  const perFrame = new Map();

  for (const layer of spec.layers || []) {
    const strip = createCanvas(n * cellW, cellH);
    const cells = [];
    let opsCount = 0;
    for (const entry of layer.frames || []) {
      const canvas = createCanvas(cellW, cellH);
      for (const op of entry.ops || []) {
        const kind = op.op;
        if (!OPS[kind]) throw new SpecError(`未知算子 '${kind}'，可用: ${JSON.stringify(Object.keys(OPS).sort())}`);
        OPS[kind](canvas, spec, op, ctx);
        opsCount++;
      }
      const f = entry.frame;
      if (f < 0 || f >= n) throw new SpecError(`层 ${layer.name} 的 frame=${f} 超出 0..${n - 1}`);
      overwriteRegion(strip, canvas, 0, 0, cellW, cellH, f * cellW, 0);
      cells[f] = canvas;
    }
    rendered.set(layer.output, strip);
    perFrame.set(layer.output, cells);
    log.push(`  层 ${pad(layer.name, 10)} -> ${pad(layer.output, 24)} ${(layer.frames || []).length} 帧, ${opsCount} 个算子`);
  }

  for (const comp of spec.composites || []) {
    const canvas = createCanvas(n * cellW, cellH);
    const cells = [];
    for (const layerName of comp.layers) {
      const src = rendered.get(layerName);
      if (!src) throw new SpecError(`合成引用了不存在的层 '${layerName}'`);
      blendRegion(canvas, src, 0, 0, src.width, src.height, 0, 0);
    }
    // 合成层同样按帧拆开，每帧一个 96x64 画布
    for (let f = 0; f < n; f++) {
      const cell = createCanvas(cellW, cellH);
      overwriteRegion(cell, canvas, 0, 0, cellW, cellH, f * cellW, 0);
      cells[f] = cell;
    }
    rendered.set(comp.output, canvas);
    perFrame.set(comp.output, cells);
    log.push(`  合成 ${comp.layers.join(' + ')} -> ${comp.output}`);
  }

  return { rendered, perFrame, log, cellW, cellH, n };
}

function pad(s, width) {
  const str = String(s);
  let visual = 0;
  for (const ch of str) visual += ch.charCodeAt(0) > 0x2e80 ? 2 : 1;
  return str + ' '.repeat(Math.max(0, width - visual));
}

/** 渲染前的自检：帧数、尺寸、算子名、调色板名。 */
function validate(spec, result) {
  const problems = [];
  const wantW = result.n * result.cellW;
  const wantH = result.cellH;
  for (const [name, img] of result.rendered) {
    if (img.width !== wantW || img.height !== wantH) {
      problems.push(`${name} 尺寸 ${img.width}x${img.height} != ${wantW}x${wantH}`);
    }
  }
  for (const layer of spec.layers || []) {
    const got = (layer.frames || []).length;
    if (got !== result.n) problems.push(`层 ${layer.name} 只有 ${got} 帧，应为 ${result.n}`);
  }
  return problems;
}

function makePreview(spec, result, root, scale) {
  const names = [...result.rendered.keys()];
  const W = result.n * result.cellW;
  const H = names.length * result.cellH;
  const sheet = createCanvas(W, H);
  sheet.data.fill(0);
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 28;
    sheet.data[i + 1] = 30;
    sheet.data[i + 2] = 38;
    sheet.data[i + 3] = 255;
  }
  names.forEach((nm, i) => {
    const row = result.rendered.get(nm);
    for (let y = 0; y < row.height; y++) {
      for (let x = 0; x < row.width; x++) {
        const sOff = (y * row.width + x) * 4;
        const a = row.data[sOff + 3] / 255;
        const dOff = (i * result.cellH + y) * W + x;
        const dPix = dOff * 4;
        for (let c = 0; c < 3; c++) {
          sheet.data[dPix + c] = Math.round(row.data[sOff + c] * a + sheet.data[dPix + c] * (1 - a));
        }
        sheet.data[dPix + 3] = 255;
      }
    }
  });

  const sw = W * scale;
  const sh = H * scale;
  const out = createCanvas(sw, sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      sheet.data.copy(out.data, (y * sw + x) * 4, (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4, (Math.floor(y / scale) * W + Math.floor(x / scale)) * 4 + 4);
    }
  }
  const outPath = resolvePath(spec.preview || 'tmp/sprite_spec_preview.png', root);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  writePNG(outPath, sw, sh, out.data);
  return outPath;
}

// ---------------------------------------------------------------- CLI ----

function parseArgs(argv) {
  const args = { spec: null, check: false, preview: false, scale: 3, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--check') args.check = true;
    else if (a === '--preview') args.preview = true;
    else if (a === '--scale') args.scale = parseInt(argv[++i], 10) || 3;
    else if (a === '--root') args.root = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('--') && !args.spec) args.spec = a;
    else throw new SpecError(`无法识别的参数: ${a}`);
  }
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (e) {
    console.error(`参数错误：${e.message}`);
    return 1;
  }
  if (args.help || !args.spec) {
    console.log('用法: node sprite_spec.js <spec.json> [--check] [--preview] [--scale N] [--root DIR]');
    return args.help ? 0 : 1;
  }

  const specPath = path.isAbsolute(args.spec) ? args.spec : path.resolve(process.cwd(), args.spec);
  if (!fs.existsSync(specPath)) {
    console.error(`找不到 spec: ${specPath}`);
    return 1;
  }

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(specPath, 'utf8'));
  } catch (e) {
    console.error(`spec 不是合法 JSON: ${e.message}`);
    return 1;
  }

  const root = args.root
    ? path.resolve(process.cwd(), args.root)
    : spec.root
      ? path.resolve(path.dirname(specPath), spec.root)
      : path.dirname(specPath);

  console.log(`spec: ${path.basename(specPath)}   名称: ${spec.name || '?'}`);
  const cellW = (spec.cell && spec.cell.w) || 96;
  const cellH = (spec.cell && spec.cell.h) || 64;
  console.log(`帧 ${spec.frames} × ${cellW}×${cellH} = ${spec.frames * cellW}×${cellH}`);
  console.log(`调色板 ${Object.keys(spec.palette || {}).length} 色，来源 ${Object.keys(spec.sources || {}).length} 个文件`);

  let result;
  try {
    result = render(spec, root);
  } catch (e) {
    if (e instanceof SpecError) {
      console.error(`spec 错误：${e.message}`);
      return 1;
    }
    throw e;
  }
  result.log.forEach((l) => console.log(l));

  const problems = validate(spec, result);
  if (problems.length) {
    console.log('\n校验不通过：');
    problems.forEach((p) => console.log('  ✗', p));
    return 1;
  }
  console.log('\n✓ 尺寸与帧数校验通过');

  if (args.check) {
    console.log('--check，未写文件');
    return 0;
  }

  for (const [name, target] of Object.entries(spec.outputs || {})) {
    const img = result.rendered.get(name);
    if (!img) {
      console.error(`输出 '${name}' 没有对应层`);
      return 1;
    }
    const outPath = resolvePath(target, root);
    fs.mkdirSync(path.dirname(outPath),  { recursive: true });

    if (isAseprite(outPath)) {
      // .aseprite = 可编辑母版：每个 frame 一个 cel，图层名用层名
      const layerName = (spec.layers || []).find((l) => l.output === name)?.name || name;
      const cells = result.perFrame.get(name) || [];
      const frames = cells.map((cell, fi) => ({
        durationMs: spec.frame_duration || 100,
        layers: [{ name: layerName, rgba: cell.data, x: 0, y: 0 }],
      }));
      const info = writeAseprite(outPath, {
        width: result.cellW,
        height: result.cellH,
        frames,
        speed: spec.frame_duration || 100,
      });
      console.log(`  写出 ${outPath}  (aseprite: ${info.frames} 帧 × ${info.layers} 层, ${info.width}×${info.height})`);
      continue;
    }

    writePNG(outPath, img.width, img.height, img.data);
    console.log(`  写出 ${outPath}`);
  }

  // masters：把多个层合成"一个多图层 .aseprite 母版"（一层一个 cel，可直接在 Aseprite 里叠看）
  for (const master of spec.masters || []) {
    const aliases = master.layers || [];
    if (!aliases.length) {
      console.error(`masters 条目 '${master.output || '?'}' 没有指定 layers`);
      return 1;
    }
    const cells = aliases.map((alias) => {
      const arr = result.perFrame.get(alias);
      if (!arr) {
        console.error(`master 引用了不存在的层 '${alias}'`);
        return null;
      }
      const name = (spec.layers || []).find((l) => l.output === alias)?.name || alias;
      return { name, cells: arr };
    });
    if (cells.some((c) => !c)) return 1;
    const frames = [];
    for (let f = 0; f < result.n; f++) {
      frames.push({
        durationMs: spec.frame_duration || 100,
        // 顺序 = 下层在前（后写的层叠在上面）
        layers: cells.map((c) => ({ name: c.name, rgba: c.cells[f].data, x: 0, y: 0 })),
      });
    }
    const outPath = resolvePath(master.output, root);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const info = writeAseprite(outPath, {
      width: result.cellW,
      height: result.cellH,
      frames,
      speed: spec.frame_duration || 100,
    });
    console.log(`  写出 ${outPath}  (母版: ${info.frames} 帧 × ${info.layers} 层 [${cells.map((c) => c.name).join(', ')}], ${info.width}×${info.height})`);
  }

  if (args.preview) {
    const p = makePreview(spec, result, root, args.scale);
    console.log(`  对照图 ${p}`);
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(e.stack || String(e));
    process.exit(1);
  }
}

module.exports = { render, validate, getColor, OPS };
