# 🌾 Farm

> Godot 4.7.2 驱动的星露谷式农场游戏。
> 16px 像素 · 俯视角 · 自由移动（8 向）/ 4 向朝向 · 图层化角色系统

---

## ✨ 素材致谢与授权

本项目使用的**全部美术素材**来自：

### [Sunnyside World](https://danieldiggle.itch.io/sunnyside)

**作者：[Daniel Diggle](http://danieldiggle.com/sunnysideworld.php)** · [@DanielDiggle](https://twitter.com/danielDiggle) · itch.io 用户名 [`danieldiggle`](https://danieldiggle.itch.io)

素材包的结构特征：

- 角色拆分为**身体 / 头发 / 手臂工具**三层独立图层，每个动作目录自带配套手臂层
- 20 个动作 × 7 种发型可自由组合
- 附带 **GameMaker 示例工程**（475 个 sprite 的完整元数据）和 **Aseprite 源文件**
- itch.io 上以 "pay what you think it's fair" 方式免费发布

本项目的三层角色系统按作者的原始工程还原，实测合成画面与作者合成的
`spr_dig468` **差异 0 像素**。

**素材包版本**：`Sunnyside_World_ASSET_PACK_V2.1.zip`（10 MB）

### 授权条款（作者原文 · LICENCE V1）

> This asset pack can be used in free and commercial projects. You can modify the assets as you need.
> **Credit is not necessary, but always appreciated.** You can redistribute the assets as part of tutorials
> or educational courses as long as a link to the Sunnyside World itch.io page is included:
> https://danieldiggle.itch.io/sunnyside. You may not repackage and resell the assets, no matter how much
> they are modified - this includes as NFT's. **You may not use these assets to train AI.**

中文要点：

| | |
|---|---|
| ✅ | 可用于**免费和商业**项目 |
| ✅ | 可任意**修改**素材 |
| ✅ | 作为**教程 / 教学课程**的一部分再分发素材时，只需附上本 README 里的 itch.io 链接 |
| ⚠️ | **署名不是必需的，但总是受欢迎的** —— 本项目自愿署名，就是这行字 |
| ❌ | 不得重新打包 / 转售（无论修改多少），**包括做成 NFT** |
| ❌ | 不得用这套素材**训练 AI** |

> ⚠️ 关于最后一条「不得用于训练 AI」：本项目把素材用于**游戏画面渲染**，
> 由 AI 辅助编写业务代码，不涉及将素材用作模型训练数据。若将来要做数据集，需自行确认条款边界。

### 相关链接

| | |
|---|---|
| 素材主页 | https://danieldiggle.itch.io/sunnyside |
| 作者官网 | http://danieldiggle.com/sunnysideworld.php |
| 开发者日志 | [Sunnyside World - EX](https://danieldiggle.itch.io/sunnyside/devlog/979630/sunnyside-world-ex) · [4, 6... 8 Way Character Movement ?!](https://danieldiggle.itch.io/sunnyside/devlog/816790/4-6-8-way-character-movement-) |
| 下载页 | https://danieldiggle.itch.io/sunnyside/purchase |

### 📦 其他可用素材包

itch.io 下载页除 V2.1 主包外还提供：

- **`Sunnyside World - Human - 4,6,8 way movement - BETA`（404 kB）** —— 多方向移动的 BETA 版本
- `Sunnyside_World_ARCHIVED_ASSETS.zip`（10 MB）—— 历史归档

BETA 包内含作者制作的多方向移动动画，无需自行绘制。

---

## 🎮 游戏设计

| 项 | 设定 |
|---|---|
| 引擎 | Godot **4.7.2** stable |
| 视图 | 2D 俯视，16px 网格，视口 640×360（窗口 1920×1080，3×） |
| 移动 | **自由移动**（8 向输入，60px/s），**4 向朝向**（`Vector2i`）；目标格 = 身体中心格 + 朝向 |
| 农田尺寸 | 地面 **80 × 45 格**，脚底可活动 **x∈[16,1264] / y∈[16,704]**（`GameConfig.FARM_SIZE`） |
| 锄地规则 | 星露谷式：**身体中心所在格 + 朝向**（判格基准是身体中心，不是脚底格） |
| 角色结构 | 三层 `AnimatedSprite2D`：Body / Hair / Tool |
| 素材分层 | 每层单独一个 `AnimatedSprite2D`，共用一个 `SpriteFrames` |

---

## 📂 目录结构

```
farm/
├── project.godot
├── README.md                     ← 本文件
├── scenes/
│   ├── main.tscn                 主场景：Ground / Soil / Boundary / Entities
│   └── player.tscn               玩家：BodySprite / HairSprite / ToolSprite
├── scripts/
│   ├── actors/player.gd          移动 + 朝向 + 动画切换 + 锄地
│   ├── core/game_config.gd       全局常量（TILE_SIZE / FARM_SIZE）
│   ├── world/
│   │   ├── soil.gd               耕地层：翻土 + 尘土特效
│   │   └── select_box.gd         目标格高亮框（四角贴图 + 脉冲）
│   └── data/
│       ├── soil_data.gd          SoilData 资源（地块状态）
│       └── farm_data.gd          FarmData 自动加载（地块仓库）
├── assets/
│   ├── characters/human/            ★ 角色图层（base / 发型 / tools 手臂，按动作目录）
│   │   └── idle/ walking/ run/ dig/ ...  20 个动作目录
│   ├── data/                        ★ 工具用数据（human_face_anchors.json）
│   ├── game/fx/                     ★ 特效贴图（尘土）
│   ├── tileset/                     ★ 16px 主图集
│   └── ui/                          ★ UI 贴图（目标格四角框）
├── tools/                        素材处理脚本
└── docs/                         全部开发文档（见下）
```

---

## 🚀 跑起来

```bash
# 用编辑器打开
/Applications/Godot.app/Contents/MacOS/Godot --path /Users/orange/my/godot/farm

# 无头跑一个验证脚本（场景必须 add_child 进树，否则物理帧不执行）
/Applications/Godot.app/Contents/MacOS/Godot --headless --path /Users/orange/my/godot/farm --script /tmp/xxx.gd
```

> ⚠️ 脚本报 GDScript 解析错误时 `quit()` 不会执行，进程会挂住 → 无头跑请**后台 + sleep + pkill**。

---

## 🔧 关键技术约定

以下约定来自已验证的问题修复，修改相关代码前需确认：

| 约定 | 原因 |
|---|---|
| 参与 Y 排序的层 `z_index` **必须为 0** | `z_index` 优先级**高于** Y 排序，非 0 会让玩家始终绘制在树前方 |
| 树的 tile 必须设 `y_sort_origin` = 格高 | 默认 0 = 按**格顶**排序，遮挡关系不符预期；设为格高才按树脚排序 |
| 耕地层 `Soil` 必须在 `Entities` **外面** | 依靠树序保证绘制在玩家下方 |
| 三层角色节点 `position` 全部 `(0,-5)`、`Centered` 保持 true | 否则三层错位 |
| 三层同名动画的 **speed / loop 必须完全一致** | 不一致会逐帧漂移 |
| **不需要**写 `hair.frame = body.frame` 同步代码 | Godot `_process` 父先子后，手动同步反而慢一帧；同名动画 + 相同 speed 即自动同步 |
| `dig` 动画的 **loop 必须关** | `loop=true` 时 `animation_finished` 永不发出 |
| Autoload 用 `*uid://` 或 `*res://` 均可 | 实测两者等价：`.uid` 边车文件已入 git，克隆后 UID 可重建。**前提是克隆后必须 import 一次**（`.godot/` 被 gitignore，两种写法在未 import 的新克隆中均无法加载） |
| GDScript `format()` 不支持 `%g` / `%-12s` | 仅支持 `%s` / `%d` / `%f` |

---

## 📈 当前进度

> 更新于 2026-11-10

| 里程碑 | 状态 |
|---|---|
| M1 移动 / 摄像机 / 4 向朝向 / 翻转 | ✅ 已验收 |
| 农场放大到 42×28 格 | ✅ 已验收（真实渲染逐像素验过） |
| 视口 640×360 + 农场 80×45 + 棋盘草地 | ✅ 已落地（2026-11-10） |
| 边界围栏 + Y 排序规则 | ✅ 已验收 |
| 数据层 `SoilData` / `FarmData` | ✅ 已验收 |
| 4 步：三层角色（Body/Hair/Tool）+ dig 动画 | ✅ 已验收（真实渲染零错位） |
| 5 步：锄地流程（锁移动锁朝向 → `FarmData.till()` → `Soil.set_cell()` → 播放尘土） | ✅ 已验收 |
| 5.5 步：逐格移动（吸附）+ 目标格高亮框 `SelectBox` | ✅ 已验收 |
| M2a 移动改版：自由移动（8 向）+ 实时目标格 | ✅ 已验收（2026-11-10） |
| M2b 播种 / 浇水 / 作物生长 / 体力条 / 存档 | ⏳ 待开始 |

**已探明的可用素材**（M2b 备料）：`greenbar_00~06` 体力条 · `expression_*` 表情气泡 ·
`dust_run` 尘土特效 · `spr_deco_charactershadow` 角色阴影 ·
动物（羊/鸡/牛/猪/鸭/鱼）· 矿物（煤/金/银/蓝石）· 家具装饰
> 耕地四态 `soil_00/01/03/04`（16×12）与 11 种作物 × 6 阶段已从素材包备料，
> 尚未入库 —— M2b 需要时重新从素材包取。

---

## 📚 文档索引

全部在 [`docs/`](docs/)：

| 文档 | 内容 |
|---|---|
| [`ROADMAP.md`](docs/ROADMAP.md) | 总路线图 |
| [`M2A_PLAN.md`](docs/M2A_PLAN.md) | **M2a 实施手册**：4 向朝向 / 星露谷锄地规则 / 三层角色 / 动画参数 |
| [`M2A_STEP5_HOE.md`](docs/M2A_STEP5_HOE.md) | **第 5 步施工指南**：锄地流程 / 土壤贴图选型 / 尘土特效 |
| [`M2A_SOIL_PAINTING.md`](docs/M2A_SOIL_PAINTING.md) | 耕地绘制方案 |
| [`TOOL_TARGET_RULES.md`](docs/TOOL_TARGET_RULES.md) | **目标格规则**：星露谷锄地考证 / 自由移动下的目标格 / 旧逐格方案存档 |
| [`GAMEMAKER_ASSETS.md`](docs/GAMEMAKER_ASSETS.md) | **GameMaker 工程勘察报告**：475 个 sprite 清单 / 元数据格式 / 资产目录 |
| [`ASEPRITE_EXTRACTION.md`](docs/ASEPRITE_EXTRACTION.md) | 从 Aseprite 源文件提取帧的方法 |
| [`FOUR_DIRECTION_ASSETS.md`](docs/FOUR_DIRECTION_ASSETS.md) | 四向移动动画素材提取 |
| [`NOTES.md`](docs/NOTES.md) | 逐条开发日志（含所有踩坑记录和实测数据） |
| [`REVIEW_M1.md`](docs/REVIEW_M1.md) | M1 代码 review |
| [`Y_SORT.md`](docs/Y_SORT.md) | Godot Y 排序与 z_index 源码级结论 |
| [`FARM_SIZE.md`](docs/FARM_SIZE.md) / [`FARM_SIZE_REVIEW.md`](docs/FARM_SIZE_REVIEW.md) | 农场尺寸改造 |
| [`MAP_STRUCTURE.md`](docs/MAP_STRUCTURE.md) | 场景结构 |
| [`FACING_DIRECTION.md`](docs/FACING_DIRECTION.md) | 4 向朝向规则 |
| [`EQUIPMENT_LAYERS.md`](docs/EQUIPMENT_LAYERS.md) | 装备/图层系统 |
| [`SPRITE_SLICING.md`](docs/SPRITE_SLICING.md) | 切图规范 |
| [`M2_FARM_TILES.md`](docs/M2_FARM_TILES.md) | 农田贴图 |
| [`JITTER_DIAGNOSIS.md`](docs/JITTER_DIAGNOSIS.md) | 抖动问题诊断 |
| [`PROJECT_SETTINGS.md`](docs/PROJECT_SETTINGS.md) | 项目设置说明 |
| [`FENCE_REVIEW.md`](docs/FENCE_REVIEW.md) | 边界 review |

---

## 素材授权说明

Daniel Diggle 的 [Sunnyside World](https://danieldiggle.itch.io/sunnyside) 允许免费与商业使用，
并允许任意修改素材。作者作品页说明：*"This asset pack is available entirely free - donations welcome"*。

本项目选择署名以尊重作者。素材页链接见上方「素材致谢与授权」。

---

<div align="center">

**素材 © [Daniel Diggle](http://danieldiggle.com/sunnysideworld.php) · [Sunnyside World](https://danieldiggle.itch.io/sunnyside)**
*本页面包含指向素材页的链接，符合 LICENCE V1 中关于再分发时附带 itch.io 页面链接的要求。*

</div>
