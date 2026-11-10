# 星露谷式农场游戏 — 开发路线图

> Godot 4.7.2 stable · GDScript · 2D 俯视视角
>
> 本文档定义各里程碑的目标与验收标准。每个里程碑验收通过后再进入下一个。

---

## 0. 当前环境（已核实）

| 项目 | 情况 |
|---|---|
| Godot 版本 | 4.7.2.stable.official（Windows 官方 win64 构建） |
| 项目路径 | 仓库根目录 `farm/` |
| 引擎特性标签 | `config/features=PackedStringArray("4.7", "Forward Plus")` |
| 主场景 | `res://scenes/main.tscn`（已写入 `project.godot`） |
| 无头运行 | 可用 `godot --headless --path .`；Godot 不在 PATH 时写全路径 |
| 素材 | Sunnyside World 已入库，授权见 README |

### 4.7 的破坏性变更对 2D 项目的影响

依据 `upgrading_to_godot_4.7.rst`：4.7 的 2D 破坏性变更仅有 `CPUParticles2D` / `GPUParticles2D` 的
`request_particles_process()` 新增一个可选参数，**GDScript 完全兼容**。Input 相关变更仅为
设备 ID 常量改名（`InputEvent.DEVICE_ID_KEYBOARD` 替代 `0`），当前用不到。

**结论：使用 4.7 开发，无需降到 4.x 早期版本。**

---

## 1. 架构总览

### 1.1 为什么这样分层

星露谷式农场游戏的核心复杂度不在"画面"，而在**状态的持久化与跨系统通信**：

- 玩家背包里的种子数量 → 影响种植
- 地块的"已浇水/已锄地/作物生长阶段" → 影响收获
- 一天的时间 → 影响商店开关、光照、作物生长

所以架构的核心目标是：**让游戏状态只有一份，且不依附于场景节点的生死**。

### 1.2 节点选型对照表（初学者常见搞错的地方）

| 目标行为 | 节点类型 | 原因 |
|---|---|---|
| 玩家角色 | `CharacterBody2D` | 能推动、能和碰撞体滑动交互，且不会被物理推挤穿模 |
| 背包里的物品图标 | `Area2D` | 只检测，不阻挡 |
| 农场地块 | `TileMapLayer` | 网格数据，天然适合"一格一格" |
| 可交互物体（NPC/箱子） | `Area2D` + 子 `CollisionShape2D` | 玩家走进范围触发信号 |
| 场景切换 | `Area2D` | 检测到玩家就 `change_scene_to_file()` |

> **记住这条铁律**：Godot 4 里 `Area2D` 负责"检测"，`CharacterBody2D`/`StaticBody2D` 负责"阻挡"。
> 两者不能互相替代，这是 常见错误来源。

### 1.3 场景树蓝图（目标态）

```
Main (Node)                      ← 主场景
├── World (Node2D)
│   ├── GroundLayer (TileMapLayer)      地面/泥土
│   ├── FarmLayer (TileMapLayer)        耕地、作物
│   ├── DecorLayer (TileMapLayer)       树、石头、栅栏（Y 排序）
│   ├── Entities (Node2D)               Y 排序开启
│   │   ├── Player (CharacterBody2D)
│   │   ├── NPC_* (CharacterBody2D)
│   │   └── Items (Node2D)              掉落物
│   └── CollisionLayers (Node2D)
├── Camera2D  (挂在 Player 下或独立跟随)
└── UI (CanvasLayer)
	├── HUD
	├── InventoryPanel
	└── ShopPanel
```

**Y 排序（Y-Sort）**：Godot 4 中在 `Node2D` 或 `TileMapLayer` 上开启 `Y Sort Enabled`，
子节点按 Y 坐标决定遮挡顺序 —— 玩家走到树后方时被树遮挡，即俯视视角应有的空间关系。

---

## 2. 目录结构（骨架）

> 这是最初的规划骨架，实际目录（`scenes/`、`scripts/actors`、`scripts/data` 等）以 README 的「目录结构」为准；
> 本节保留作对照，不再逐个同步。

```
farm/
├── project.godot
├── docs/
│   ├── ROADMAP.md          ← 本文件
│   └── NOTES.md            ← review 记录（每次 review 后更新）
├── scenes/
│   ├── main/               Main.tscn, Farm.tscn
│   ├── actors/             player/  npc/  items/
│   ├── farm/               farmland.tscn, crop.tscn
│   └── ui/                 hud.tscn, inventory.tscn, shop.tscn
├── scripts/
│   ├── autoload/           ← 全局单例，见 2.2
│   ├── actors/
│   ├── farm/
│   ├── systems/
│   └── data/               ← Resource 数据定义
├── resources/
│   ├── items/              item_base.tres, seed_item.tres...
│   ├── crops/              crop_data.tres
│   └── tilesets/
├── assets/
│   ├── sprites/            美术资源
│   ├── tilesets/
│   ├── audio/
│   └── fonts/
└── scenes/tests/           单元测试（后期）
```

### 2.1 命名规范（官方，review 时会看这个）

- **文件夹 / 文件名**：`snake_case`。理由很实际：Windows 和 macOS 默认**不区分大小写**，Linux 区分。
  用 `snake_case` 导出到 Linux 服务器时不会炸。
- **节点名**：`PascalCase`（`Player`、`Camera2D`），与引擎内置节点风格一致。
- **GDScript 类名**：`PascalCase`（`class_name CropData`）。
- **脚本文件名**：`snake_case.gd`（`crop_data.gd`）。

### 2.2 Autoload 单例（全局状态放这里）

在 `项目设置 → 全局 → 自动加载` 里注册。Autoload 是**在整个游戏生命周期内只存在一份**的节点，
适合放"全局状态"。

| 单例名 | 类型 | 职责 |
|---|---|---|
| `GameState` | Node | 持有 `Inventory`、`TimeSystem`、`FarmData` 的引用 |
| `TimeSystem` | Node | 游戏内时间（分/小时/天/季节），发信号 `time_changed` / `day_changed` |
| `Inventory` | Node | 背包数据（`Array[ItemStack]`），发信号 `changed` |

> **关键设计**：背包**不能**挂在玩家身上。玩家场景随时可能被销毁重建（进菜单、切换地图），
> 但背包必须活着。所以背包放 Autoload，玩家通过 `Inventory` 单例访问它。
> 这是初学者常见犯的"数据丢失"错误。

### 2.3 数据驱动：Resource 存物品和作物

不要用 `if item_id == "carrot": ...` 这种硬编码。定义一个 `Resource`：

```gdscript
# scripts/data/item_data.gd
class_name ItemData
extends Resource

@export var id: StringName
@export var display_name: String
@export var icon: Texture2D
@export var max_stack: int = 999
@export var sell_price: int = 0
@export var buy_price: int = 0
```

然后在资源文件里创建 `carrot_seed.tres`，改数值即可，不用碰代码。
**内容（数值、文案、图标）和逻辑（代码）分离**，是 Godot 项目的核心思想。

---

## 3. 里程碑路线图

每个里程碑都给出：**目标 / 验收标准 / 前置概念**。
验收标准全部通过后再进入下一个里程碑，避免在上层结构未稳定时累积返工成本。

---

### M0 · 骨架与地牢 ✅

**目标**：项目能跑起来，屏幕显示一块地面。

**前置概念**
- 场景树 / 节点 / 场景三者的区别
- `project.godot` 里设置主场景
- 像素风项目设置（见 §4）

**验收**
- [x] 运行游戏，不报 "no main scene defined"
- [x] 窗口里能看到一个色块或一张图
- [x] 窗口标题使用项目名 `farm`

---

### M1 · 玩家移动 + 摄像机

**目标**：按 WASD/方向键，角色能走，摄像机平滑跟随。

**前置概念**
- `CharacterBody2D` 的 `velocity` + `move_and_slide()`（4.x 已废弃 `move_and_slide(delta)` 的旧写法）
- `Input.get_vector("move_left","move_right","move_up","move_down")` —— 这会自动处理斜向移动的归一化，比手动加减更正确
- `Camera2D` 的 `position_smoothing_enabled`
- **输入映射（Input Map）**：`项目设置 → 输入映射`，自己定义 `move_left` 等动作，而不是写死键盘码

**验收**
- [x] 四向逐格移动（斜向输入按主轴走一格，不会斜穿）
- [x] 摄像机跟随（硬跟随，`Camera2D` 限制在农场范围内）
- [x] 角色不会走出地面边界（有碰撞）

> 原计划的"平滑跟随"已放弃：平滑会让镜头发到小数坐标，与整数缩放冲突、把抖动换回来。
> 逐格吸附 + 硬跟随是像素游戏的常见做法，理由见 `JITTER_DIAGNOSIS.md`。

**参考写法（仅示意结构）**
```gdscript
func _physics_process(delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * SPEED
	move_and_slide()
```

---

### M2 · 农场地块系统 ⭐ 核心

**目标**：能用锄头把地锄开，能播种，作物每天生长，成熟后能收获。

**这是整个项目最难也最重要的一步。** 难点不在画图，在于**"每个格子有自己的状态"**。

**前置概念**
- `TileMapLayer`（**Godot 4.3+ 新节点，旧的 `TileMap` 已废弃** —— 网上很多老教程还在用 `TileMap`，别被带偏）
- `local_to_map()` / `map_to_local()`：像素坐标 ↔ 格子坐标互转
- **格子数据存在哪**（下面详述）

#### 地块状态存哪？三种方案

| 方案 | 做法 | 评价 |
|---|---|---|
| A. 多个 TileMapLayer | `Soil`（已锄）、`Watered`（已浇水）、`Crop`（作物）各一层 | ✅ 最直观，美术好做，但层数会膨胀 |
| B. TileSet 自定义数据层 | 在 TileSet 里定义 `soil_state` 字段存在格子上 | ✅ 最灵活，运行时可读可写，但 API 绕 |
| C. 独立字典 | `Dictionary[Vector2i, SoilData]` 存在 Autoload 里 | ✅ 逻辑最清晰，不依赖 TileSet 美术 |

> **采用方案：C 存数据 + A 表现**。
> `FarmData` 单例里用 `Dictionary` 以 `Vector2i` 为键存每格的
> `{state: 枚举, crop_id: StringName, growth: int}`，视觉上用不同的 TileMapLayer 层切换显示。
> 该组合使土壤状态与美术资源解耦，更换素材时无需修改逻辑代码。

**地块状态的枚举**（实际实现见 `scripts/data/soil_data.gd`）
```gdscript
enum State { UNTILLED, TILLED, SEEDED, GROWING, MATURE }

# 浇水与生长阶段正交，不单独占一个状态
@export var watered := false
```

**API（已核实存在于 4.7）**
- `TileMapLayer.local_to_map(local_pos) -> Vector2i`
- `TileMapLayer.get_cell_source_id(coords) -> int`
- `TileMapLayer.set_cell(coords, source_id, atlas_coords, alternative_tile)`
- `TileMapLayer.get_cell_tile_data(coords) -> TileData`（`TileData.get_custom_data("名字")` 读自定义数据）
- `TileMapLayer.get_used_cells() -> Array[Vector2i]`
- **注意**：TileMapLayer 的更新是**帧末批处理**的；要立刻生效需调 `update_internals()`

**验收**
- [x] 锄头能锄地，且只有空地能被锄（M2a 已验收）
- [ ] 能播种，种子数量正确扣减（M2b）
- [ ] 浇过的地颜色变深（M2b）
- [ ] 作物每天推进生长阶段（M2b）
- [ ] 成熟后收获，物品进背包（M2b）

---

### M3 · 背包与物品栏

**目标**：底部显示 12 格背包，能拾取、堆叠、使用。

**前置概念**
- `GridContainer` + `Control` 布局
- `Signal`（`signal changed` / `signal item_changed(index, item)`）
- **信号 vs 回调**：单向通知用信号，多对多用信号，局部一对一用回调

**验收**
- [ ] 拾取物品进背包
- [ ] 同类物品能堆叠，超过上限会拆分
- [ ] 数量变化时 UI 自动刷新（**用信号驱动，不要每帧轮询**）

---

### M4 · 时间与昼夜

**目标**：游戏内时钟，昼夜光照，睡觉进入第二天。

**前置概念**
- `CanvasModulate`（整体染色，做白天/夜晚色调）
- `WorldEnvironment` + `CanvasModulate` 配合
- Autoload 里用 `Time.get_ticks_msec()` 累计游戏时间（**不要用 `await get_tree().create_timer()` 循环**，容易失控）

**验收**
- [ ] 时间推进，游戏内 6:00 → 2:00
- [ ] 夜晚画面变暗
- [ ] 睡觉后日期 +1，作物生长阶段推进

---

### M5 · 商店与经济

**目标**：商店能买种子/卖作物，金币有进有出。

**前置概念**
- `Button` + `signal pressed`
- 物品数据驱动的价格（存在 `ItemData` 里，不写死在 UI 脚本中）

**验收**
- [ ] 买种子扣钱，钱不够不能买
- [ ] 卖作物得钱
- [ ] 商店只在特定时间/地点开放

---

### M6 · 存档系统

**目标**：退出游戏后，读档能恢复所有状态。

**前置概念**
- `FileAccess.open()` / `store_var` / `get_var`
- 或 `JSON.stringify()` / `JSON.parse_string()`
- `user://` 路径（**存档不能写进 `res://`，那是只读的**）

**验收**
- [ ] 存档包含：背包、金币、时间、地块状态、作物
- [ ] 读档后一切恢复
- [ ] 存档文件损坏时不崩溃，能优雅处理

---

### M7 · 场景切换与更多地图

**目标**：走出农场边界，进入村庄。

**前置概念**
- `change_scene_to_file()` / `change_scene_to_packed()`
- 跨场景保留数据（靠 M2/M3 的 Autoload 单例自然解决）

---

### M8 · NPC 与对话

**目标**：NPC 走路、玩家按 E 触发对话。

**前置概念**
- `Area2D` + `body_entered` 信号
- 简单状态机

---

## 4. 像素风项目设置（重要）

星露谷是像素游戏。设置不对，素材会**模糊**，看着像马赛克。

### 4.1 必须设的项

`项目设置 → 显示 → 窗口`
```
display/window/size/viewport_width   = 640      （★ 见下方说明）
display/window/size/viewport_height  = 360
display/window/stretch/mode           = canvas_items
display/window/stretch/aspect        = keep
display/window/stretch/scale_mode     = integer
```

> **采用 640×360 的原因**：Sunnyside 角色可见尺寸约 **13×18 像素**，地块 16×16。
> 2560×1440 下是 4×（角色约 72px），1920×1080 下是 3×（角色约 54px），观感接近参考图。
> 早期版本用 320×180（2560 下 8×、角色 144px），实测画面过近，2026-11-10 改为 640×360。
> 代价：可见 40×22.5 格；农场 80×45 格，镜头余量 640×360px（一屏）—— 见 `docs/FARM_SIZE.md`。

`项目设置 → 渲染 → 纹理 → 画布纹理`
```
rendering/textures/canvas_textures/default_texture_filter = 0    ← 0 = Nearest，1 = Linear
```
> **这一项是像素风的关键**。默认是 Linear（线性插值），会把像素边缘抹糊。
> 也可在导入每张图片时单独设为 "Nearest"，但设置全局默认值更简便。

`项目设置 → 渲染 → 2D → 吸附`
```
rendering/2d/snap/snap_2d_transforms_to_pixel = true    （可选，让角色移动不产生半像素抖动）
```

### 4.2 素材导入设置

每张图片导入时（Godot 4 默认值大多就对了）：
- **Filter = Nearest**（像素风）
- **Mipmaps = 关闭**（像素风不需要，会导致远处发糊）
- **Repeat = Disabled**（无限地面场景除外）

> TileSet 里的**图块（atlas）**如果带缝隙或拉伸，记得在 TileSet 中设好每格尺寸。

---

## 5. Review 流程

每个里程碑完成后提交 review，review 包含以下步骤：

1. **通读代码** —— 逐文件检查
2. **无头运行** —— 执行 `godot --headless` 捕获运行时报错（覆盖范围大于编辑器内所见）
3. **逐条反馈**，按以下优先级：
   - 🔴 **Bug**：会崩溃、数据错乱、逻辑不自洽
   - 🟡 **结构**：能跑但难维护、违反本文档的架构约定
   - 🟢 **建议**：命名、注释、可以更优雅的写法
4. **更新 `docs/NOTES.md`** —— 记录这次 review 的结论和下一步

### 重点检查项

| 问题 | 说明 |
|---|---|
| `move_and_slide()` 后忘了用 `velocity` | 4.x 是 `velocity` 属性式，不是参数式 |
| 用 `TileMap` 而不是 `TileMapLayer` | 4.3 起 `TileMap` 已废弃 |
| 写死键盘键码而不是用 Input Map | 后面想支持手柄/改键会很痛 |
| 状态存在玩家节点上 | 玩家一销毁数据就没了 → 放 Autoload |
| 每帧 `queue_redraw()` 或轮询检查 | 应用信号驱动 |
| 存档写进 `res://` | 导出后只读 → 用 `user://` |
| 用 `await` 循环计时 | 难以控制、易泄漏 → 用累计 delta |
| 变量名 `pos`/`data`/`temp` | 会读不懂 |

---

## 6. 现在的下一步

M1 / M2a 已验收（进度见 README「当前进度」），当前停在 **M2b**：

1. 背包与物品数据（`ItemData` + `Inventory` 单例）
2. 播种（种子扣减 + `FarmData.plant()`）
3. 浇水（`watered` 标记 + 土壤贴图切换）
4. 作物生长（`CropData` + 天数推进）
5. 体力条 HUD（`greenbar_00~06` 已备料）
6. 存档（`user://`，序列化 `FarmData` 与背包）

施工细节：

| 主题 | 文档 |
|---|---|
| M2a 实施手册（四向 / 锄地 / 三层角色） | `M2A_PLAN.md` |
| 第 5 步锄地流程 | `M2A_STEP5_HOE.md` |
| 目标格规则 / 逐格移动 | `TOOL_TARGET_RULES.md` |
| 四向素材现状 | `FOUR_DIRECTION_ASSETS.md` |

> 本文件只维护里程碑目标与验收标准；逐轮施工记录写在 `NOTES.md`。
