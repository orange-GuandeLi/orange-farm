# Aseprite 混淆绕过 & 四向移动素材提取报告

> ⚠️ **2026-11-09 更新：原始资源包已从项目中移除。**
> `assets/Sunnyside_World_ASSET_PACK_V2.1/`（含 GameMaker 工程 475 sprite）与
> `assets/sunnyside_world_chatacter_anim_human_v1.0.aseprite` 均已删除。
> 本文保留为**勘察记录**；其中列出的资产已按需复制到 `assets/game/`。
> 四向移动动画的像素成果已提取并保存在 `assets/Characters/Human_v1/`
> （详见 [`ASEPRITE_EXTRACTION.md`](ASEPRITE_EXTRACTION.md)）。

> 日期：2026-11-09
> 起因：用户问"整包都给了，好像还有个叫 gamemaker 的，你看看是不是可以绕过加密"
> 结果：**绕过了。加密只混淆了 chunk 元数据，像素数据是明文 zlib，可完整提取。**
> **并且提取出了作者官方尚未导出 PNG 的四向移动动画。**

---

## 0. 一句话结论

| 问题 | 答案 |
|---|---|
| 加密能绕过吗？ | ✅ **能**。混淆只作用于 chunk 的 size/type 字段，**像素数据（zlib 压缩的 RGBA）完全未加密** |
| 能绕出新像素吗？ | ✅ **能**。`human_v1.0.aseprite` 提取出 **310 帧 × 15 图层**，含作者尚未导出的**四向移动动画** |
| 四向动画长什么样？ | ✅ `idle-s / idle-se / idle-ne / idle-n`、`walk-s/se/ne/n`、`run-s/se/ne/n`（S=南 SE=东南 NE=东北 N=北） |

---

## 1. 三个 aseprite 文件的真实情况

| 文件 | 帧数 | 画布 | 状态 |
|---|---|---|---|
| `sunnyside_world_chatacter_anim_v0.07.aseprite` | 211 | 124×96 | 混淆（元数据） |
| `sunnyside_world_chatacter_anim_v0.07_condensed.aseprite` | 211 | 96×64 | 混淆（元数据） |
| **`sunnyside_world_chatacter_anim_human_v1.0.aseprite`** | **310** | **96×64** | 混淆（元数据）**← 项目里已有** |

> ⚠️ **第三个文件就是 itch.io 上那个"不是 zip"的 BETA 包。**
> 它是 **Aseprite 工程源文件**（不是 PNG、不是 zip），作者原话：
> *"I've attached the Aseprite file if anyone wants to rest out the initial character movements.
> Completed so far are Idles, Walk and Run. Only one hair style has been finished… **theres no exported assets,
> so you'll need aseprite if you want to export them**"*
>
> **用户已经把它放进项目 `assets/` 目录了**，只是当时以为没用。

### "加密"的真相

| 部位 | 是否被混淆 |
|---|---|
| 文件头（magic / 帧数 / 尺寸） | ❌ 未混淆（`0xA5E0`，声明大小 == 实际大小） |
| 顶层 frame chunk（size / type `0xF1FA`） | ❌ 未混淆（310 个 chunk 全部正常） |
| **frame 内部的子 chunk size / type** | ✅ **被混淆**（size 全是 `0xN0000` 形式，type 全是 `0x0000`） |
| **cel 的 layer index / x / y / opacity / w / h** | ❌ **未混淆**（在 chunk 头之后、数据之前） |
| **像素数据** | ❌ **未加密**（zlib 压缩的 RGBA，1909 个流全部可解压） |

**换句话说**：作者用一个简单的混淆器把"chunk 边界"打乱了，但**没动数据本身**。
只要绕过 chunk 边界（改用"扫 zlib 流 + 从流尾部反推 cel 头"），就能完整还原。

---

## 2. 提取原理

### 2.1 找像素流

```python
# 扫描整个文件，找 zlib 头并尝试解压
if d[i] == 0x78 and d[i+1] in (0x01, 0x9c, 0xda, 0x5e):
    out = zlib.decompressobj().decompress(d[i:])
```

→ v1.0 得到 **1909 个独立 zlib 流**，全部可解压。

### 2.2 从流尾部反推 cel 头

aseprite 的 cel chunk 结构是 `…x, y, opacity, celtype, zindex, reserved[5], width, height, <zlib数据>`。
**width/height 在 zlib 数据前 4 字节**，这是唯一没被混淆的锚点：

```python
w = struct.unpack('<H', d[off-4:off-2])[0]
h = struct.unpack('<H', d[off-2:off])[0]
assert w * h * 4 == len(data)     # 1909 / 1909 全部成立 ✅
```

再从 cel 头往回推，得到完整字段（相对 zlib 流起点的**负偏移**）：

| 字段 | 偏移 | 说明 |
|---|---|---|
| layer index | `-20 .. -18` | WORD |
| x | `-18 .. -16` | SHORT |
| y | `-16 .. -14` | SHORT |
| opacity | `-14` | BYTE |
| cel type | `-13 .. -11` | WORD（2 = 压缩图像） |
| z-index | `-11 .. -9` | WORD |
| reserved | `-9 .. -4` | BYTE[5] |
| width | `-4 .. -2` | WORD ✅ 1909/1909 校验通过 |
| height | `-2 .. 0` | WORD ✅ |

> **踩过的坑**：第一次把 x/y 读成了 `-20/-18`，导致所有层坐标错位、合成帧整体偏掉。
> 靠"帧0 第 3 个 cel 的 x 应该是 43、y 应该是 23"（GameMaker 里 `base_idle` f0 的 bbox）
> 反查原始字节才定位到正确位置。

### 2.3 分帧

顶层 frame chunk **没被混淆**，所以直接按 chunk 边界把流分组即可：

```python
while off < len(d):
    csz = struct.unpack('<I', d[off:off+4])[0]
    frames.append((off, csz)); off += csz
```

### 2.4 合成

每个 cel 按 (x, y) 贴到 96×64 画布，多层 alpha 叠加 → 得到完整角色帧。

---

## 3. 提取结果

### 3.1 图层结构（15 个图层）

| layer id | 出现帧数 | 内容（推断） |
|---|---|---|
| 0 | 1 | 背景（136×128 淡蓝） |
| 1 | 1 | 背景 |
| 2 | 2 | 特效 |
| **4** | **293** | **base 身体层** |
| 6 | 4 | 特效 |
| **8** | **279** | **tools 手臂层** |
| **9 / 10 / 11 / 12 / 13** | **215 each** | **6 种发型层**（bowl/curly/long/mop/short/spikey） |
| **14** | **285** | **tools rear 背向手臂层** ★ |
| 16 / 17 / 18 | 8 each | 斧头 / 特效层 |

> ★ **`tools rear`** 是作者专门为"背对镜头"方向准备的手臂层 —— 这正是四向动画的关键部件。

### 3.2 ★ 四向移动动画（本次最大收获）

**frame tag 列表**（从 aseprite 里读出的明文）：

```
idle-s   idle-se   idle-ne   idle-n
walk-s   walk-se   walk-ne   walk-n
run-s    run-se    run-ne    run-n
roll-sec
walk  carry  idle  watering  hurt  death  doing  jump  roll
mining  swimming  hamering  attack  casting  waiting  reeling  caught
```

**方向含义**（作者 devlog 原文说明他做的是"介于 4 向与 8 向之间"的方案：
左右向的 sprite 稍微转向正面，可以同时用于 left / right / down-left / down-right）：

| 后缀 | 方向 |
|---|---|
| `-s` | South 朝下（正面） |
| `-se` | South-East 东南 |
| `-ne` | North-East 东北 |
| `-n` | North 朝上（**背面**） |

**像素证据**（`docs/images/frames_27_92.png`）：
- 帧 27–43：正面，**眼睛和腮红可见**
- 帧 44–59：身体侧转，脸只露一半
- 帧 60–76：正面，眼睛可见
- 帧 77–92：**整团深棕、完全看不到脸 = 背面**

> 作者在 devlog 里说 *"Only one hair style has been finished for the character movements"* ——
> 所以四向帧目前只有**一种发型**完成，这和提取到的"6 个发型层里只有部分帧有四向版本"吻合。

### 3.3 全部 310 帧一览

| 帧段 | 内容 |
|---|---|
| 0–15 | idle / 攻击起始，带红色粒子 |
| 16–26 | 斧头碎片粒子 |
| **27–92** | ★ **四向 idle / walk / run（66 帧）** |
| 93–114 | CARRY（举书本/卷轴） |
| 115–135 | WATERING（蓝色水花） |
| 136–149 | 红色表情（death / caught） |
| 150–175 | 弯腰 / 受击 |
| 176–191 | 橙色球（hurt） |
| 192–239 | 斧头挥砍（白色弧线特效） |
| 240–293 | 钓鱼（ROD / REELING，带鱼线） |
| 294–309 | DIG 挖掘 |

---

## 4. 产物位置

```
assets/Characters/Human_v1/                  ← ★ 提取成果（源 aseprite 已删除，这是唯一副本）
├── frames/frame_000.png … frame_309.png      ← 310 张 96×64 完整合成帧
├── layer_4_strip293.png                      ← base 身体层
├── layer_8_strip279.png                      ← tools 手臂层
├── layer_9..13_strip215.png                  ← 6 个发型层
├── layer_14_strip285.png                     ← tools rear（背向手臂层）
└── layer_16/17/18_strip8.png                 ← 斧头 / 特效层

docs/images/
├── all310_grid.png        ← 310 帧缩略图网格
├── frames_27_92.png       ← 四向动画放大对比
├── frames_overview.png    ← 均匀抽帧总览
└── full_frames_view.png   ← 三个完整帧
```

**提取脚本**：`/tmp/extract_aseprite.py`（可复用，换个 .aseprite 路径即可）

---

## 5. 待办 / 注意事项

1. **单层 strip 目前不完整**：`base` 层（layer 4）在 aseprite 里被拆成多个 cel，
   当前脚本每个 (层,帧) 只保留最后一个 cel → 单层 strip 会丢像素。
   **合成帧（310 张）是完整可靠的**。
   要做精确分层导出，需要按帧把同层的多个 cel 全部叠加。
2. **layer offset 未解**：某些图层（发型层）带子图层偏移，导致与 GameMaker 已知帧哈希不匹配
   （layer 12 匹配 196/215，layer 9/10/11 匹配 0）。合成帧不受影响。
3. **四向帧与 GameMaker 的对应关系未建立**：还没有把 `-s/-se/-ne/-n` 的帧区间和具体帧号对上，
   需要解析 frame tag 的起止帧号（tag 结构 = `from(2) to(2) loop(2) unused(4) namelen(2) name`，
   位置已确认在文件开头约 offset 296 处，但第二个 tag 之后的推进量还没验证通过）。
4. **四向只有一种发型完成**（作者原话），所以实际可用的是"单发型四向"。
5. **v1.0 用的是橙色头发**（和 V2.1 主包的棕色不同）→ 可用 palette swap 调整。
6. **建议把 v1.0 移进 `assets/Sunnyside_World_ASSET_PACK_V2.1/`**（该目录有 `.gdignore`，
   Godot 不会扫描它，但文件本身可被脚本读取），保持项目根目录整洁。

---

## 6. 相关文档

- [`GAMEMAKER_ASSETS.md`](GAMEMAKER_ASSETS.md) —— GameMaker 工程勘察（475 sprite 清单）
- [`M2A_PLAN.md`](M2A_PLAN.md) —— M2a 实施手册（三层角色结构）
- [`NOTES.md`](NOTES.md) —— 逐条开发日志
