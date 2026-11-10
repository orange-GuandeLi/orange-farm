# 地图结构方案 —— 地面 / 耕地 / 实体的节点选型

> 依据：M2 手册 + 本轮实测（2026-11-09 13:15）
> 前提：当前**没有任何地块贴图**，但不能因此停下架构搭建

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

格子 (c, r) 覆盖全局 x ∈ [16+16c, 16+16(c+1))、y ∈ [16+16r, 16+16(r+1))。

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

## 五、TileSet 的搭建（等贴图到位再做）

### 编辑器路径

1. 选中 `Soil` → Inspector → **Tile Set** → 新建 TileSet
2. 底部 TileSet 面板 → **Atlas** 标签 → **New Atlas Source** → 选贴图
3. **Tile Size 改 16×16**（新建默认 64×64，这步必须改）
4. 网格上右键 → **Create Tile**，至少建 2 个：`耕地`、`浇水耕地`

### 代码路径（可脚本化，实测通过）

```gdscript
var ts := TileSet.new()
ts.tile_size = Vector2i(16, 16)

var src := TileSetAtlasSource.new()
src.texture = load("res://assets/tilesets/soil.png")
src.texture_region_size = Vector2i(16, 16)
src.create_tile(Vector2i(0, 0))      # ⚠️ 返回 void，别接收返回值
src.create_tile(Vector2i(1, 0))

var sid := ts.add_source(src)         # 返回 source_id，从 0 开始
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

# 刷新某一格（改状态后）
soil.set_cell(cell, 0, Vector2i(1, 0))
soil.update_internals()     # 改完不调则当帧不生效
```

| 情况 | 处理 |
|---|---|
| 同一格已被锄过 | 拒绝（或设计"复原"） |
| 从耕地改浇水地 | 先 `erase_cell(cell)` 再 `set_cell(新 tile)`，否则图集坐标冲突 |
| 要同时显示"耕地 + 浇水" | 再开一个 `Water` TileMapLayer（这正是方案 A 的用武之地） |

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
