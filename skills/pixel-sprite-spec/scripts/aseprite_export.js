'use strict';
/**
 * aseprite_export.js — 把 .aseprite 母版导出成 PNG 条带（进引擎用）
 *
 * 为什么要有这个：母版是 .aseprite（人能改），引擎要 PNG（机器读）。
 * 这一步纯 Node 实现，不依赖 LibreSprite / Aseprite 装没装。
 *
 * 用法:
 *   node aseprite_export.js <in.aseprite> <out.png> [--split] [--sheet-type horizontal|rows]
 *
 *   --split   每帧单独出一张 PNG（out_0.png, out_1.png, ...），而不是一条横带
 *   默认      出横向条带 PNG（帧数 × 单帧宽），和素材库里的 strip 约定一致
 */

const fs = require('fs');
const path = require('path');
const { writePNG } = require('./png.js');
const { readAseprite, blendCel } = require('./aseprite.js');

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) flags[key] = true;
      else { flags[key] = next; i++; }
    } else positional.push(a);
  }
  return { positional, flags };
}

/** 把某一帧的所有 cel 按图层顺序合成到画布上。 */
function composeFrame(frame, width, height) {
  const canvas = Buffer.alloc(width * height * 4);
  for (const cel of frame.cels) blendCel(canvas, width, height, cel);
  return canvas;
}

function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [input, output] = positional;
  if (!input || !output) {
    console.error('用法: node aseprite_export.js <in.aseprite> <out.png> [--split]');
    return 1;
  }
  if (!fs.existsSync(input)) {
    console.error(`找不到输入文件: ${input}`);
    return 1;
  }

  const doc = readAseprite(input);
  const { width, height, frames } = doc;

  if (flags.split) {
    const base = output.replace(/\.png$/i, '');
    frames.forEach((f, fi) => {
      const canvas = composeFrame(f, width, height);
      const p = `${base}_${fi}.png`;
      fs.mkdirSync(path.dirname(p), { recursive: true });
      writePNG(p, width, height, canvas);
      console.log(`  写出 ${p}`);
    });
  } else {
    const strip = Buffer.alloc(width * frames.length * height * 4);
    frames.forEach((f, fi) => {
      const canvas = composeFrame(f, width, height);
      for (let y = 0; y < height; y++) {
        const srcOff = y * width * 4;
        const dstOff = (y * width * frames.length + fi * width) * 4;
        canvas.copy(strip, dstOff, srcOff, srcOff + width * 4);
      }
    });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    writePNG(output, width * frames.length, height, strip);
    console.log(`  写出 ${output}  (${width * frames.length}×${height}, ${frames.length} 帧)`);
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

module.exports = { composeFrame };
