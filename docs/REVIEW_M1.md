# M1 Review：移动脚本与场景

**日期**：2026-11-09
**审查对象**：`scripts/actors/player.gd`、`scenes/player.tscn`、`scenes/main.tscn`、`project.godot`

---

## 一、🔴 致命问题：脚本没有挂到节点上（角色完全不动）

### 现象

我写了无头模拟测试，结果：

```
=== 按住 ui_right 60 帧 ===
  位置: (0.0, 0.0)  velocity: (0.0, 0.0)
  is_on_floor: false
```

**角色纹丝不动。**

### 根因

`scenes/player.tscn` 里 Player 节点**没有任何 `script` 属性**：

```ini
[node name="Player" type="CharacterBody2D" unique_id=1235568156]
[node name="CollisionShape2D" type="CollisionShape2D" parent="." ...]
[node name="AnimatedSprite2D" type="AnimatedSprite2D" parent="." ...]
```

实测确认：
```
has_method('_physics_process'): false
script = <null>
script 路径 = null
```

你创建了 `scripts/actors/player.gd` 文件，**但没有把它绑定到 Player 节点**。
Godot 里「文件存在」和「节点使用它」是两件独立的事。

### 怎么修（三种，任选一种）

**方法 A（推荐）**：在编辑器里
1. 打开 `scenes/player.tscn`
2. 选中 **Player** 节点（最外层那个，不是子节点）
3. 检视器（Inspector）顶部会有一排图标，点 **卷轴图标**（Attach Script）
4. 弹窗 → `res://scripts/actors/player.gd` → 创建

**方法 B**：选中 Player 节点 → 检视器里找 **Script** 属性 → 拖入 `player.gd`

**方法 C**：直接编辑 `player.tscn`，加两行：
```ini
[ext_resource type="Script" path="res://scripts/actors/player.gd" id="1_script"]

[node name="Player" type="CharacterBody2D" ...]
script = ExtResource("1_script")
```

> **新手最常见的误解**：以为在文件系统里建了 `.gd` 文件、或者在别的场景里挂了脚本，
> 这个场景就会自动有。**每个场景实例的节点都要单独挂脚本。**
> `main.tscn` 里的 `Player` 是 `player.tscn` 的**实例** —— 它继承 `player.tscn` 的所有配置，
> 所以脚本要挂在 **`player.tscn` 的 Player 根节点**上，而不是 `main.tscn` 的实例上。

---

## 二、🔴 用了 `ui_*` 内置动作，你白配了输入映射

### 问题

你的 `project.godot` 里配了 4 个自定义动作：
```ini
move_left / move_right / move_up / move_down  ← 绑定 A / D / W / S
```

但脚本里用的是：
```gdscript
var direction := Input.get_axis("ui_left", "ui_right")   # ← 内置动作
```

实测：
```
get_axis('ui_left','ui_right')      = 1.0
get_axis('move_left','move_right')  = 0.0   ← 你配的那些没被用
```

**结果**：你配的 WASD 键**完全不起作用**，玩家只能靠**方向键**移动。
（`ui_left` 等内置动作默认绑定了方向键）

### 为什么必须用自定义动作

`ui_*` 是 **UI 导航**专用动作，设计给菜单/对话框用。游戏角色移动应该用自己的动作名，
理由：

| 需求 | 用自定义动作 |
|---|---|
| 换键位 | 改 Input Map 即可，不用动代码 |
| 加手柄支持 | 在同一个动作上加绑定，代码零改动 |
| 双摇杆 / 触屏 | 同上 |
| 将来做「交互键 E」「工具键 Q」 | 天然统一管理 |

> Godot 官方模板代码里那句注释 `# As good practice, you should replace UI actions with custom gameplay actions.`
> **就是 Godot 自己在提醒你这件事** —— 你正好留了这行注释没改。

### 改法

```gdscript
var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
```

---

## 三、🔴 `get_axis` 只能做左右，上下无法响应

`Input.get_axis(negative, positive)` 是**一维**的，只能返回一个 x 分量。

所以你现在的脚本：
- ← → 能动
- **↑ ↓ 完全没反应**

必须换成二维的 `Input.get_vector()`：
```gdscript
var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
```

### 为什么用 `get_vector` 而不是手写加减

```gdscript
# ❌ 手写：斜走会快 41%
var dir := Vector2(
    Input.get_action_strength("move_right") - Input.get_action_strength("move_left"),
    Input.get_action_strength("move_down") - Input.get_action_strength("move_up")
)
# 按住右上 → (1, 1) → 长度 1.414 → 比直走快 41%
```

`get_vector` 内部会归一化，**斜走和直走一样快**。

---

## 四、🟡 没有动画切换逻辑

你的脚本完全没有碰 `AnimatedSprite2D`。所以：

- 动画停在场景里预设的 `animation = &"run"`，第 7 帧
- 不会根据移动状态切换 idle / walk / run

实测：
```
当前动画: run   frame: 7    ← 一直卡在这里
```

需要加：
```gdscript
if direction == Vector2.ZERO:
    anim.play("idle")
elif ...:
    anim.play("walk")  # 或 run
```

> `play()` 是幂等的 —— 重复播放同一个动画没有额外开销，
> 所以**不需要先判断当前是不是别的动画**。

---

## 五、🟡 跳跃逻辑在 2D 农场游戏里没有意义

```gdscript
if Input.is_action_just_pressed("ui_accept") and is_on_floor():
    velocity.y = JUMP_VELOCITY
```

这是 **3D 平台跳跃模板**的代码。星露谷式游戏是俯视视角，**角色不能跳**。

更要紧的是：**你的场景里没有地面**（没有 StaticBody2D），
所以 `is_on_floor()` 永远返回 `false`：
```
is_on_floor: false
```

这意味着两件事：
1. 跳跃永远触发不了（因为 `is_on_floor()` 是 false）—— **侥幸没出错**
2. 但重力依然在生效！`velocity += get_gravity() * delta`
   → 角色会**一直往下掉**

### 2D 俯视游戏该怎么做

**删掉重力**。俯视游戏里重力没有意义，角色就贴在地面上走：

```gdscript
func _physics_process(delta: float) -> void:
    var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
    velocity = direction * SPEED
    move_and_slide()
    # ... 动画切换
```

> **为什么 2D 俯视游戏不需要重力**：
> 3D 平台游戏里角色是"站在地面上"的世界，需要重力把角色拉回地面。
> 俯视游戏里角色是"贴在地面平面上"的角色，Y 轴代表**屏幕上的前后位置**，不是高度。
> 如果加重力，角色会一直往下掉出屏幕 —— 这是新手做 2D 农场游戏最经典的翻车点。
>
> `get_gravity()` 在 `CharacterBody2D` 上确实存在（我实测 `has_method` 返回 true），
> 所以这段代码**不会报错**，它会静静地让角色掉出屏幕 —— 更难查。

---

## 六、🟡 摄像机位置可能偏了

你在 `Camera2D` 上设了 `position = Vector2(0, -5)`。

这个 `-5` 是你给 `AnimatedSprite2D` 对齐脚底用的。摄像机**不需要**这个偏移：
摄像机应该对准角色的**脚底**（也就是 Player 的原点），而不是角色图像中心。

如果摄像机偏 5 像素，画面会看起来"镜头稍微往下偏"，角色不在正中。

**建议**：把 `Camera2D.position` 改回 `(0, 0)`。

> 另外，`Camera2D` 挂在 `Player` 下面（作为子节点）是**正确做法** ——
> 它会自动跟随玩家，不用写跟随代码。
> `position_smoothing_enabled = true` + `speed = 8.0` 也对 ✓

---

## 七、🟢 做对了的部分

| 项 | 评价 |
|---|---|
| `main.tscn` 作为主场景，Player 用实例方式引入 | ✓ 正确，避免重复维护 |
| `Camera2D` 挂在 Player 下，自动跟随 | ✓ 正确，省掉 follow 代码 |
| `position_smoothing_enabled = true` | ✓ 平滑跟随 |
| 碰撞体 `RectangleShape2D (12,8)` @ `(0,-4)` | ✓ 数值准确 |
| `AnimatedSprite2D.position = (0,-5)` | ✓ 脚底对齐，误差仅 1px |
| FPS idle=6 / walk=10 / run=12 | ✓ 合理 |
| 8 项项目设置 | ✓ 全对 |
| 4 个输入映射动作 | ✓ 都建对了（只是脚本没用上） |
| `move_toward` 做减速 | ✓ 好习惯，避免瞬间停止的突兀 |

---

## 八、你的脚本改造清单

按优先级：

- [ ] **🔴 把 `player.gd` 挂到 `player.tscn` 的 Player 根节点**（否则一切白搭）
- [ ] **🔴 `ui_left/ui_right` → `move_left/move_right/move_up/move_down`**
- [ ] **🔴 `get_axis` → `get_vector`**（否则上下不能动）
- [ ] **🟡 删除重力与跳跃代码**（否则角色会掉出屏幕）
- [ ] **🟡 加动画切换**（idle / walk / run）
- [ ] **🟡 `Camera2D.position` 改回 `(0, 0)`**

---

## 九、附带：M1 之后的两个知识点（先了解，不急着做）

### 1. 没有地面，角色会走出屏幕

现在场景里**没有任何 StaticBody2D**，所以角色可以无限往任何方向走。
等你要做农场地图时，需要加地面碰撞体。

但现在（验证移动阶段）**不用加** —— 让角色飞着反而方便你看它动。

### 2. `delta` 是干嘛的

```gdscript
func _physics_process(delta: float) -> void:
```

`delta` = 距离上一帧过了多少秒（通常 1/60 ≈ 0.0167）。

所以 `velocity = direction * SPEED` 的意思是"**这一帧应该移动 direction × SPEED × delta 像素**"，
`move_and_slide()` 内部会乘上 delta。

**如果不乘 delta**，不同帧率下移动速度就会不一致（60Hz 和 144Hz 屏幕速度不同）。
这就是为什么所有速度计算都要乘 delta。

---

## 十、我怎么验证的（可复现）

```bash
# 无头加载场景 + 模拟输入
/Applications/Godot.app/Contents/MacOS/Godot --headless \
  --path /Users/orange/my/godot/farm --script /tmp/sim.gd
```

关键点：测试脚本里必须
```gdscript
get_root().add_child(main)   # ← 加进树，节点才会跑 _physics_process
await process_frame
```
否则 `is_inside_tree() = false`，物理帧根本不会执行 —— 我第一次写测试就踩了这个坑。

---

# 第二次 Review（改完 3 项后）

## ✅ 已修好的

| 项 | 状态 |
|---|---|
| **脚本挂载** | ✓ `script = ExtResource("1_dqkch")` 已加到 `player.tscn` 的 Player 根节点 |
| **删除重力** | ✓ `get_gravity()` / `JUMP_VELOCITY` 已移除，角色不再下坠 |
| **摄像机偏移** | ✓ `Camera2D.position` 的 `(0,-5)` 已去掉 |
| **`ui_*` → `move_*`** | ✓ 部分完成（见下） |
| **`move_toward` 减速** | ✓ 保留得好习惯 |

实测确认：
```
has_method('_physics_process'): true
script: res://scripts/actors/player.gd
is_physics_processing(): true

=== 按住 move_right 60 帧 ===
  位置: (295.0, 0.0)     ← 动了！
  velocity: (300.0, 0.0)
  动画: run              ← 场景预设值
  松手后: velocity (0,0) ← 减速正常
```

---

## 🔴 还剩两个问题

### 1. `get_axis` 改成了 `get_vector` 吗？——**只改了一半**

你现在写的是：
```gdscript
var direction := Input.get_axis("move_left", "move_right")
```

动作名改对了（`move_*`），**但函数还是一维的 `get_axis`**。

`get_axis(负向, 正向)` 只返回一个 **x 分量**，所以：
- ← → 能动 ✓
- **↑ ↓ 完全没反应** ✗

### 实测证据

```
=== 按住 move_down 60 帧（测试上下）===
  位置变化: (0.0, 0.0)      ← 没动
  velocity: (0.0, 0.0)

=== 斜向 move_right+move_down 60 帧 ===
  位置变化: (300.0, 0.0)    ← 只有横向
```

### 但你的输入配置完全正确

```
move_left:  physical_keycode=65  (A)
move_right: physical_keycode=68  (D)
move_up:    physical_keycode=87  (W)
move_down:  physical_keycode=83  (S)
```

而且 `get_vector` 实测工作正常：
```
is_action_pressed('move_down') = true
get_axis('move_left','move_right') = 0.0
get_vector(4向) = (0.0, 1.0)      ← 完美
```

**所以问题 100% 在函数选择，不在你的配置。**

### 改法

```gdscript
var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
```

> `get_vector` 的参数顺序是 **左、右、上、下**（x 轴两个，y 轴两个）。
> 写反了的话上下会颠倒 —— 注意 `move_up` 在前。

---

### 2. 还没有动画切换逻辑

实测：
```
动画: run    ← 60 帧后仍是 run
```

脚本从头到尾**没有碰过 `AnimatedSprite2D`**。
所以动画停在场景里预设的 `animation = &"run"`，不会随移动状态变化。

需要加：
```gdscript
@onready var anim: AnimatedSprite2D = $AnimatedSprite2D

# ... 在 _physics_process 里
if direction == Vector2.ZERO:
    anim.play("idle")
else:
    anim.play("walk")     # 或按方向区分 walk / run
```

> `play()` 是幂等的 —— 重复播同一个动画没有额外开销，
> **不需要先判断当前是不是别的动画**。

**顺带提醒**：`velocity.x` 只控制横向，
所以你现在**只写了 `velocity.x`**。改成 `get_vector` 后，
要同时设置 `velocity.y`：

```gdscript
velocity = direction * SPEED
```
（一步到位，x 和 y 都设好）

或者保持你的写法但补上 y：
```gdscript
velocity.x = direction.x * SPEED
velocity.y = direction.y * SPEED
```

---

## 🟡 附带建议

### SPEED = 300 在你的视口下偏快

你的视口是 **320×180**。SPEED=300 意味着：
- 横穿屏幕需要 320/300 ≈ **1.07 秒**
- 角色 11 像素宽，1 秒跑 300 像素 = **每秒 27 个身位**

《星露谷》的角色走 1 屏大约要 2-3 秒。建议 SPEED 降到 **80~120**。

自己试一下就知道了 —— 跑太快会晕。

### `velocity.y` 也要能归零

你现在的减速逻辑只处理了 x：
```gdscript
else:
    velocity.x = move_toward(velocity.x, 0, SPEED)
```
如果只按上下松开，`velocity.y` 会**一直是 0**（因为从没设过），
这没问题。但如果后面你加了别的逻辑，记得两个轴都要处理。

用 `velocity = direction * SPEED` 一步到位就没这问题 ——
`direction` 是零向量时，velocity 两个轴自然都是零。

### 没有地面，角色能走出屏幕

现在场景里没有任何 `StaticBody2D`，角色可以无限走。
**验证移动阶段不用管**，等做农场地图时再加地面碰撞体。

---

## 修改后的完整脚本骨架（供参考，你可以自己写）

```gdscript
extends CharacterBody2D

const SPEED = 100.0

@onready var anim: AnimatedSprite2D = $AnimatedSprite2D

func _physics_process(delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * SPEED
	move_and_slide()

	if direction == Vector2.ZERO:
		anim.play("idle")
	else:
		anim.play("walk")
```

---

## 检查清单

- [ ] 🔴 `get_axis` → `get_vector`（4 个参数，顺序：左右上��）
- [ ] 🔴 加 `@onready var anim: AnimatedSprite2D = $AnimatedSprite2D`
- [ ] 🔴 加动画切换逻辑（idle / walk / run）
- [ ] 🟡 `velocity` 同时设置 x 和 y
- [ ] 🟡 SPEED 从 300 降到 80~120 试试手感
- [ ] 🟢 挂脚本 ✓ 已完成
- [ ] 🟢 删重力 ✓ 已完成
- [ ] 🟢 摄像机偏移 ✓ 已完成
