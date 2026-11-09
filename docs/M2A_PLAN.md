# M2a 实施手册：4 向朝向 + 星露谷式锄地

> 目标：**不换角色美术**，只把"面朝哪一格"改成 4 向，然后按星露谷的规则锄地。
> 本手册所有坐标、格数、API 结论都是在你项目上**实测过的**，不是推测。

---

## 0. 先纠正一个前提：星露谷是 8 向移动 + 4 向动画

你之前选了"改成 4 方向移动"。查证后要更正：

> 星露谷角色的移动是**八个方向**（上下左右 + 四个斜向），但**展示的动画只有上下左右四个**。

（出处：[CSDN《从零开始的星露谷-用Unity还原星露谷物语:移动,界面篇》](https://blog.csdn.net/weixin_33781072/article/details/111978088)
原文："星露谷中人物的移动有八个方向：上下左右，左上，左下，右上右下，实际上展示的动画只有上下左右四个"；
[UQcsse3200 Studio 1 Wiki](https://github.com/UQcsse3200/2023-studio-1/wiki/Player-Design-and-Animation)
："The player is able to both walk and run in any direction, although the core animation set only features 4 directional animation for simplicity."）

**这对你极其有利**：

| | 星露谷真实做法 | 你的项目要改成 |
|---|---|---|
| 移动 | 8 向（可斜走） | **8 向 —— 一行都不用改** ✅ |
| 角色动画 | 4 向 | 4 向 → 但你只有 2 向（左右翻面），上下共用正面图 |
| 朝向数据 | 4 向 | **要改**：从 `int`（±1）改成 `Vector2i` |
| 锄地目标格 | 面朝的那一格 | 同上 |

**结论**：移动代码 `Input.get_vector(...)` 保持原样，**只改 `facing` 和朝向判定**。

---

## 1. 星露谷的锄地规则（先把规则钉死）

### 1.1 核心规则
1. **只能锄面朝的那一格**，不是脚下那格。
2. 目标格 = `角色所在格 + 朝向`。
3. 已开垦的格不能重复锄（星露谷会提示"这里已经锄过了"）。
4. 锄地有动画，**动画期间不能移动、不能连续锄**。
5. 锄地消耗体力（可后加）。
6. 锄完那格变成"耕地"（可播种）。

### 1.2 "角色所在格"怎么定义（这是最容易算错的地方）

你的角色**原点在脚底**，身体向上延伸 16px。所以：

```
角色身体占据的格 = 脚底所在的那一格
```
- 脚底 Y=176 → 身体 y∈[160,176] → 在**格 10**（y 160~176）
- 脚底 Y=160 → 身体 y∈[144,160] → 在**格 9**（y 144~160）

如果直接 `floor(y/16)`：
- `floor(176/16) = 11` ❌（脚底正好在格边界，会被算到下一格）
- `floor(160/16) = 10` ❌

**必须减 1 再取整**：
```gdscript
var cell := Vector2i(
    int(floor(pos.x / 16.0)),
    int(floor((pos.y - 1.0) / 16.0))
)
```
验证：
- `floor((176-1)/16) = floor(10.9375) = 10` ✅
- `floor((160-1)/16) = floor(9.9375) = 9` ✅

> **为什么 X 轴不减 1**：X 方向角色是**居中**的（碰撞盒 12 宽，中心在原点），
> 所以 X 用中心点所在格 `floor(pos.x/16)` 才对。Y 方向角色是**单边**的（脚在下沿），
> 所以 Y 要用"脚底那一像素"所在格，减 1 避开边界。
>
> 这个不对称不是 bug，是几何事实。

### 1.3 目标格
```gdscript
var target := cell + facing
```

举例（玩家脚底 Y=176，站在格 10）：
| 朝向 | 目标格 | 世界坐标 | 视觉上 |
|---|---|---|---|
| UP (0,-1) | 格 (x, 9) | y 144~160 | 身体正前方上方 ✅ |
| DOWN (0,1) | 格 (x, 11) | y 176~192 | 身体正前方下方 ✅ |
| LEFT (-1,0) | 格 (x-1, 10) | 左边一格 ✅ |
| RIGHT (1,0) | 格 (x+1, 10) | 右边一格 ✅ |

### 1.4 越界判定
农场可活动范围是 `x∈[16,656]`、`y∈[16,432]`，对应格 `x∈[1,41]`、`y∈[1,27]`。
目标格超出这个范围 → 不能锄（星露谷里你也不能锄到地图外面）。

---

## 2. 第一步：把 `facing` 改成 4 向

### 2.1 现在的问题
`scripts/actors/player.gd` 第 4 行：
```gdscript
var facing := 1        # 只有左右两个值
...
if direction.x < 0: facing = -1
elif direction.x > 0: facing = 1
animation.flip_h = facing < 0
```
只有水平朝向，**上下完全丢失**。

### 2.2 改成 Vector2i
```gdscript
var facing := Vector2i.DOWN     # UP / DOWN / LEFT / RIGHT
```
Godot 4 的 `Vector2i` 有现成常量：`Vector2i.UP = (0,-1)`、`DOWN = (0,1)`、`LEFT = (-1,0)`、`RIGHT = (1,0)`。

### 2.3 朝向判定：星露谷式"最后按下的方向优先"

```gdscript
func _update_facing(direction: Vector2) -> void:
	if direction == Vector2.ZERO:
		return                                  # 没在动 → 朝向不变
	# ① 刚按下的键优先（星露谷：后按的键赢）
	if Input.is_action_just_pressed("move_up"):
		facing = Vector2i.UP
	elif Input.is_action_just_pressed("move_down"):
		facing = Vector2i.DOWN
	elif Input.is_action_just_pressed("move_left"):
		facing = Vector2i.LEFT
	elif Input.is_action_just_pressed("move_right"):
		facing = Vector2i.RIGHT
	else:
		# ② 没有新按键（长按 / 只剩一个键）→ 取主轴
		if absf(direction.x) > absf(direction.y):
			facing = Vector2i.LEFT if direction.x < 0.0 else Vector2i.RIGHT
		else:
			facing = Vector2i.UP if direction.y < 0.0 else Vector2i.DOWN
```

**为什么需要 ② 这个兜底**：
- 按住 Right，再按 Up → ① 生效，朝向 UP ✅
- 然后松开 Up（还按着 Right）→ 没有新按键 → ② 生效，`direction = (1,0)` → 朝向 RIGHT ✅
- 没有 ② 的话，松开 Up 后朝向会卡在 UP，角色会横着走但脸朝上。

`Input.get_vector` 返回的是**归一化**向量，斜按时是 `(0.707, 0.707)`，
所以 `absf(x) > absf(y)` 的主轴比较在斜按时会落到 x 轴（右）——
这符合直觉（同时按右+上，更偏向右）。想要偏向别的轴就调换比较顺序。

### 2.4 `flip_h` 怎么处理（关键！）

```gdscript
if facing.x != 0:
	animation.flip_h = facing.x < 0
# facing 是 UP / DOWN 时，什么都别做 —— 保持上一次的水平朝向
```

**为什么上下时不能动 `flip_h`**：
你的角色是**正面朝向镜头**的（实测：两只眼睛、粉色腮红、双手都在身前）。
它没有背面图，所以朝上朝下时只能继续显示正面。
如果这时把 `flip_h` 重置成 false，角色会在你按下"上"的瞬间**突然换脸**（左右镜像跳变）。
保持不变最自然。

### 2.5 完整的 player.gd 参考实现

> 这是给你参考的完整版，**你自己粘进 `scripts/actors/player.gd`**。
> 我把每一段都标了注释。

```gdscript
extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $AnimatedSprite2D

## 面朝方向：UP / DOWN / LEFT / RIGHT
## 朝上朝下时角色仍显示正面（美术没有背面图），flip_h 保持不变
var facing := Vector2i.DOWN

const SPEED = 80.0

## 锄地/使用工具的输入动作名（要在 Input Map 里建好）
const USE_ACTION := "use_tool"

## 正在播放工具动作时为 true，此时锁定移动
var _busy := false


func _physics_process(delta: float) -> void:
	if _busy:
		# 工具动作期间：停住、不接受移动输入
		velocity = Vector2.ZERO
		move_and_slide()
		return

	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	if direction == Vector2.ZERO:
		animation.play("idle")
	else:
		animation.play("walk")
		_update_facing(direction)

	velocity = direction * SPEED
	move_and_slide()

	# 左右朝向时翻转；上下朝向保持不变
	if facing.x != 0:
		animation.flip_h = facing.x < 0


## 根据移动输入更新 4 向朝向
func _update_facing(direction: Vector2) -> void:
	if direction == Vector2.ZERO:
		return
	if Input.is_action_just_pressed("move_up"):
		facing = Vector2i.UP
	elif Input.is_action_just_pressed("move_down"):
		facing = Vector2i.DOWN
	elif Input.is_action_just_pressed("move_left"):
		facing = Vector2i.LEFT
	elif Input.is_action_just_pressed("move_right"):
		facing = Vector2i.RIGHT
	else:
		if absf(direction.x) > absf(direction.y):
			facing = Vector2i.LEFT if direction.x < 0.0 else Vector2i.RIGHT
		else:
			facing = Vector2i.UP if direction.y < 0.0 else Vector2i.DOWN


## 角色当前站在哪一格（16x16 网格）
## 注意：Y 轴要减 1，因为角色原点在脚底，脚底正好压在格边界时会被算到下一格
func current_cell() -> Vector2i:
	var p := global_position
	return Vector2i(
		int(floor(p.x / 16.0)),
		int(floor((p.y - 1.0) / 16.0))
	)


## 工具的目标格 = 当前格 + 朝向
func target_cell() -> Vector2i:
	return current_cell() + facing
```

---

## 3. 第二步：加一个"使用工具"的输入动作

### 3.1 在编辑器里加（不要手改 project.godot）
`Project → Project Settings → Input Map` → 搜 `use_tool` → 新建 → 绑定一个键（建议 **E** 或 **空格**）。

> ⚠️ 你 Godot 编辑器常开着，**不要直接改 `project.godot` 文本**。

### 3.2 之后用鼠标点击也能加（星露谷是鼠标点地块）
M2a 先用键盘。鼠标方案放到 M2b：鼠标世界坐标 → 格 → 直接当目标格，
这时键盘和鼠标两套输入要合并成一个 `target_cell()`。

---

## 4. 第三步：地块状态数据

### 4.1 为什么状态不能存在 TileMapLayer 里
`TileMapLayer` 只知道"这格画哪个图"，不知道"这格种了什么、第几天、浇没浇水"。
**逻辑状态必须单独存**，表现层只是状态的投影。

### 4.2 状态结构

```gdscript
# scripts/data/soil_data.gd
class_name SoilData
extends Resource

## 地块的主状态
enum State {
	UNTILLED,   ## 未开垦（普通地面）
	TILLED,     ## 已锄好，空地
	SEEDED,     ## 已播种
	GROWING,    ## 生长中
	MATURE,     ## 可收获
}

@export var state: State = State.UNTILLED

## 浇水标记（与生长阶段正交，星露谷里就是独立的）
@export var watered := false

## 连续浇过几天水（作物缺水会倒退）
@export var watered_days := 0

## 种的是什么（M2a 先空着，M2b 接作物）
@export var crop_id: StringName = &""

## 已经长了几��
@export var growth_days := 0
```

**为什么浇水是独立布尔而不是状态之一**：
星露谷里"第 3 天生长中 + 已浇水"是同时成立的。
如果把浇水塞进 State 枚举，你会得到 `TILLED_WATERED` / `GROWING_WATERED` / `SEEDED_WATERED`… 组合爆炸。

### 4.3 全局仓库（Autoload）

```gdscript
# scripts/data/farm_data.gd
extends Node

## 格子坐标 -> 地块状态
## 没开垦的格子不存（省内存），get() 返回 null 即表示未开垦
var tiles: Dictionary[Vector2i, SoilData] = {}


## 取某格状态；未开垦返回 null
func get_tile(cell: Vector2i) -> SoilData:
	return tiles.get(cell)


## 写入某格状态
func set_tile(cell: Vector2i, data: SoilData) -> void:
	tiles[cell] = data


## 该格是否已开垦
func is_tilled(cell: Vector2i) -> bool:
	return tiles.has(cell)


## 锄地：成功返回 true
func till(cell: Vector2i) -> bool:
	if tiles.has(cell):
		return false                       # 已经锄过了
	var d := SoilData.new()
	d.state = SoilData.State.TILLED
	tiles[cell] = d
	return true
```

### 4.4 注册成 Autoload
`Project → Project Settings → Autoload` → 添加 `FarmData` → 路径选 `scripts/data/farm_data.gd`。

注册后全局直接 `FarmData.till(cell)` 就能用，不用 `get_node()`。

---

## 5. 第四步：表现层（把状态画出来）

### 5.1 用哪个 TileMapLayer
你场景里已经有 `Soil (TileMapLayer)`，正好派上用场：

```
Main
├── Ground (TileMapLayer)   z=0   草地
├── Soil   (TileMapLayer)   z=0   ← 耕地（挖出来的土坑 / 作物）
├── Decor  (TileMapLayer)   z=0   装饰（在 Entities 里，参与 Y 排序）
└── Entities (y_sort=true)
    └── Player
```

**层次为什么对**（实测过 `renderer_canvas_cull.cpp` 的分桶逻辑）：
- `Ground` / `Soil` 在 `Entities` **外面** → 靠 Main 的树序排在前面 → 永远在玩家**下面** ✅
- 耕地就是地面的一部分，在玩家下面才是对的
- `z_index` 都保持 0，**不要设负值**（负 z 会把整个层压到别的 z 桶里）

### 5.2 坐标陷阱（我实测踩过的）
`local_to_map` 收的是**该层的局部坐标**，不是全局坐标。

```
层偏移 (100,50)、玩家全局 (160,80)：
  直接传 global → local_to_map((160,80)) = (10,5)   ❌
  正确 local_to_map(to_local(global))  = (3,1)      ✅
```

**但 M2a 你根本不需要 `local_to_map`** —— 我们用 `facing` 直接算格号。
前提是 `Soil.position == (0,0)`（实测：是的），那么：

```gdscript
var cell := Vector2i(
	int(floor(target_world.x / 16.0)),
	int(floor((target_world.y - 1.0) / 16.0))
)
```
和 `current_cell()` 用的是同一套公式，只是换成目标格的世界坐标。

### 5.3 锄完之后画土坑
```gdscript
soil.set_cell(cell, 0, Vector2i(atlas_x, atlas_y))   # 换成你的泥土贴图坐标
```
`set_cell` 在 TileSet 为空时不报错（只是不显示），所以**记得先给 `Soil` 挂 TileSet 资源**。

### 5.4 贴图来源（你要去搞的）
- **耕地贴图**：主图集里就有现成的棕色泥土 tile（`c19 r7` / `c20 r7` / `c19 r8` / `c20 r8`，16×16，四张随机拼成田地）
- **铲子图标**（道具栏用）：16×16 左右
- **铲子动画**：现有的 `assets/Characters/Human/DIG/tools_dig_strip13.png` 就是一把铲子，可以直接用；
  如果要换，保持**13 帧 / 每帧 96×64 / 帧内铲子位置不变**就行

---

## 6. 第五步：铲子动作怎么接（重点：别搞双层同步）

### 6.1 先纠正图层语义（实测得出，2026-11-09）

LimeZu 这套角色的每个动作目录（`IDLE/` `WALKING/` `RUN/` `DIG/` …）里有三类图层，
**命名和直觉不一样**：

| 层 | 文件 | 实测内容 |
|---|---|---|
| 身体 | `base_<动作>_stripN.png` | 头 + 躯干 + 腿，**无头发、无手臂** |
| 头发 | `<发型>_hair_<动作>_stripN.png` | 6 种发型各一层 |
| 手臂/工具 | `tools_<动作>_stripN.png` | **idle/walk/run 是空手手臂；dig 才是手臂+铲子** |

> "tools 层其实是手臂层"的证据：idle 的 tools 层像素落在 base 层**本身全透明**的
> `(43,34)` 位置，填的是肤色 `(232,173,125)` / 深色 `(23,20,36)` —— 那是一只没画在
> body 层里的手。**少这一层角色就缺手臂**，所以三层必须同时常显。

每个动作目录自带 tools 层 → 工具动画全套齐备：
`DIG`=铲子、`AXE`=斧头、`MINING`=镐、`WATERING`=洒水壶、`HAMMERING`=锤子、`ATTACK`=剑。

### 6.2 ✅ 正确做法：三层加节点（已实施并复验通过）

**不要预烘焙。** 烘焙会把"身体×发型×工具"的组合焊死成一张图，换一层就要重烘焙一条新 strip。
加节点方案里三层独立，换发型/换工具只是切动画名，零重烘焙。

```
Player (CharacterBody2D)
├── BodySprite   (AnimatedSprite2D)  pos=(0,-5)   身体层
├── HairSprite   (AnimatedSprite2D)  pos=(0,-5)   头发层
├── ToolSprite   (AnimatedSprite2D)  pos=(0,-5)   手臂/工具层
├── CollisionShape2D
└── Camera2D
```

- 三个节点 `Position` **必须都是 `(0,-5)`**，`Centered` 保持默认 true
- 绘制顺序 = 树序，后面的在上面 → Body → Hair → Tool（手臂压在最上）
- `z_index` 全部保持 `0`（≠0 会破坏 Y 排序）

**SpriteFrames 命名**：三层共用同一个 SpriteFrames 资源，动画名只差前缀：

| 层 | idle | walk | run | dig |
|---|---|---|---|---|
| 身体 | `idle` | `walk` | `run` | `dig` |
| 头发 | `hair_idle` | `hair_walk` | `hair_run` | `hair_dig` |
| 手臂 | `tool_idle` | `tool_walk` | `tool_run` | `tool_dig` |

### 6.3 ✅ 不需要"每帧同步 frame"的代码（实测推翻旧方案）

旧方案里"每帧 `hair.frame = animation.frame` 同步"是**错的**，原因是 Godot 的 `_process`
执行顺序是**父节点先于子节点** → `Player._process` 里读到的 `animation.frame` 是子节点
*上一帧*推进完的值 → 头发/手臂会慢一帧。

正确做法：**同名动画 + 相同 speed = 自动同步**，不需要任何同步代码。

- `AnimatedSprite2D.play()` 在**动画名相同时直接 return，不重置帧号**
  → 每帧重复调 `_play_anim("walk")` 不会把帧打回 0
- 三个节点在**同一帧**被 `play()`，各自用**相同的 speed** 累加相同的 delta → 帧号天然一致

实测（真实渲染，逐帧打印）：body/hair/tool 的 `frame` 在 walk 和 idle 下**始终相等**。

### 6.4 speed / loop 硬规则

| 动画 | speed | loop |
|---|---|---|
| idle / hair_idle / tool_idle | 6 | ✅ 开 |
| walk / hair_walk / tool_walk | 10 | ✅ 开 |
| run / hair_run / tool_run | 12 | ✅ 开 |
| dig / hair_dig / tool_dig | **20** | ❌ **关** |

**三层同名动画的 speed 和 loop 必须完全一致**，否则逐帧漂移。

`dig` 的 loop **必须关**：loop=true 时 `animation_finished` 信号**永不发出**，
第 5 步的锄地状态机会永久卡在 `_busy = true`。

**底边核对（已验）**：DIG 身体底边全程 = 39，与 IDLE(39) / WALK(39) 一致
→ 切到 dig 时角色不跳位，`position = (0,-5)` 可直接复用。
（注意：dig 的 `tools` 层底边会到 y=40，那是**铲子**伸到脚下，不是角色位移。）

### 6.5 动作状态机
```
IDLE / WALK
   │ 按下 use_tool，且目标格合法且未锄过
   ▼
DIGGING（_busy = true，锁住移动）
   │ animation_finished 信号
   ▼
FarmData.till(target)  →  Soil.set_cell(...)  →  _busy = false  →  回到 IDLE
```

**两个必须锁存的东西**：
1. **移动**：`_busy` 期间 `velocity = Vector2.ZERO`，忽略移动输入
2. **朝向**：`_busy` 期间**不要更新 `facing`** —— 否则玩家一边挖一边转方向，挖的位置会飘

第 2 条特别重要。正确做法是：
```gdscript
# 在 _physics_process 开头
if _busy:
    velocity = Vector2.ZERO
    move_and_slide()
    return          # ← 直接返回，_update_facing 根本不会被调用
```

---

## 7. 完整文件清单（M2a 要建/改的）

| 文件 | 动作 | 内容 |
|---|---|---|
| `scripts/data/soil_data.gd` | 新建 | `SoilData` Resource，状态枚举 + 字段 |
| `scripts/data/farm_data.gd` | 新建 | `FarmData` Node，Dictionary 仓库 + `till()` |
| `scripts/actors/player.gd` | 改 | `facing` → Vector2i、加 `_update_facing` / `current_cell` / `target_cell` / `_busy` |
| `scenes/player.tscn` | 改 | `SpriteFrames` 加一个 "dig" 动画（13 帧，烘焙好的 strip） |
| `project.godot` | **编辑器改** | Input Map 加 `use_tool`；Autoload 加 `FarmData` |
| `scenes/main.tscn` | **编辑器改** | 给 `Soil` 挂 TileSet（和 Ground 同一个也行） |

**注意 `scenes/main.tscn` 不要手改文本** —— 里面有 1740 个 atlas 坐标，编辑器保存更安全。

---

## 8. 验收清单（做完逐条测）

1. **目标格对不对**：站在农场中间，分别按 W/A/S/D 各锄一次，看土坑出现在**身体正前方那一格**，不是脚下
2. **斜向输入**：同时按 W+D，朝向应该是右或上（看你定的优先级），锄的位置要和朝向一致
3. **朝向粘滞**：按住 D 走两步，再按住 W 走两步，朝向应该跟着变；松开 W 后面向要回到 D
4. **不能重复锄**：同一格连按两次，第二次应该无效（第二次要么不播动画，要么播了但不改状态）
5. **动画期间锁住**：dig 动画播放中按方向键，角色应该**不动**
6. **动画期间锁朝向**：dig 播放中按方向键，朝向不该变，挖的位置不该飘
7. **越界**：走到最左边往左锄，应该没反应
8. **flip_h 不跳变**：按 W（朝上）时角色**不能**突然换脸
9. **动画衔接**：dig 动画播完要回到 idle，不能卡在最后一帧

---

## 9. 常见坑速查

| 坑 | 症状 | 解法 |
|---|---|---|
| 格坐标算错一格 | 挖的格子在脚下或身后 | Y 轴用 `floor((y-1)/16)`，别用 `floor(y/16)` |
| flip_h 上下跳变 | 按方向键时角色突然换脸 | 只在 `facing.x != 0` 时改 flip_h |
| 动画期间朝向飘 | 挖的位置乱跳 | `_busy` 时提前 `return` |
| 双 AnimatedSprite2D 不同步 | 铲子和身体错帧 | 预烘焙成一条 strip |
| `set_cell` 没反应 | 挖了但看不见 | `Soil` 没挂 TileSet |
| `local_to_map` 算错 | 格号对不上 | 收的是局部坐标，要 `to_local()`（M2a 用不到） |
| 改 project.godot 冲突 | 编辑器把改动覆盖 | 改用编辑器的 Input Map / Autoload 界面 |

---

## 10. 后续（M2b，不在本次范围）
- 播种（`plant` 图标 / 作物贴图）
- 浇水（`water.png` 洒水壶 + `WATERING/tools_watering_strip5.png` 动画 + `soil_01` 湿土贴图）
- 作物生长阶段（11 种作物 × 6 阶段贴图）
- 体力条
- 存档（`SoilData` → JSON 序列化）
