# 地图结构方案 —— 地面 / 耕地 / 实体的节点选型

> 依据：M2 手册 + 本轮实测（2026-11-09 13:15）
> 前提：当前**没有任何地块贴图**，但不能因此停下架构搭建

> ⚠️ 2026-11-11 现状（读之前先看这段）：
> - `Ground` 已经是 `TileMapLayer`（不再是 Polygon2D），铺满 **120×68 = 8160 格**棋盘草地
> - `Soil` 的 TileSet 改成了**4 个独立 atlas source**（一个 source 一张 16×12 贴图），
>   状态用 `source_id` 表达、atlas 坐标恒为 `(0,0)` —— 详见 §五
> - `Decor` 已挪进 `Entities` 并开了 `y_sort_enabled`
> - 下面「一 / 二 / 三」是 2026-11-09 的选型推演，保留作历史

---

## 一、核心判断：地面和耕地要用**不同**的节点

| 层 | 节点 | 素材需求 | 理由 |
|---|---|---|---|
| **地面（草地）** | `Polygon2D`（纯色起步，后期可换 `TileMapLayer`） | **0 张** | 整片均匀，不需要逐格 |
| **耕地（已锄 / 已浇水）** | **`TileMapLayer`** | 2–3 张 16×16 | 必须逐格切状态 |
| 装饰（栅栏 / 石头 / 树） | `TileMapLayer` 或独立场景 | 以后再说 | |
| 玩家 / NPC / 掉落物 | `Entities (Node2D)`，开 `y_sort_enabled` | — | 前后遮挡 |

**为什么地面不急着上 TileMapLayer**：
草地铺满同一个 grass tile 就够了，而耕地要 2–3 个 tile 随状态切换。
**素材需求上耕地层只有 2–3 张图，比地面贴图集小得多** —— 这是绕开素材缺口最省力的办法。

`Polygon2D` 是纯 2D 节点（Node2D 子类），坐标系和 TileMapLayer 完全一致，**零素材可跑**。

---

## 二、场景树

### M2a 阶段：**根节点还是 `Main`，不动**

```
Main (Node2D)                  ← 主场景根（main.tscn，现有）
├── Ground (Polygon2D)         z_index = -2   ← 新增：纯色地面
├── Soil (TileMapLayer)        z_index = -1   ← 新增：耕地层
├── Decor (TileMapLayer)       z_index = -1   ← 新增：装饰层（先空着）
├── Boundary (StaticBody2D)    ← 现有的 Fence 改个名，4 个 CollisionShape2D 原样
└── Entities (Node2D)          ← 新增：y_sort_enabled = true, z_index = 0
    └── Player (player.tscn 实例)   ← 从 Main 移进来
        └── Camera2D                 ← Player 的子节点，跟着一起移
```

**迁移只有三步**（都在编辑器里拖）：
1. `Main` 下新建 `Entities (Node2D)` → Inspector 勾 **Y Sort Enabled**
2. 把 `Player` 拖进 `Entities`（`Camera2D` 随父节点一起走）
3. `Main` 下新建 `Ground` / `Soil` / `Decor`，把 `Fence` 改名 `Boundary`

Player 的 position 是 (159, 91)，`Entities` 在 (0,0) → **拖进去位置不变**。

### 为什么 `Boundary` 不放进 `Entities`

- 它是**隐形**边界，没有视觉 → 没有 CanvasItem 需要排序
- 放进 `Entities` 会让它的 Y=0 混进排序列表
- 放在 `Entities` **外面**，语义也更清楚：它是关卡的外框，不是"场上实体"

### 地面 / 耕地 / 装饰层为什么在 `Entities` 外面

它们是背景，**不参与 Y 排序**（否则整片地面会被按格子拆开排序，纯粹浪费）。
用 `z_index` 显式压低背景层，比依赖树顺序更稳。

### 未来的结构（M7 场景切换时再拆，现在别建）

```
Main (Node)                       ← 主场景，只管 UI 和切地图
└── World (Node2D)                ← M7 时建，当前地图实例挂这
    └── Farm (Node2D)             ← 上面那套 Main 的内容整体搬进来
        ├── Ground / Soil / Decor / Boundary
        └── Entities → Player
```

M7 切地图 = 替换 `World` 下的 `Farm` 实例。

> **现在按未来的结构命名**（Ground / Soil / Decor / Boundary / Entities），
> 将来整体搬进 `scenes/world/farm.tscn` 时**一个节点名都不用改**。

### Camera2D 的归属

现在挂在 `Player` 下 → 自动跟随，最省事，保留。
M7 切地图时，如果 Camera2D 还在 `Farm` 里会跟着被销毁，
**那时把它移到 `Main` 下**，用 `Remote` 模式跟随玩家。

---

## 三、地面 Polygon2D 的具体数值

`Polygon2D.polygon` 的点**相对节点自身 position**。position 设 (0,0) 时，点直接写世界坐标。

| 农场尺寸 | 地面矩形 |
|---|---|
| 20 × 10 格 | x ∈ [-16, 368]，y ∈ [-24, 208] |
| 24 × 12 格 | x ∈ [-16, 432]，y ∈ [-24, 240] |

```gdscript
# 24×12 格农场
$Polygon2D.polygon = PackedVector2Array([
    Vector2(-16, -24), Vector2(432, -24),
    Vector2(432,  240), Vector2(-16, 240),
])
$Polygon2D.color = Color(0.32, 0.47, 0.22)
```

> **地面必须画得比墙的范围大一圈。**
> 玩家脚底在 y=16 时身体会往上伸到 y=0（角色高 16px）。
> 地面顶边如果只画到 y=16，角色在顶部那排时会"浮"在空白上。

---

## 四、耕地 TileMapLayer 的坐标锚点（实测）

层放在 `(16, 16)`、`tile_size = (16,16)` 时：

```
map_to_local((0,0))   = (8, 8)      ← 格子 (0,0) 的中心（局部坐标）
map_to_local((1,0))   = (24, 8)
local_to_map((16,16)) = (1, 1)      ← 局部 (16,16) 属于格子 (1,1)
```

**关键结论**：`local_to_map` / `map_to_local` 走的是**该层的局部空间**。
层自身 position 不影响这个映射，只影响全局位置。

所以设 `Soil.position = (16, 16)` 后：

| 农场尺寸 | 格子范围 |
|---|---|
| 20 × 10 格 | x ∈ [0, 19]，y ∈ [0, 9] |
| 24 × 12 格 | x ∈ [0, 23]，y ∈ [0, 11] |
| **120 × 68 格（当前）** | x ∈ [0, 119]，y ∈ [0, 67] |

格子 (c, r) 覆盖全局 x ∈ [16+16c, 16+16(c+1))、y ∈ [16+16r, 16+16(r+1))。

> 当前 `Soil.position = (0,0)`（没设偏移），所以格子 (c, r) 实际覆盖 x ∈ [16c, 16(c+1))、y ∈ [16r, 16(r+1))。

### ⚠️ 坐标空间陷阱（复测确认）

```gdscript
# 层偏移 (100,50)，玩家全局位置 (160,80)
local_to_map(世界(160,80))              = (10, 5)   ❌ 错的格子
local_to_map(to_local(世界(160,80)))    = (3, 1)    ✅
```

**永远这么写：**
```gdscript
var cell := soil.local_to_map(soil.to_local(player.global_position))
```

---

## 五、TileSet 的搭建

### 编辑器路径（当前实际做法：4 个独立 source）

1. 选中 `Soil` → Inspector → **Tile Set** → 新建 TileSet
2. 展开 TileSet → **Tile Size 确认 16×16**（新建默认**就是 16×16**，不用改）
3. 底部 TileSet 面板 → 左侧 source 列表 `+` → **Atlas**，建 **4 个**（一个状态一个）
4. 每个 source：
   - **Texture** → 选对应的 16×12 贴图
   - **Texture Region Size** → 改成 **16×12**（默认 16×16，**必须改**）
   - 顶部 **⋮ 菜单 → Create Tiles in Non-Transparent Texture Regions** 建 tile
5. `Soil` 节点 → `tile_set` 指到这个 TileSet

### 为什么是 4 个独立 source，而不是合成一张图集

状态（干土 / 湿土 / 播种 / 生长）直接对应 `source_id`，atlas 坐标恒为 `(0,0)`：

```
set_cell(cell, SRC_DRY, Vector2i(0, 0))
```

好处：单态换图/重画不牵动其他态、加第 5 态只要加第 5 个 source、不用记图集内坐标。

### ⚠️ 最容易踩的坑：`texture_region_size` 大于贴图 → 图集直接归零

```
atlas_grid = floor(贴图尺寸 ÷ texture_region_size)
```

| 贴图 | region | atlas_grid | 结果 |
|---|---|---|---|
| 1024×1024 | 16×16 | 64×64 | 4096 格 ✅ |
| 16×12 | 16×12 | 1×1 | 1 格 ✅ |
| **16×12** | **16×16** | **1×0** | **0 格** ❌ |

`region` 一旦大于贴图，高度 `12 ÷ 16 = 0` → **一个有效格子都没有**。后果是：
自动切片切不出来、**「Create Tiles in Non-Transparent Texture Regions」也建不出来**
（它扫的就是有效区域，没区域可扫）、`set_cell` 写进去了但渲染时找不到 tile →
`The Image width specified (0 pixels)` → **屏幕上什么都不显示，也不崩**。

排查口诀：**贴图挂上了却什么都不显示，先查 `texture_region_size`，再查有没有 `0:0/0 = 0` 这种 tile 条目。**

另外两个要点：
- **自动切片用的是 `TileSet.tile_size`，不是贴图尺寸** —— 所以 16×12 的图自动切不出来，
  合成成 64×16 反而能切（高度补到了 16）。
- **贴图挂上 ≠ 有 tile**。`0:0/0 = 0` 才是"这张表的 (0,0) 处有一个 tile"的声明，
  不会被自动生成，得靠拖图时的弹窗或 ⋮ 菜单显式创建。

### 代码路径（可脚本化，实测通过）

```gdscript
var ts := TileSet.new()
ts.tile_size = Vector2i(16, 16)

var src := TileSetAtlasSource.new()
src.texture = load("res://assets/game/soil/soil_00.png")
src.texture_region_size = Vector2i(16, 12)   # ⚠️ 必须 ≤ 贴图尺寸
src.create_tile(Vector2i(0, 0))               # ⚠️ 返回 void，别接收返回值

var sid := ts.add_source(src)                  # 返回 source_id，从 0 开始
soil.tile_set = ts
```

### 两个实测注意要点

**① `create_tile()` 返回 void**
```gdscript
var err := src.create_tile(...)   # ❌ 解析错误
src.create_tile(...)              # ✅
```

**② 贴图没被导入时 `create_tile` 会失败**
报 `Cannot create tile. The tile is outside the texture...` —— **不是尺寸问题**，
是缺 `.import` 导致 `load()` 返回 null。先跑：
```bash
godot --headless --path . --import
```

---

## 六、铺地与刷新

```gdscript
# 铺满整块农场
for x in range(cols):
    for y in range(rows):
        soil.set_cell(Vector2i(x, y), 0, Vector2i(0, 0))

# 刷新某一格（改状态后）：换 source_id 就是换状态
soil.set_cell(cell, SRC_WET, Vector2i(0, 0))
```

| 情况 | 处理 |
|---|---|
| 同一格已被锄过 | 拒绝（或设计"复原"） |
| 换状态 | **直接 `set_cell(cell, 新 source_id, (0,0))`**，不用先 `erase_cell` —— `set_cell` 本来就是覆盖写 |
| 要同时显示"耕地 + 浇水" | 再开一个 `Water` TileMapLayer；或者给同一 source 建**替代 tile**（alternative tile）用 `modulate` 表达干湿 |

> `update_internals()` 在 Godot 4 已经不需要了（4.x 里 `set_cell` 会自己触发重绘）。

---

## 七、现在就能做的 / 要等贴图的

| 现在就能做（0 素材） | 等贴图 |
|---|---|
| 定农场尺寸（20×10 或 24×12） | 建 TileSet + Atlas Source |
| `Polygon2D` 纯色地面 | 填耕地 / 浇水地的 tile |
| `Soil` TileMapLayer 节点先建好（tile_set 留空） | 铺地（或者代码铺） |
| `FarmData` Autoload + `Dictionary[Vector2i, SoilData]` | |
| 锄地逻辑（改状态 + set_cell） | |
| Camera2D 的 limit（若选 24×12） | |

**set_cell 在 TileSet 为空时不会报错，只是不显示** —— 所以逻辑可以先跑通，
等贴图到位只填 TileSet 就行，不用返工。

---

## 八、镜头限制（选 24×12 时）

`Camera2D` Inspector：
```
Limit Left   = 16
Limit Top    = 16
Limit Right  = 400
Limit Bottom = 208
```

源码依据 `scene/2d/camera_2d.cpp:170-190`：限制区必须**大于**视口，
否则走"居中"分支，镜头不再跟随玩家。24×12 = 384×192 > 320×180 ✅
