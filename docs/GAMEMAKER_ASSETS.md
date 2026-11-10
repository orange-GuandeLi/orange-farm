# GameMaker 工程勘察报告（绕过 aseprite 加密）

> ⚠️ **2026-11-10 更新：原始资源包与提取产物均已从项目中移除。**
> `assets/Sunnyside_World_ASSET_PACK_V2.1/`（含 GameMaker 工程 475 sprite）已删除。
> 提取产物目录 `assets/Characters/Human_v1/`（310 帧 × 15 图层 + 8 个 atlas）已清理，
> 原因是其中的分层 strip 存在像素丢失（详见 [`ASEPRITE_EXTRACTION.md`](ASEPRITE_EXTRACTION.md) §5），
> 且合成帧与项目现有的三层结构不兼容。
> 本文保留为**勘察记录**，记录资产清单与元数据格式。
>
> **四向移动动画的源文件为 `sunnyside_world_chatacter_anim_human_v1.0.aseprite`**，
> 现存放于项目外，需要时重新提取并按正确方式分层导出。
>
> 详见 [`FOUR_DIRECTION_ASSETS.md`](FOUR_DIRECTION_ASSETS.md)。

> 勘察日期：2026-11-09
> 目标：用户问"整包给了，里面有个 gamemaker，能不能绕过 aseprite 加密"

## 0. 一句话结论

**加密确实绕过去了，但绕过去之后发现：里面没有新像素。**
角色像素仍然只有正面那 20 个动作 × 3 层。
不过换到了两样别处拿不到的东西：**作者的动画元数据** 和 **475 个 sprite 的完整资产清单**。

---

## 1. GameMaker 工程结构

```
Sunnyside_World_Gamemaker/
├── Untitled.yyp          # 工程主文件
├── options/              # 各平台导出选项
├── rooms/Room1/Room1.yy  # 素材陈列室（不是游戏）
├── sprites/              # ★ 475 个 sprite 资源
│   └── <sprite_name>/
│       ├── <sprite_name>.yy          # 明文 JSON-like（YAML 风格）
│       ├── <uuid>.png                # ★ 每帧一张独立 PNG，明文未加密
│       ├── <uuid>.png.import
│       └── layers/<uuid>/<uuid>.png  # 每帧的图层（见 §3）
└── tilesets/
```

### `.yy` 里的可用信息

```yaml
{
  "resourceType": "GMSprite",
  "name": "base_dig_strip13",
  "origin": 7,          # 原点索引
  "xorigin": 48, "yorigin": 64,
  "width": 96, "height": 64,
  "frames": [ {"name":"7b586e4b-..."} , ... ],   # 13 帧
  "sequence": {
    "playbackSpeed": 12.0,      # ★ 作者原始播放速度
    "length": 13.0,
    "tracks": [ { "keyframes": [ {"Key":0.0, "Channels":{"0":{"Id":{"name":"<uuid>"}}}} ] } ]
    #                                    ↑ 帧的真实排列顺序
  },
  "layers": [ {"resourceType":"GMImageLayer","displayName":"default"} ],
  "parent": {"name":"DIG","path":"folders/Sprites/.../DIG.yy"}
}
```

---

## 2. 加密绕过的真实结论

### ✅ 能拿到

| 内容 | 证据 |
|---|---|
| 每帧独立明文 PNG | `base_dig_strip13/7b586e4b-....png` 直接就是 RGBA 96×64 |
| 帧的真实排列顺序 | `sequence.tracks[].keyframes[].Channels.0.Id.name` |
| 作者原始播放速度 | `sequence.playbackSpeed`（如 base_dig_strip13 = **12.0**） |
| 原点 / 包围盒 | `origin` / `xorigin` / `yorigin` / `bbox_*` |
| 475 个 sprite 的清单 | 见 §4 |

### ❌ 拿不到

| 内容 | 原因 |
|---|---|
| **新的角色朝向（背面 / 侧面）** | 角色 sprite 只有 20 个动作 × 3 层（base/6 发型/tools），**全是正面**。GameMaker 里也一样 |
| **aseprite 的图层分离** | `layers/<uuid>/` 每个帧目录下**只有一个** png —— GameMaker 里已经是合并后的单层 |
| **aseprite 的帧标签 / 编辑历史** | 加密保护的就是这些；GameMaker 里是 PNG，没有这些信息 |

### 🔬 决定性验证：GameMaker 帧 = 导出的 strip，**差异 0 像素**

```
GM 帧0 (7b586e4b-....png) 96×64  bbox=(43,23,54,39)
导出 strip 第0帧                        差异像素 = 0 / 6144
```

→ **GameMaker 工程和 Assets 里的 PNG 是同一批数据**。绕过加密绕不出新像素。

---

## 3. ★★ 决定性发现：三层方案 = 作者原方案

GameMaker 里有 `spr_dig468` / `spr_idle473` / `spr_walking461` 等 —— 这些是**作者自己手工合成的完整角色动画**
（body + hair + tools 三层 alpha 合成后的成品）。

与本项目的三层合成逐像素比对：

```
--- 帧0  作者合成版 bbox=(42,21,60,39)
    bowlhair    +tools_dig  差异=    0  ← 零差异
    curlyhair   +tools_dig  差异=  166
    longhair    +tools_dig  差异=  140
    mophair     +tools_dig  差异=  114
    shorthair   +tools_dig  差异=  105
    spikeyhair  +tools_dig  差异=  109
```

**结论**：
1. `base + bowlhair + tools` 三层节点方案**与原作者的工程做法完全一致**
2. `bowlhair`（碗头）确认是作者的默认发型
3. 帧 4 / 帧 9 有 3 / 15 像素差异 → 那是 GameMaker 的 `spr_dig468` 与 `base_dig_strip13` **帧序略有不同步**，
   不是合成方法有误

---

## 4. GameMaker 挖到的资产清单（Assets 目录里没有或不好找的）

### 4.1 耕地四态（16×12）★ M2a 第 5 步直接用

`Sunnyside_World_Assets/Elements/Crops/soil_00.png` / `01` / `03` / `04`

| 文件 | 外观 | 推测语义（**需实机确认**） |
|---|---|---|
| `soil_00` | 浅棕圆坑、边缘发白 | 未开垦的浅土 |
| `soil_01` | 纯深棕实心圆 | 已翻平整的土 |
| `soil_03` | 深棕圆 + 中心暗凹坑 | 干土 / 有洞 |
| `soil_04` | 深棕圆 + 更大暗凹坑 | 湿土 / 更深 |

> 编号 **缺 02** —— 源工程里 02 不存在（可能是作者删除或从未导出）。
> 四态的确切语义要跑起来看。`Room1.yy` 里没有 soil 的实际用法可参考。

### 4.2 体力条（15×7，7 段）★ M2b

`UI/greenbar_00.png` … `greenbar_06.png` —— 从空到满 7 段（绿）
另有 `redbar_00~06`（7 段）、`bluebar_00~05`（6 段）→ **绿=体力，红=饥饿，蓝=水**？需确认

### 4.3 表情 / 气泡（8~10px）★ M2b+

`UI/expression_alerted.png`（黄色感叹号）/ `attack`（怒脸）/ `chat`（白对话框）/
`confused`（红问号）/ `love`（红心）/ `stress`（怒纹）/ `working`（蓝色汗滴）

### 4.4 特效（多帧动画）

| sprite | 尺寸 | 用途 |
|---|---|---|
| `dust_land_strip6` | 24×9 × 6 帧 | 落地 / 锄地尘土 |
| `dust_run_strip8` | 24×9 × 8 帧 | 奔跑扬尘 |
| `dust_land_sidepuff_strip5` | — | 侧向尘土 |
| `dust_general_strip8` | — | 通用尘土 |
| `dust_land_single_A_strip4` / `_B_strip3` | — | 单次尘土 |

### 4.5 场景物件

| sprite | 尺寸 | 用途 |
|---|---|---|
| `spr_deco_charactershadow` | 16×16 | **角色脚下椭圆阴影** |
| `spr_deco_shadow` | — | 通用阴影 |
| `spr_deco_tree_01` | 32×34 | 树（圆冠） |
| `spr_deco_tree_02` | 28×43 | 树（尖松） |

### 4.6 UI 图标

`shovel`(14×14) / `axe`(15×13) / `pickaxe` / `hammer` / `plant`(10×11 幼苗) /
`seeds_generic`(11×10) / `basket` / `crate_base`+`crate_top` / `sandtimer` / `stopwatch` /
`hand_open_01~02` / `hand_closed_01~02`（鼠标指针）/ `cursor_01~05`

### 4.7 作物（11 种 × 6 阶段）

`beetroot` `cabbage` `carrot` `cauliflower` `kale` `parsnip` `potato` `pumpkin`
`radish` `sunflower` `wheat` —— 每个 `_00` ~ `_05`

### 4.8 动物 / 矿物 / 家具

- 动物：`spr_deco_sheep_01` `spr_deco_chicken_01` `spr_deco_cow` `spr_deco_pig_01` `spr_deco_duck_01` `fish`
- 矿物：`spr_deco_ore_stone` `spr_deco_ore_coal` `spr_deco_ore_gold` `spr_deco_ore_silver` `spr_deco_ore_bluestone`
- 物品：`milk` `egg` `wood` `rock` `water`
- 家具：`spr_deco_chair_01` `spr_deco_table` `spr_deco_bed` `spr_deco_chest_01/02`（开/关）
  `spr_deco_barrel_closed/open` `spr_deco_campfire` `spr_deco_firepit` `spr_deco_well` …
- 9-slice 面板：9 种颜色 × 9 块（`dt/lt/w_box_9slice_*`）

---

## 5. 对 M2a 的直接影响

### ✅ 第 5 步（锄地）方案要改

之前因为耕地贴图"随包删除丢失"，临时用主图集里的泥土 tile（c19r7/c20r7/c19r8/c20r8）替代。
**现在有真正的 `soil_00/01/03/04`（16×12）了** → 直接用它们，比 16×16 泥土 tile 更贴合。

### 📌 作者的播放速度参考

| 动画 | 作者 playbackSpeed | 采用值 | 说明 |
|---|---|---|---|
| `base_dig_strip13` | **12.0** | 20 | 13 帧：12fps≈1.08s，20fps≈0.65s |
| `spr_idle473` | 14.0 | 6 | 作者的 idle 更快（14fps） |

> 锄地节奏：星露谷约 0.5~0.7 秒一次 → **20 更接近星露谷**；作者自己用 12（1.08s）偏慢。
> 当前项目使用 20，保持不变；若需加快，可将三个 dig 动画的 speed 一并调至 15。

---

## 6. ⚠️ 运维：为整包加 `.gdignore`

整包几千张 PNG 已经在项目里生成了 `.import` 文件（Godot 已经扫描过），
会拖慢编辑器 FileSystem 面板和启动时间。

操作步骤（由执行方操作）：

```bash
cd /Users/orange/my/godot/farm
# 1) 让 Godot 整个目录不扫描
touch assets/Sunnyside_World_ASSET_PACK_V2.1/.gdignore
```

加完后 Godot 会忽略该目录（已生成的 `.import` 仍在磁盘上）。
需要用某个小图时，**单独复制**到干净目录：

```bash
mkdir -p assets/game
cp assets/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/Elements/Crops/soil_0*.png assets/game/
cp assets/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI/greenbar_0*.png assets/game/
cp assets/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI/expression_*.png assets/game/
cp assets/Sunnyside_World_ASSET_PACK_V2.1/Sunnyside_World_Assets/UI/shovel.png assets/game/
```

`.gdignore` 生效后，那些文件就不能再被 Godot 引用了 → **必须先复制出来再引用**。

---

## 7. ★ 作者官方另有「4, 6, 8 way movement」BETA 包

**这是对"能不能扩展四向素材"的真正答案：不需要扩展，作者自己做了。**

itch.io 下载页（https://danieldiggle.itch.io/sunnyside/purchase）提供 **3 个**独立文件：

| 文件 | 大小 | 说明 |
|---|---|---|
| `Sunnyside_World_ARCHIVED_ASSETS.zip` | 10 MB | 历史归档 |
| `Sunnyside_World_ASSET_PACK_V2.1.zip` | 10 MB | ← **本项目使用的这个** |
| `Sunnyside World - Human - 4,6,8 way movement - BETA` | **404 kB** | ★ **多方向移动 BETA** |

开发者日志：
- [4, 6... 8 Way Character Movement ?!](https://danieldiggle.itch.io/sunnyside/devlog/816790/4-6-8-way-character-movement-)（2024-10-16，45 likes）
- [Sunnyside World - EX](https://danieldiggle.itch.io/sunnyside/devlog/979630/sunnyside-world-ex)（2025-07-04，25 likes）

→ **去 itch.io 单独下载那个 404 kB 的 BETA 包就能拿到多方向移动的角色动画。**

### 作者对"只有左右朝向"的官方说明

素材包介绍里原文写着：

> NOTE: Sprite assets are for L/R movement, similar to Forager and Atomicrops!

→ **作者本来就只做了左右朝向的 sprite**，用 `flip_h` 翻面。
"正面 + flip_h + 4 向逻辑朝向"的实现**符合作者的设计意图**，不算缺件。

### 另一个被忽略的免费福利

> 7 Hair Styles: Fully pixel animated hairstyles. **Use palette swapping in your project to change character
> colours and create endless variants.**

→ 6 种发型**每一帧都是像素级动画**，且作者建议用**调色板交换（palette swap）**换角色颜色。
在 Godot 里可以用 `CanvasItem.modulate` 或一个 `CanvasItemMaterial` + shader 实现 → **免费得到无数个角色变体**。
