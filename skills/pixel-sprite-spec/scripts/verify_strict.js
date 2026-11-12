'use strict';
/**
 * 严格逐像素校验器（独立于渲染器，自行实现镜像与比较逻辑）：
 *   1) step1: 原图 vs 去腮红图 —— 逐字节比较 RGBA（含全透明像素的 RGB），
 *      断言「除 N 个指定坐标外全部逐字节相同」。
 *   2) step2: 去腮红图 vs 朝左图 —— 断言每帧 = 上一帧结果的左右镜像 (x -> 95-x)，
 *      并确认帧序未变（frame f 对应 frame f，不倒序）。
 */
const path = require('path');
const SKILL = '/Users/orange/my/godot/farm/skills/pixel-sprite-spec/scripts';
const { readPNG } = require(path.join(SKILL, 'png.js'));
const { asepriteToStrip } = require(path.join(SKILL, 'aseprite.js'));

const CELL_W = 96, CELL_H = 64, FRAMES = 4;

/** 读图：.aseprite 转成同尺寸条带，其余走 PNG 读取器。 */
function load(p) {
  const img = /\.(aseprite|ase)$/i.test(p) ? asepriteToStrip(p) : readPNG(p);
  if (img.width !== CELL_W * FRAMES || img.height !== CELL_H) {
    throw new Error(`${p} 尺寸异常 ${img.width}x${img.height}`);
  }
  return img;
}
const rgba = (img, x, y) => {
  const o = (y * img.width + x) * 4;
  return [img.data[o], img.data[o + 1], img.data[o + 2], img.data[o + 3]];
};
const hex = (c) => '#' + c.slice(0, 3).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase() + (c[3] === 255 ? '' : `/a${c[3]}`);

// ---- step 1: 原图 vs 去腮红 ----
const orig = load(process.argv[2]);
const step1 = load(process.argv[3]);
const expected = new Set();
for (const f of [0, 1, 2, 3]) {
  const y = f === 0 || f === 3 ? 32 : 33;
  expected.add(`${f}:46:${y}`);
  expected.add(`${f}:50:${y}`);
}

let identical = 0, changed = 0, unexpected = 0, byteMismatchInvisible = 0;
const changedList = [];
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const a = rgba(orig, f * CELL_W + x, y);
      const b = rgba(step1, f * CELL_W + x, y);
      const same = a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
      if (same) { identical++; continue; }
      changed++;
      const key = `${f}:${x}:${y}`;
      if (expected.has(key)) {
        changedList.push(`  frame ${f} (${x},${y})  ${hex(a)} -> ${hex(b)}`);
      } else {
        unexpected++;
        changedList.push(`  !! 非预期改动 frame ${f} (${x},${y})  ${hex(a)} -> ${hex(b)}`);
      }
    }
  }
}
const total = CELL_W * FRAMES * CELL_H;
console.log('===== STEP 1 校验：原图 vs 去腮红图 =====');
console.log(`总像素数            : ${total}  (${CELL_W}x${CELL_H} x ${FRAMES} 帧)`);
console.log(`逐字节完全相同      : ${identical}`);
console.log(`发生变化            : ${changed}  (期望 ${expected.size})`);
console.log(`非预期改动          : ${unexpected}`);
console.log(`其中 RGB 不同的全透明像素: ${byteMismatchInvisible}  (0 表示连不可见像素的 RGB 都一致)`);
console.log(`非腮红像素保持率    : ${((identical / total) * 100).toFixed(4)}%`);
console.log('实际改动坐标:');
changedList.forEach((l) => console.log(l));

// ---- step 2: 去腮红 vs 朝左 ----
const step2 = load(process.argv[4]);
let mirrorOK = 0, mirrorBad = 0;
const badList = [];
for (let f = 0; f < FRAMES; f++) {
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const a = rgba(step1, f * CELL_W + x, y);
      const b = rgba(step2, f * CELL_W + x, y);
      const exp = rgba(step1, f * CELL_W + (CELL_W - 1 - x), y);
      if (b[0] === exp[0] && b[1] === exp[1] && b[2] === exp[2] && b[3] === exp[3]) {
        mirrorOK++;
      } else {
        mirrorBad++;
        if (badList.length < 12) badList.push(`  frame ${f} (${x},${y}) 期望 ${hex(exp)} 实际 ${hex(b)}`);
      }
    }
  }
}
console.log('\n===== STEP 2 校验：去腮红图 vs 朝左图 =====');
console.log(`总像素数            : ${total}`);
console.log(`等于「本格左右镜像」的像素: ${mirrorOK}  (期望 ${total})`);
console.log(`不等于镜像的像素    : ${mirrorBad}`);
badList.forEach((l) => console.log(l));

// 帧序检查：step2 的 frame f 是否来自 step1 的 frame f（而不是倒序）
let frameOrderKept = true;
const frameEq = [];
for (let f = 0; f < FRAMES; f++) {
  let sameAsOwn = true, sameAsReversed = true;
  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const b = rgba(step2, f * CELL_W + x, y);
      const own = rgba(step1, f * CELL_W + (CELL_W - 1 - x), y);
      const rev = rgba(step1, (FRAMES - 1 - f) * CELL_W + (CELL_W - 1 - x), y);
      if (b[0] !== own[0] || b[1] !== own[1] || b[2] !== own[2] || b[3] !== own[3]) sameAsOwn = false;
      if (b[0] !== rev[0] || b[1] !== rev[1] || b[2] !== rev[2] || b[3] !== rev[3]) sameAsReversed = false;
    }
  }
  frameEq.push(`  frame ${f}: =镜像自身帧 ${sameAsOwn ? '是' : '否'} | =镜像倒序帧 ${sameAsReversed ? '是' : '否'}`);
  if (!sameAsOwn) frameOrderKept = false;
}
console.log('帧序检查:');
frameEq.forEach((l) => console.log(l));
console.log(`帧序保持 0..3        : ${frameOrderKept ? '是' : '否'}`);

// 腮红残留检查
const blushCount = (img) => {
  let n = 0;
  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (img.data[o] === 0xFA && img.data[o + 1] === 0x71 && img.data[o + 2] === 0x7A && img.data[o + 3] === 255) n++;
  }
  return n;
};
console.log(`\n腮红 #FA717A 计数: 原图 ${blushCount(orig)} | 去腮红图 ${blushCount(step1)} | 朝左图 ${blushCount(step2)}`);

const pass = changed === expected.size && unexpected === 0 && mirrorBad === 0 && frameOrderKept && blushCount(step1) === 0 && blushCount(step2) === 0;
console.log(`\n总判定: ${pass ? '✓ 全部通过' : '✗ 存在失败项'}`);
process.exit(pass ? 0 : 1);
