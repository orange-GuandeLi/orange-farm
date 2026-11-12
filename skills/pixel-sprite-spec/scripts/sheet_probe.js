'use strict';
/**
 * sheet_probe.js — 像素精灵参考图的测量与逐像素校验工具
 *
 * 目标：把"我要改哪几个像素"从肉眼猜测变成可复现的数字。
 *   info   量尺寸 / 帧网格 / 每帧 bbox / 调色板
 *   diff   两张图逐帧逐像素比对，给出变化数量与颜色转移表（可 --expect 断言）
 *   find   按颜色定位像素，可选连通块 bbox
 *   ascii  把某一帧打成 ASCII 图 + 颜色对照表（看局部精确结构）
 *
 * 用法
 *   node sheet_probe.js info  <png>
 *   node sheet_probe.js diff  <a.png> <b.png> [--cell 96x64] [--expect N] [--list N]
 *   node sheet_probe.js find  <png> <#RRGGBB> [--cell 96x64] [--components]
 *   node sheet_probe.js ascii <png> <frame> [--cell 96x64] [--crop x,y,w,h]
 */

const { readPNG } = require('./png.js');
const { asepriteToStrip } = require('./aseprite.js');

/**
 * 读图：.aseprite / .ase 转成同尺寸横向条带，其余走 PNG 读取器。
 * 这样 diff / find / ascii 对可编辑母版和导出 PNG 一视同仁。
 */
function readImage(file) {
  if (/\.(aseprite|ase)$/i.test(file)) return asepriteToStrip(file);
  return readPNG(file);
}

const ASCII_CHARS = '.#Oox*+-=~ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';

// ------------------------------------------------------------- 基础工具 ----

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else {
        flags[key] = next;
        i++;
      }
    } else positional.push(a);
  }
  return { positional, flags };
}

function parseCell(text) {
  const m = /^(\d+)\s*[x×,\s]\s*(\d+)$/.exec(String(text).trim());
  if (!m) throw new Error(`--cell 格式应为 WxH，例如 --cell 96x64（收到 ${text}）`);
  return { w: parseInt(m[1], 10), h: parseInt(m[2], 10) };
}

function hex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function parseColor(text) {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(String(text).trim());
  if (!m) throw new Error(`颜色格式应为 #RRGGBB（收到 ${text}）`);
  const h = m[1];
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function px(img, x, y) {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
}

/**
 * 探测帧网格：找"列剖面"的周期。
 *
 * 信号一：列剖面相关 —— c[x] = 第 x 列的非透明像素数。真正的帧宽让每帧图案精确对齐，
 *        得分用 min/max 软 IoU（对帧内小幅位移不敏感）。
 * 信号二：边界穿越惩罚 —— 候选帧宽若让内容压在格子边界上（x % P 为 0 或 P-1 的列有内容），
 *        说明这个周期切错了格子，直接降权。
 *
 * 两者相乘后取最高分；同分取最小 P（更细的格子优先）。
 * 探测不准时用 --cell 显式指定，info 会打印候选值供核对。
 */
function detectGrid(img) {
  const W = img.width;
  const col = new Float64Array(W);
  const occ = new Uint8Array(W);
  let occTotal = 0;
  for (let x = 0; x < W; x++) {
    let n = 0;
    for (let y = 0; y < img.height; y++) if (img.data[(y * W + x) * 4 + 3] > 0) n++;
    col[x] = n;
    if (n > 0) {
      occ[x] = 1;
      occTotal++;
    }
  }

  const scored = [];
  for (let p = 2; p <= W; p++) {
    if (W % p !== 0) continue;
    let num = 0;
    let den = 0;
    for (let x = 0; x + p < W; x++) {
      num += Math.min(col[x], col[x + p]);
      den += Math.max(col[x], col[x + p]);
    }
    const iou = den ? num / den : 0;
    let cross = 0;
    for (let x = 0; x < W; x++) if (occ[x] && (x % p === 0 || x % p === p - 1)) cross++;
    const score = iou * (1 - cross / Math.max(1, occTotal));
    scored.push({ p, score, iou, cross });
  }
  if (!scored.length) return { cellW: W, frames: 1, score: 0, detected: false, candidates: [] };

  scored.sort((a, b) => (b.score - a.score) || (a.p - b.p));
  const best = scored[0];
  return {
    cellW: best.p,
    frames: W / best.p,
    score: best.score,
    detected: true,
    candidates: scored.slice(0, 3).map((s) => `P=${s.p}(${s.score.toFixed(2)})`),
  };
}

function resolveGrid(img, flags) {
  if (flags.cell) {
    const cell = parseCell(flags.cell);
    return { cellW: cell.w, cellH: cell.h, frames: Math.max(1, Math.floor(img.width / cell.w)), source: '指定', candidates: [], score: 1 };
  }
  const g = detectGrid(img);
  return { cellW: g.cellW, cellH: img.height, frames: g.frames, source: g.detected ? '自动探测' : '兜底', candidates: g.candidates, score: g.score };
}

// ----------------------------------------------------------------- info ----

function cmdInfo(positional, flags) {
  const file = positional[0];
  if (!file) throw new Error('用法: node sheet_probe.js info <png>');
  const img = readImage(file);
  const grid = resolveGrid(img, flags);

  console.log(`文件: ${file}`);
  console.log(`尺寸: ${img.width}×${img.height}`);
  console.log(
    `帧网格: ${grid.cellW}×${grid.cellH} × ${grid.frames} 帧 (${grid.source}` +
      (grid.candidates && grid.candidates.length ? `，候选 ${grid.candidates.join(' ')}` : '') +
      '，--cell 可强制指定)'
  );

  const palette = new Map();
  let transparent = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (img.data[o + 3] === 0) {
      transparent++;
      continue;
    }
    const key = hex(img.data[o], img.data[o + 1], img.data[o + 2]);
    palette.set(key, (palette.get(key) || 0) + 1);
  }

  console.log('\n每帧可见范围:');
  for (let f = 0; f < grid.frames; f++) {
    const x0 = f * grid.cellW;
    const x1 = Math.min(img.width, x0 + grid.cellW);
    let minX = -1;
    let minY = -1;
    let maxX = -1;
    let maxY = -1;
    let count = 0;
    for (let y = 0; y < grid.cellH; y++) {
      for (let x = x0; x < x1; x++) {
        if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
        count++;
        if (minX < 0) minX = x;
        maxX = x;
        if (minY < 0) minY = y;
        maxY = y;
      }
    }
    const localX0 = minX < 0 ? 0 : minX - x0;
    const localX1 = maxX < 0 ? 0 : maxX - x0;
    const bbox = count ? `x${localX0}..${localX1} y${minY}..${maxY}` : '空帧';
    console.log(`  frame ${String(f).padStart(2)}  ${bbox.padEnd(22)} 非透明像素 ${count}`);
  }

  const sorted = [...palette.entries()].sort((a, b) => b[1] - a[1]);
  const top = flags.top ? parseInt(flags.top, 10) : 16;
  console.log(`\n调色板 (共 ${palette.size} 色，显示前 ${Math.min(top, palette.size)}):`);
  for (const [c, n] of sorted.slice(0, top)) console.log(`  ${c}  ${n}`);
  console.log(`  (透明像素 ${transparent})`);
  return 0;
}

// ----------------------------------------------------------------- diff ----

function cmdDiff(positional, flags) {
  const [fileA, fileB] = positional;
  if (!fileA || !fileB) throw new Error('用法: node sheet_probe.js diff <a.png> <b.png>');
  const a = readImage(fileA);
  const b = readImage(fileB);
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(`两张图尺寸不同: ${a.width}×${a.height} vs ${b.width}×${b.height}`);
  }
  const grid = resolveGrid(a, flags);

  console.log(`差异: ${fileA} → ${fileB}`);
  console.log(`尺寸: ${a.width}×${a.height}   帧网格: ${grid.cellW}×${grid.cellH} × ${grid.frames} 帧`);

  const transitions = new Map();
  let total = 0;
  let invisibleOnly = 0;
  let unchanged = 0;
  const strict = !!flags.strict;
  const perFrame = [];
  const listed = [];
  const listLimit = flags.list ? parseInt(flags.list, 10) : 0;

  for (let f = 0; f < grid.frames; f++) {
    const x0 = f * grid.cellW;
    const x1 = Math.min(a.width, x0 + grid.cellW);
    let frameChanged = 0;
    for (let y = 0; y < grid.cellH; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * a.width + x) * 4;
        const aAlpha = a.data[o + 3];
        const bAlpha = b.data[o + 3];
        const rgbSame =
          a.data[o] === b.data[o] && a.data[o + 1] === b.data[o + 1] && a.data[o + 2] === b.data[o + 2];
        if (aAlpha === 0 && bAlpha === 0) {
          // 两边都不可见：画面上没区别
          if (!rgbSame) {
            invisibleOnly++;
            if (strict) {
              frameChanged++;
              total++;
              const key = `${hex(a.data[o], a.data[o + 1], a.data[o + 2])} (透明) → ${hex(b.data[o], b.data[o + 1], b.data[o + 2])} (透明)`;
              transitions.set(key, (transitions.get(key) || 0) + 1);
              if (listed.length < listLimit) listed.push(`  frame ${f} (${x - x0},${y}): ${key}`);
            }
          } else unchanged++;
          continue;
        }
        const same = rgbSame && aAlpha === bAlpha;
        if (same) {
          unchanged++;
          continue;
        }
        frameChanged++;
        total++;
        const from = hex(a.data[o], a.data[o + 1], a.data[o + 2]) + (aAlpha === 0 ? ' (透明)' : '');
        const to = hex(b.data[o], b.data[o + 1], b.data[o + 2]) + (bAlpha === 0 ? ' (透明)' : '');
        const key = `${from} → ${to}`;
        transitions.set(key, (transitions.get(key) || 0) + 1);
        if (listed.length < listLimit) listed.push(`  frame ${f} (${x - x0},${y}): ${from} → ${to}`);
      }
    }
    perFrame.push(frameChanged);
  }

  console.log('\n逐帧变化像素:');
  perFrame.forEach((n, f) => console.log(`  frame ${String(f).padStart(2)}  ${n}`));
  console.log(`\n合计变化像素: ${total}`);
  console.log(`未变化像素: ${unchanged}`);
  if (invisibleOnly) console.log(`（另有 ${invisibleOnly} 个双方都全透明的像素 RGB 不同，画面上看不出来${strict ? '，--strict 下已计入变化' : ''}）`);

  const sorted = [...transitions.entries()].sort((x, y) => y[1] - x[1]);
  console.log(`\n颜色转移 (共 ${sorted.length} 种，显示前 20):`);
  for (const [k, n] of sorted.slice(0, 20)) console.log(`  ${k}  ${n}`);

  if (listLimit > 0) {
    console.log(`\n变化像素坐标 (最多 ${listLimit} 条):`);
    listed.forEach((l) => console.log(l));
  }

  if (flags.expect !== undefined) {
    const want = parseInt(flags.expect, 10);
    if (total === want) {
      console.log(`\n✓ 变化像素数符合期望: ${total}`);
    } else {
      console.error(`\n✗ 变化像素数不符: 实际 ${total}，期望 ${want}`);
      return 1;
    }
  }
  return 0;
}

// ----------------------------------------------------------------- find ----

function cmdFind(positional, flags) {
  const [file, colorText] = positional;
  if (!file || !colorText) throw new Error('用法: node sheet_probe.js find <png> <#RRGGBB>');
  const img = readImage(file);
  const grid = resolveGrid(img, flags);
  const [r, g, b] = parseColor(colorText);
  const want = hex(r, g, b);

  const hits = [];
  for (let f = 0; f < grid.frames; f++) {
    const x0 = f * grid.cellW;
    const x1 = Math.min(img.width, x0 + grid.cellW);
    for (let y = 0; y < grid.cellH; y++) {
      for (let x = x0; x < x1; x++) {
        const p = px(img, x, y);
        if (p[0] === r && p[1] === g && p[2] === b) hits.push({ f, x: x - x0, y, gx: x });
      }
    }
  }

  console.log(`颜色 ${want} 在 ${file} 中出现 ${hits.length} 次`);

  const byFrame = new Map();
  for (const h of hits) {
    if (!byFrame.has(h.f)) byFrame.set(h.f, []);
    byFrame.get(h.f).push(h);
  }

  // 连通块（8 邻接）：先给每帧的块 bbox 和大小
  console.log('\n连通块 (8 邻接):');
  for (const [f, list] of byFrame) {
    const set = new Set(list.map((h) => `${h.gx},${h.y}`));
    const seen = new Set();
    const comps = [];
    for (const h of list) {
      const key = `${h.gx},${h.y}`;
      if (seen.has(key)) continue;
      const stack = [h];
      seen.add(key);
      const comp = [];
      while (stack.length) {
        const cur = stack.pop();
        comp.push(cur);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nk = `${cur.gx + dx},${cur.y + dy}`;
            if (set.has(nk) && !seen.has(nk)) {
              seen.add(nk);
              stack.push({ gx: cur.gx + dx, y: cur.y + dy, f, x: cur.gx + dx - f * grid.cellW });
            }
          }
        }
      }
      comps.push(comp);
    }
    comps.sort((p, q) => q.length - p.length);
    for (const comp of comps) {
      const xs = comp.map((c) => c.x);
      const ys = comp.map((c) => c.y);
      console.log(
        `  frame ${String(f).padStart(2)}  ${String(comp.length).padStart(4)} px  bbox x${Math.min(...xs)}..${Math.max(...xs)} y${Math.min(...ys)}..${Math.max(...ys)}`
      );
    }
  }

  // 坐标清单（帧内坐标），直接抄进 spec 的 fill 算子
  const limit = flags.limit ? parseInt(flags.limit, 10) : 200;
  console.log(`\n坐标 (帧内坐标，最多显示 ${limit} 条):`);
  for (const h of hits.slice(0, limit)) console.log(`  frame ${String(h.f).padStart(2)}  (${h.x},${h.y})`);
  if (hits.length > limit) console.log(`  ... 其余 ${hits.length - limit} 条省略`);
  return 0;
}

// ---------------------------------------------------------------- ascii ----

function cmdAscii(positional, flags) {
  const [file, frameText] = positional;
  if (!file || frameText === undefined) throw new Error('用法: node sheet_probe.js ascii <png> <frame>');
  const img = readImage(file);
  const grid = resolveGrid(img, flags);
  const frame = parseInt(frameText, 10);
  if (Number.isNaN(frame) || frame < 0 || frame >= grid.frames) {
    throw new Error(`帧号越界: ${frame}（共 ${grid.frames} 帧）`);
  }

  let cx = 0;
  let cy = 0;
  let cw = grid.cellW;
  let ch = grid.cellH;
  if (flags.crop) {
    const parts = String(flags.crop).split(',').map((v) => parseInt(v, 10));
    if (parts.length !== 4 || parts.some(Number.isNaN)) throw new Error('--crop 格式应为 x,y,w,h');
    [cx, cy, cw, ch] = parts;
  }

  const x0 = frame * grid.cellW + cx;
  console.log(`帧 ${frame} (${file})  区域 x${cx}..${cx + cw - 1} y${cy}..${cy + ch - 1}`);

  const legend = new Map();
  const rows = [];
  const hexRows = [];
  for (let y = 0; y < ch; y++) {
    let line = '';
    let hexLine = [];
    for (let x = 0; x < cw; x++) {
      const gx = x0 + x;
      if (gx >= img.width || cy + y >= img.height) {
        line += '!';
        hexLine.push('!');
        continue;
      }
      const p = px(img, gx, cy + y);
      if (p[3] === 0) {
        line += '.';
        hexLine.push('--------');
        continue;
      }
      const key = hex(p[0], p[1], p[2]);
      if (!legend.has(key)) legend.set(key, ASCII_CHARS[legend.size + 1] || '?');
      line += legend.get(key);
      hexLine.push(key);
    }
    rows.push(line);
    if (flags.hex) hexRows.push({ y: cy + y, cells: hexLine });
  }
  rows.forEach((r, i) => console.log(`  ${String(cy + i).padStart(3)} ${r}`));

  if (flags.hex) {
    console.log('\n精确值 (每格一个 #RRGGBB，透明用 --------):');
    for (const r of hexRows) console.log(`  ${String(r.y).padStart(3)} ${r.cells.join(' ')}`);
  }

  console.log('\n颜色对照:');
  console.log('  .  透明');
  for (const [c, ch2] of legend) console.log(`  ${ch2}  ${c}`);
  return 0;
}

// ----------------------------------------------------------------- CLI ----

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const cmd = positional.shift();
  if (flags.help) {
    console.log('用法:');
    console.log('  node sheet_probe.js info  <png> [--cell WxH] [--top N]');
    console.log('  node sheet_probe.js diff  <a.png> <b.png> [--cell WxH] [--expect N] [--list N]');
    console.log('  node sheet_probe.js find  <png> <#RRGGBB> [--cell WxH] [--components] [--limit N]');
    console.log('  node sheet_probe.js ascii <png> <frame> [--cell WxH] [--crop x,y,w,h]');
    return 0;
  }
  if (!cmd) {
    console.log('用法: node sheet_probe.js <info|diff|find|ascii> ...（加 --help 看详细参数）');
    return 1;
  }
  if (cmd === 'info') return cmdInfo(positional, flags);
  if (cmd === 'diff') return cmdDiff(positional, flags);
  if (cmd === 'find') return cmdFind(positional, flags);
  if (cmd === 'ascii') return cmdAscii(positional, flags);
  console.error(`未知子命令: ${cmd}`);
  return 1;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    console.error(`错误：${e.message}`);
    process.exit(1);
  }
}

module.exports = { detectGrid };
