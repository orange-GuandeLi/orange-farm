'use strict';
/**
 * install.js — 把项目内的 skill 同步到 Mavis 运行时 skills 目录
 *
 * 为什么要这一步：Mavis 运行时只从 `activeDataDir/skills/` 加载 skill，
 * 项目里的 `skills/` 只是仓库文件，不会被自动加载。
 * 所以：项目内是「唯一真源」（进 git、可 review），运行时那份是「安装产物」。
 *
 * 用法:
 *   node skills/pixel-sprite-spec/install.js          # 同步本 skill
 *   node skills/pixel-sprite-spec/install.js --check  # 只检查差异，不写入
 *   node skills/pixel-sprite-spec/install.js --to <dir>   # 装到别处
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const SELF = __dirname;                                       // 项目内的 skill 根（本文件所在目录）
const DEFAULT_TARGET = path.join(os.homedir(), '.minimax', 'skills', 'pixel-sprite-spec');
// 备份不能放进 skills/ 目录——那里的每个子目录都会被加载器当成一个 skill 扫到
const BACKUP_DIR = path.join(os.homedir(), '.minimax', 'cache', 'skill-backups');

function parseArgs(argv) {
  const flags = {};
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') flags.check = true;
    else if (argv[i] === '--to') { flags.to = argv[++i]; }
    else positional.push(argv[i]);
  }
  return { flags, positional };
}

/** 列出目录下所有文件（相对路径），跳过 .git 等。 */
function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.DS_Store')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p));
  }
  return out;
}

function copyTree(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules' || e.name.startsWith('.DS_Store')) continue;
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyTree(s, d);
    else fs.copyFileSync(s, d);
  }
}

/** 清掉目标端多出来的文件（保证是镜像而不是叠加）。 */
function prune(target, keep) {
  if (!fs.existsSync(target)) return;
  for (const rel of listFiles(target)) {
    if (!keep.includes(rel)) fs.rmSync(path.join(target, rel));
  }
}

function main() {
  const { flags } = parseArgs(process.argv.slice(2));
  const target = flags.to ? path.resolve(flags.to) : DEFAULT_TARGET;

  const srcFiles = listFiles(SELF).sort();
  const tgtFiles = fs.existsSync(target) ? listFiles(target).sort() : [];

  const diffs = [];
  for (const rel of srcFiles) {
    const s = path.join(SELF, rel);
    const t = path.join(target, rel);
    if (!fs.existsSync(t)) { diffs.push(`  + ${rel} (目标缺失)`); continue; }
    if (!fs.readFileSync(s).equals(fs.readFileSync(t))) diffs.push(`  ~ ${rel} (内容不同)`);
  }
  for (const rel of tgtFiles) {
    if (!srcFiles.includes(rel)) diffs.push(`  - ${rel} (目标多出)`);
  }

  console.log(`源   : ${SELF}`);
  console.log(`目标 : ${target}`);
  console.log(`文件 : 源 ${srcFiles.length} 个 / 目标 ${tgtFiles.length} 个`);

  if (!diffs.length) {
    console.log('\n✓ 已同步，无需改动');
    return 0;
  }
  console.log('\n差异:');
  diffs.forEach((d) => console.log(d));

  if (flags.check) {
    console.log('\n--check 模式，未写入');
    return 0;
  }

  // 备份旧版本再覆盖，方便回退（备份放在 skills/ 之外，避免被加载器扫到）
  if (fs.existsSync(target)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const bak = path.join(BACKUP_DIR, `pixel-sprite-spec.bak-${Date.now()}`);
    fs.renameSync(target, bak);
    console.log(`\n旧版本已备份到: ${bak}`);
  }
  copyTree(SELF, target);
  prune(target, srcFiles);

  // 复核
  const after = listFiles(target).sort();
  let ok = after.length === srcFiles.length;
  for (const rel of srcFiles) {
    const s = path.join(SELF, rel);
    const t = path.join(target, rel);
    if (!fs.existsSync(t) || !fs.readFileSync(s).equals(fs.readFileSync(t))) { ok = false; break; }
  }
  console.log(ok ? `\n✓ 已同步到 ${target}（${after.length} 个文件，逐字节校验通过）`
                  : `\n✗ 同步后校验不一致`);
  return ok ? 0 : 1;
}

if (require.main === module) process.exit(main());

module.exports = { listFiles, copyTree };
