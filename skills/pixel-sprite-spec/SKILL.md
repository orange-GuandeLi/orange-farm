---
name: pixel-sprite-spec
description: |
  把"参考图 + 需求"变成像素级精确的新精灵图：先测量参考图（帧网格、调色板、锚点），
  再写一份声明式 spec（颜色 / 色块 / 来源文件），用通用渲染器出 PNG，最后逐像素校验。
  Use when the user supplies a reference sprite sheet / spritesheet / PNG strip and asks
  for a pixel-exact variant of it — new facing direction, recolor, extra hair or hat layer,
  mirrored side view, a new action's frame set, or an exact remake of an existing asset.
  触发语："参考图 + 需求出图"、"像素级复刻"、"照着这个改"、"改成朝上/朝左"、"换发色"、
  "做一版朝下的"、"sprite sheet 改朝向"、"pixel-exact sprite"、"像素对齐"。
  Do NOT use for freehand / artistic image generation (用图片模型做，不要用本 skill)、
  非像素风的普通位图编辑、或"把图接进引擎 / 做动画曲线"这类引擎侧工作。
---

# Pixel Sprite Spec

参考图 → spec → 渲染 → 逐像素校验。这条流水线的价值在于**确定性**：同一份 spec 永远渲染出同一个 PNG，
每个改动都落在具体坐标上，不会出现"这次对、下次偏一像素"。

脚本在本 skill 目录的 `scripts/` 下（本项目内路径 `skills/pixel-sprite-spec/scripts/`；
若装在别处，用加载 skill 时 `Location:` 头里的目录替换）。**一律用绝对路径调用**，避免猜错路径：

> **改完本目录要同步到运行时**：Mavis 只从 `activeDataDir/skills/`（即 `~/.minimax/skills/`）加载 skill，
> 项目里的 `skills/` 只是仓库文件、不会被自动加载。改完跑一次
> `node skills/pixel-sprite-spec/install.js`（`--check` 只看差异不写入），
> 旧版本会自动备份到 `~/.minimax/cache/skill-backups/`。

| 命令 | 干什么 | 什么时候用 |
|---|---|---|
| `node $SKILL/scripts/sheet_probe.js info <png>` | 尺寸、帧网格、每帧 bbox、调色板计数 | 每次开工第一步 |
| `node $SKILL/scripts/sheet_probe.js diff <a> <b> [--expect N] [--list N] [--strict]` | 逐帧逐像素比对：变化数、颜色转移表、未变化数 | 验收；`--expect` 不符直接退出码 1 |
| `node $SKILL/scripts/sheet_probe.js find <png> '#RRGGBB'` | 该颜色的全部像素 + 连通块 bbox + 帧内坐标 | 定位要改的色块，坐标可直接抄进 spec |
| `node $SKILL/scripts/sheet_probe.js ascii <png> <frame> [--crop x,y,w,h] [--hex]` | 把某帧局部打成 ASCII 图（`--hex` 给精确十六进制） | 看局部结构、确认颜色 |
| `node $SKILL/scripts/sprite_spec.js <spec.json> [--check] [--preview]` | 按 spec 渲染（输出 PNG 或 .aseprite，看扩展名） | 出图；`--check` 只校验 |
| `node $SKILL/scripts/aseprite_export.js <in.aseprite> <out.png> [--split]` | .aseprite 母版 → PNG 条带（纯 Node，不依赖 Aseprite） | 母版改完要进引擎时 |
| `node $SKILL/scripts/verify_strict.js <原图> <产物1> <产物2>` | 严格逐字节 RGBA 比对（含全透明像素的 RGB） | 要"其余像素一个没动"的硬证据时 |

`$SKILL` 指 skill 自己的目录。这五个子命令已经覆盖"测量→定位→校验"的全部动作，
**先查这张表再决定要不要自己写脚本**——重复造一个只会做这一件事的脚本，正是这条流水线要消灭的东西。

## Inputs to collect

动手前必须明确三件事，缺哪件就问哪件（能从上下文推断就不要打断用户）：

- **参考图**：本地路径还是聊天附件？附件要先落到磁盘再处理。
- **要改什么**：朝向、配色、增删图层、镜像、抽帧，还是"照着另一张改"。用户说"照着这个改"时，
  一定要问清楚是"照着这张的画风改"还是"逐像素对齐这张"。
- **产物放哪**：默认写到工作区临时目录；覆盖用户原素材前先确认。

## Procedure

1. **测量参考图，不靠肉眼猜**

   ```bash
   node <skill目录>/scripts/sheet_probe.js info <参考图.png>
   ```

   输出：尺寸、帧网格（帧宽×帧高×帧数）、每帧可见 bbox、调色板计数。
   帧网格是启发式探测出来的，若 top-2 候选分数接近就用 `--cell 96x64` 显式指定。

   为什么要先量：帧宽错 1 像素，后面每一帧都错位，而错位在缩略图上看不出来。
   帧数也要先确认——条带可能只有 1 帧（不是动画）。

2. **确定"到底要改哪些像素"**

   最省力也最可靠的办法是找一张**同族参考**（同角色 / 同动作的另一个朝向或另一个版本）。
   先在素材目录和已有 spec 里搜一遍（`grep` 文件名、看 `tools/specs/`、`docs/` 里有没有现成的换色规则），
   找到了直接 diff：

   ```bash
   node $SKILL/scripts/sheet_probe.js diff <同族参考.png> <目标素材.png> --list 40
   ```

   输出会直接给出"哪些坐标、从什么色变成什么色、每帧改了几像素"。
   朝向变体这类需求通常和已有版本只差几十个像素，diff 一下就拿到了完整改动清单，
   不需要重新目测。

   没有同族参考时，用颜色定位 + 局部 ASCII 看结构：

   ```bash
   node $SKILL/scripts/sheet_probe.js find <png> '#E8AD7D'    # 连通块 bbox + 帧内坐标
   node $SKILL/scripts/sheet_probe.js ascii <png> 3 --crop 42,22,14,18   # 看局部
   node $SKILL/scripts/sheet_probe.js ascii <png> 3 --crop 42,22,14,18 --hex  # 要精确十六进制时
   ```

3. **写 spec：把"改哪里、改成什么色"逐条写死**

   spec 是一个 JSON，描述来源文件、颜色名、逐帧的算子序列。它是这次交付里最重要的产物——
   用户之后改需求时，只要改 spec 再重跑渲染器，不用重新分析素材。

   完整 schema、算子语义见 `references/spec-format.md`；测量的具体手法见
   `references/measurement-playbook.md`。算子速查：

   | 算子 | 作用 |
   |---|---|
   | `copy` | 从另一张图贴一块过来（换朝向、贴后脑、换图层） |
   | `fill` | 填一个矩形色块（改单个像素群） |
   | `clear` | 把矩形擦成透明（覆盖写，不是混合） |
   | `remap` | 按颜色整体替换（换发色、换衣服色） |
   | `brush` | 在 spec 里直接画 ASCII 像素（新增道具/特效） |
   | `mirror` | 左右 / 上下镜像（做朝左、朝右版本） |

   两条硬要求：
   - **所有坐标必须来自上一步的实测输出**，不能凭印象写。写错了渲染器不会报错，只会让画面不对。
   - **颜色集中在 `palette` 里**并用名字引用；这样"换一版配色"只改 palette 一处。

4. **渲染**

   ```bash
   node $SKILL/scripts/sprite_spec.js <spec.json> --check      # 先校验：帧数、尺寸、算子合法性
   node $SKILL/scripts/sprite_spec.js <spec.json> --preview    # 再出图，额外给一张对照图
   ```

   `--check` 通过再真渲染。渲染是纯确定性的，spec 不动就重跑结果不变。

   **输出格式由 `outputs` 里的扩展名决定**：

   | 输出路径 | 产出 | 用途 |
   |---|---|---|
   | `*.png` | 横向条带 PNG（帧数 × cell.w 宽） | 进引擎 / 贴图 |
   | `*.aseprite` / `*.ase` | Aseprite/LibreSprite 工程（每帧一个 cel，图层名 = 层名） | **可编辑母版**，人接手后还能改 |

   要交付"还能改改"的版本就写 `.aseprite` 后缀；`.aseprite` 也可以当**输入**用
   （`copy` / `mirror` 算子直接吃它），所以流程可以是：母版在 Aseprite 里改 →
   导出 PNG → 再用 spec 生成变体。

5. **逐像素校验，用数字验收**

   ```bash
   node $SKILL/scripts/sheet_probe.js diff <原图.png> <产物.png> --expect 117
   ```

   数字对不上就看"颜色转移"表：哪一类改多了、哪一类漏了，一目了然。
   diff 同时给出"未变化像素数"，两个数加起来等于总像素数，就是"其余全部一致"的证据。
   双方都全透明但 RGB 不同的像素默认不计入变化（画面上看不出来）；需要逐字节严格比对时加 `--strict`。

   另外用 `find` 确认**必须原样保留的部分**没被动（例如特效残影、地面土块的颜色计数）。

   为什么要数字验收：像素级需求里"看起来对"不算对。改动像素总数就是验收标准。

   `.aseprite` 产物也可以直接 `diff`（probe 会自动把母版转成同尺寸条带比对）。

6. **交付**

   给用户三样东西：渲染出的产物（PNG 条带 / `.aseprite` 母版）、spec 文件、
   以及一份说明（改了哪些像素、保留了什么、怎么接进引擎/动画）。产物默认不覆盖原素材。

## 为什么要 spec + 渲染器，而不是直接写脚本改图

一次性的"改图脚本"只能做那一次的事；需求一变就得重新分析素材。
spec 是可读可 diff 的画稿，渲染器是通用引擎：同一个渲染器能画朝向变体、配色变体、
新增图层、镜像版本，只换 spec 不换工具。

另外，**像素级精确的活儿不要交给图片模型**：实测生成模型做不到帧数正确（13 帧只出 11/12 帧）、
画布比例受限（19.5:1 的条带超出参考图比例上限）、背景不是透明而是纯黑、
跨帧一致性也没有保证。确定性改写没有这些问题。

## Output contract

- **spec JSON**：可读、可 diff，需求变了改它就行。
- **渲染产物**：
  - `*.png` → 按层各一张条带（外加可选对照图），直接进引擎。
  - `*.aseprite` → 可编辑母版，Aseprite/LibreSprite 打开就能逐帧逐像素改。
- **校验数字**：改动像素总数、颜色转移表、保留项计数。
- **接入说明**：产物路径、每个文件对应哪一层、动画帧数/时长等引擎侧需要的参数。

## Failure handling

- **帧网格探测不准**：用 `--cell WxH` 显式指定；`info` 会打印候选值供核对。
- **不知道该改哪些像素**：先 `ascii` 逐帧看局部，不要凭想象画。猜出来的坐标在 diff 里会露馅。
- **渲染报错**（未知算子、调色板名不存在、来源文件找不到）：改 spec，不要改脚本；报错信息里
  直接给了可用项。
- **diff 数量不符**：看颜色转移表定位是哪一类改动多了或漏了，通常是某个坐标写错一格。
- **产物会覆盖用户原素材**：先确认；确认前写到临时目录。
- **参考图不是规则条带**（角色跨格、特效溢出）：按实际内容拆成多层分别处理，别硬套一个网格。
- **`.aseprite` 打开后看着不对**：先用 `sheet_probe.js diff` 量化（母版 vs PNG），
  确认是"文件里的像素不对"还是"看的人眼/导出流程有偏差"；LibreSprite 导出 PNG 时
  会给全透明像素带上残留 RGB（不影响画面），这属于导出行为，不是母版损坏。

## Windows (win32) platform notes

三个脚本都是纯 Node.js（只用内置 fs / zlib / path），没有第三方 npm 依赖，Windows 直接能跑：

```powershell
node <skill目录>\scripts\sheet_probe.js info <参考图.png>
node <skill目录>\scripts\sprite_spec.js <spec.json> --preview
node <skill目录>\scripts\sheet_probe.js diff <原图.png> <产物.png> --expect 117
```

- 路径用正斜杠（`C:/work/sprite.png`）或双反斜杠；spec 里的 `root` 相对路径同样按此规则解析。
- 脚本输出是 UTF-8，若控制台中文乱码，先执行 `chcp 65001`。
- 临时目录用 `%TMPDIR%`，不要写死 `/tmp`。

## Examples

**Input**：用户给一张 13 帧的挖掘朝下条带，说"给我做一版朝上的，脸不要露出来，其他别动"。

**Output**：spec 描述 13 帧逐帧改写——眼睛/腮红改肤色、胸口红改衣服色（每帧 9 px），
头发层擦掉刘海再贴上朝上参考帧的后脑；渲染后 diff 得 117 px 变化，
特效灰 #8B9BB4 的 182 px 与土块 #BB6D53 的 10 px 原样保留。
