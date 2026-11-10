# M2 · 农场地块系统 —— 施工手册

> 目标：能用锄头把地锄开，播种，作物每天生长，成熟后收获。
> 本文档只提供**已核实的事实**和**施工顺序**。代码与操作由实现方完成，review 方负责验收。

---

## 0. 先把 M2 拆开

M2 的完整目标依赖 M3（背包）和 M4（时间），一次性实现会导致范围失控。拆分方式：

| 子阶段 | 内容 | 依赖 |
|---|---|---|
| **M2a** | 场景骨架 + TileMapLayer + TileSet + 铺地 + 地块状态字典 + 锄地交互 | 无 |
| **M2b** | 播种 / 生长 / 收获 | 需要 M3 背包（种子）、M4 时间（每天推进） |

**本轮做 M2a。** 验收标准：

- [ ] 场景里有一片铺好的地面，走起来能看出是格子
- [ ] 按一个键能把脚下/面前那一格锄开，画面上能看出区别
- [ ] 已锄的格子有状态记录，关掉游戏再开（状态在 Autoload 里）能还在
- [ ] 不能对同一格重复锄、不能对已锄过的地重复锄（除非设计了"复原"机制）

---

## 1. 已核实的 API（4.7.2 无头实测，不是记忆）

以下全部在 `godot --headless` 下实测通过：

### TileMapLayer

| API | 实测结果 |
|---|---|
| `set_cell(coords, source_id, atlas_coords, alternative_tile = 0)` | ✅ 正常写入 |
| `get_cell_source_id(coords) -> int` | ✅ 有格子返回 source_id；**空格返回 -1** |
| `get_cell_atlas_coords(coords) -> Vector2i` | ✅ 返回图集内坐标 |
| `get_cell_alternative_tile(coords) -> int` | ✅ 返回 0/1 |
| `erase_cell(coords)` | ✅ 擦除后 `get_cell_source_id` 变 **-1** |
| `get_used_cells() -> Array[Vector2i]` | ✅ 返回已用格子列表 |
| `map_to_local(Vector2i) -> Vector2` | ✅ 格子 (0,0) → **(8, 8)**（即格子中心，16×16） |
| `local_to_map(Vector2) -> Vector2i` | ✅ 局部坐标 → 格子坐标 |
| `update_internals()` | ✅ 存在。**改动后需要调**，否则当帧不生效 |

### TileSet（代码创建时的 API）

| API | 实测结果 |
|---|---|
| `TileSet.tile_size = Vector2i(16, 16)` | ✅ 生效 |
| `TileSetAtlasSource.texture_region_size = Vector2i(16,16)` | ✅ 生效 |
| `TileSetAtlasSource.create_tile(Vector2i)` | ⚠️ **返回 void**（曾误写为 `var err := create_tile()`，导致解析报错） |
| `TileSetAtlasSource.has_tile(Vector2i)` | ✅ 存在 |
| `TileSet.add_source(src) -> int` | ✅ 返回 source_id（从 0 开始） |
| `TileSet.get_source_count() / get_source_id(i)` | ✅ 正常 |
| `TileSet.add_physics_layer()` / `set_physics_layer_collision_layer()` | ✅ 正常 |

### 两个实测注意要点

**① `create_tile()` 返回 void**
```gdscript
# ❌ 解析错误
var err := src.create_tile(Vector2i(0,0))
# ✅
src.create_tile(Vector2i(0,0))
```

**② 贴图没被导入时 `create_tile` 会失败**
报错：`Cannot create tile. The tile is outside the texture or tiles are already present...`
原因不是尺寸不对，而是 **`.png` 还没被 Godot 导入**（缺 `.import` 文件），`load()` 返回 null。
新放一张图进项目后，先跑一次：
```bash
/Applications/Godot.app/Contents/MacOS/Godot --headless --path . --import
```
或者在编辑器里让它自己导入完。

---

## 2. ⚠️ 主要陷阱：坐标空间

**`local_to_map()` 收的是该 TileMapLayer 的「局部坐标」，不是全局坐标。**

实测（layer 挂在偏移了 (-30,20) 的父节点下，layer 自身偏移 (100,50)，玩家全局位置 (160,80)）：

```
player.global_position              = (160, 80)
layer.global_position               = (70, 70)
layer.to_local(player.global_position) = (90, 10)

直接 local_to_map(global_position)  = (10, 5)   ← ❌ 错的格子
local_to_map(to_local(global))     = (5, 0)    ← ✅ 对的格子
```

**所以永远这么写：**
```gdscript
var cell := soil_layer.local_to_map(soil_layer.to_local(player.global_position))
```

> 如果 TileMapLayer 正好在原点且父节点没偏移，两种写法结果一样 —— 所以这坑在早期
> 该写法无法通过测试验证，农场位置一旦变更即全部错位。**应在一开始就采用正确写法。**

---

## 3. 施工顺序

### 步骤 1 · 场景骨架

新建 `scenes/world/farm.tscn`（根节点 `Node2D`）：

```
Farm (Node2D)
├── Ground (TileMapLayer)        地面
├── Soil (TileMapLayer)          已锄的土（初始全空）
├── Decor (TileMapLayer)         栅栏/石头（先留空）
└── Entities (Node2D)            y_sort_enabled = true
    └── Player (player.tscn 实例)
```

**Y 排序说明**：Godot 4 里在 `Node2D` 或 `TileMapLayer` 上开 `Y Sort Enabled`，
子节点按 Y 坐标决定遮挡顺序。地面/土壤层放在 `Entities` **外面**（它们是背景，不参与排序），
这样玩家走到树后面才会被树挡住。

### 步骤 2 · 准备地块贴图

**这是当前唯一的素材缺口**：素材包里 186 个 PNG 全是角色，**一块地块贴图都没有**。
需要获取一套 farm tileset 或自行绘制。

**技术要求（决定了后面所有事）：**

| 项 | 值 | 为什么 |
|---|---|---|
| **单格尺寸** | **16×16 像素** | 视口 320×180 → 20×11 格可见，正好是《星露谷》的比例；角色 11×16 像素，**正好一格高** |
| 图集组织 | 横排或方阵都行 | 但每格必须严格 16×16 |
| 纹理过滤 | Nearest | 项目已全局设为 0，导入时也选 Nearest |
| 需要的 tile | 至少 3 个 | 草地 / 已锄的土 / 已浇水的土 |

> 16×16 由当前视口尺寸与角色尺寸推算得出。
> 若采用 32×32 地块，视口 320×180 仅剩 10×5.6 格可见，视野局促。

### 步骤 3 · 建 TileSet

**编辑器路径**：

1. 选中 `Ground` 节点 → Inspector → **Tile Set** → `<empty>` → **新建 TileSet**
2. 底部 **TileSet 面板** → 点 **Atlas** 标签（第一个图标）→ **新建 Atlas Source**
3. 选择地块贴图
4. **Tile Size 改成 16×16**（新建时默认是 64×64，**这一步必须改**）
5. 在图集网格上右键 → **Create Tile**，逐个或框选批量创建所需 tile

**代码路径**（可脚本化、可复现）：
```gdscript
var ts := TileSet.new()
ts.tile_size = Vector2i(16, 16)
var src := TileSetAtlasSource.new()
src.texture = load("res://assets/tilesets/farm_tiles.png")
src.texture_region_size = Vector2i(16, 16)
src.create_tile(Vector2i(0, 0))      # ← 返回 void，别接收
var sid := ts.add_source(src)
```

> `tile_size` 是 **TileSet 的属性**，不是 TileMapLayer 的。别在 TileMapLayer 上找。

### 步骤 4 · 铺地

**手动铺**（适合先看效果）：选中 TileMapLayer → 顶部工具栏选一个 tile → 左键点格子。

**代码铺**（适合铺一大片）：
```gdscript
for x in range(40):
    for y in range(30):
        ground.set_cell(Vector2i(x, y), 0, Vector2i(0, 0))
```

**规模要求**：视野为 20×11 格，农场至少需 30×20 格才具备超出边界的空间感。
地块大点无所谓，TileMapLayer 只存用到的格子。

### 步骤 5 · 地块状态数据（方案 C）

按路线图定的组合：**C 存数据 + A 表现**。

- 新建 `scripts/autoload/farm_data.gd`，`class_name FarmData`
- 在 **项目设置 → 全局 → 自动加载** 里注册成 `FarmData`
- 内部存：`var soils: Dictionary[Vector2i, SoilData] = {}`

**SoilData 采用 Resource 实现**（这样将来能加"湿度""施肥天数"等字段而不破坏存档）：
```gdscript
class_name SoilData
extends Resource

enum State { UNTILLED, TILLED, WATERED, GROWING, MATURE }

@export var state: State = State.UNTILLED
@export var crop_id: StringName = &""
@export var growth_days: int = 0
```

> **为什么必须放 Autoload**：玩家场景随时可能被销毁重建（进菜单、切换地图），
> 但地块状态必须活着。这是新手最常见的"数据丢失"错误。

### 步骤 6 · 锄地交互

1. 新增输入动作 `action_use_tool`（**项目设置 → 输入映射**，不要写死键码）
2. 玩家脚下/面前的格子：
   ```gdscript
   var target := player.global_position + facing_vector * 16.0
   var cell := soil_layer.local_to_map(soil_layer.to_local(target))
   ```
   > 锄地目标应为"面朝方向的前一格"而非"脚下那格"。`facing` 变量已在 M1 实现。
3. 改状态：`FarmData.soils[cell] = ...`（state → TILLED）
4. 刷新表现：`soil_layer.set_cell(cell, 0, atlas_coords_of_tilled_soil)`

### 步骤 7 · 刷新表现的边界情况

| 情况 | 处理 |
|---|---|
| 同一格已被锄过 | 拒绝（除非设计了"复原"） |
| 从 TILLED 改 WATERED | 先 `erase_cell(cell)` 再 `set_cell(新tile)`，否则图集坐标冲突 |
| 状态改回去了 | 同上，`erase_cell` 是干净的撤销方式 |

**同一格永远只对应一个 tile**。想同时显示"耕地+浇水"两个效果，就该用**两个 TileMapLayer**
（`Soil` 和 `Water`），这正是方案 A 的用武之地。

---

## 4. 常见问题清单

| 问题 | 后果 | 正确做法 |
|---|---|---|
| `local_to_map(global_position)` | 格子算错（农场一挪就全错位） | 先 `to_local()` |
| TileSet 的 `tile_size` 没改成 16×16 | 格子巨大，铺出来是一张图 | 改 TileSet，不是 TileMapLayer |
| 用旧的 `TileMap` 节点 | 4.3 起已废弃 | 用 `TileMapLayer` |
| 地块状态存在 Player 节点上 | 玩家一销毁数据就没了 | 放 Autoload |
| 忘了 `update_internals()` | 当帧看不到变化 | 改完调一下 |
| 同一格 set_cell 两次不同图集坐标 | 显示错乱 | 先 `erase_cell` |
| 2D 俯视里用 `get_gravity()` | 角色静悄悄掉出屏幕 | 删掉，俯视游戏没有重力 |
| 地块贴图没导入就建 TileSet | `create_tile` 报错 | 先跑 `--import` |

---

## 5. Review 流程

M2a 完成后提交 review，包含以下步骤：

1. 逐行检查脚本
2. `godot --headless` 跑一遍抓运行时错误
3. **无头模拟按键**，验证：锄地后格子状态确实变了、`get_used_cells` 正确、
   坐标换算在 layer 有偏移时依然正确
4. 逐条反馈（🔴 Bug / 🟡 结构 / 🟢 改进项）

---

## 6. 现在的问题

**唯一卡点：地块贴图。** 素材包里没有。

两条路：
- **A**：获取一套 farm tileset（16×16 或可重切为 16×16）
- **B**：自行绘制若干 16×16 色块以先跑通逻辑

在这之前，场景骨架、TileSet 结构、地块状态字典、锄地逻辑**都可以先做**，
仅为暂时不可见地块。若优先实现逻辑，可先完成**步骤 1、5、6**，取得贴图后再补 2、3、4。
