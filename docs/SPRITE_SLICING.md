# 精灵图切割操作手册（Godot 4.7）

> 说明每一步操作的原因。本文所有数值均基于本项目实际素材文件测量得出。

---

## 一、素材规格

### 1.1 目录结构

```
assets/characters/
├── _Source/          ← aseprite 源文件（原始工程，改动画用）
│   ├── Human/sunnyside_world_chatacter_anim_v0.07.aseprite
│   ├── Human/..._condensed.aseprite
│   └── Goblin/sunnyside_world_chatacter_anim_GOBLIN.aseprite
├── Human/            ← 人类角色，按【动作】分文件夹
│   ├── IDLE/base_idle_strip9.png
│   ├── WALKING/base_walk_strip8.png
│   ├── ATTACK/base_attack_strip10.png
│   ├── AXE/base_axe_strip10.png
│   └── ... 共 20 个动作文件夹
├── Goblin/PNG/       ← 哥布林
└── Skeleton/PNG/     ← 骷髅
```

**关键理解**：每个动作文件夹里的 PNG **已经是切好的横条**了 —— 一行 N 格，从左到右就是动画的 1→N 帧。
无需使用图片软件裁切，**Godot 中填写两个数值即可自动切片**。

### 1.2 精确规格数据

**Human 全部 20 个动作文件夹，每张图的格子尺寸完全一致：`96 × 64`**

> ### ⚠️ 「96×64」到底指什么 —— 这点特别容易搞混
>
> **96×64 是「一个格子框」的大小，不是角色的大小。**
>
> ```
> base_idle_strip9.png  整张图 864×64
> └──────────────────────┴──────────────────────┘
>  ├─────┤├─────┤├─────┤├─────┤├─────┤├─────┤├─────┤├─────┤├─────┤
>  第1帧   第2帧   第3帧   第4帧   第5帧   第6帧   第7帧   第8帧   第9帧
>  └──────────── 每一格都是 96×64 ────────────┘
> ```
>
> - **96×64** = 一个动画帧**占多大格子**（切图的格子尺寸）
> - **11×16** = 角色**实际画了多大**（这格里的不透明像素范围）
> - **864×64** = 整张 PNG 的尺寸（= 96 × 9 帧）
>
> 96 宽的格子里，角色只有 11 像素宽 —— **剩下 85 像素是透明空白**。
> 这不是问题，Godot 就是按 96×64 切帧的。但它直接导致了 §四 的 pivot 问题：
> 节点原点会落在大片空白中间，而不是角色脚下。

**每格尺寸计算公式**：`格子宽 = 总宽 ÷ 帧数`，`格子高 = 总高 ÷ 行数`

| 动作文件夹 | 文件 | 总尺寸 | 帧数 | 每格 |
|---|---|---|---|---|
| IDLE | base_idle_strip9.png | 864×64 | 9 | 96×64 |
| WALKING | base_walk_strip8.png | 768×64 | 8 | 96×64 |
| RUN | base_run_strip8.png | 768×64 | 8 | 96×64 |
| ATTACK | base_attack_strip10.png | 960×64 | 10 | 96×64 |
| AXE | base_axe_strip10.png | 960×64 | 10 | 96×64 |
| WATERING | base_watering_strip5.png | 480×64 | 5 | 96×64 |
| DIG | base_dig_strip13.png | 1248×64 | 13 | 96×64 |
| HAMMERING | base_hamering_strip23.png | 2208×64 | 23 | 96×64 |
| CASTING | base_casting_strip15.png | 1440×64 | 15 | 96×64 |
| REELING | base_reeling_strip13.png | 1248×64 | 13 | 96×64 |
| SWIMMING | base_swimming_strip12.png | 1152×64 | 12 | 96×64 |
| HURT | base_hurt_strip8.png | 768×64 | 8 | 96×64 |
| DEATH | base_death_strip13.png | 1248×64 | 13 | 96×64 |
| JUMP | base_jump_strip9.png | 864×64 | 9 | 96×64 |
| ROLL | base_roll_strip10.png | 960×64 | 10 | 96×64 |
| CAUGHT | base_caught_strip10.png | 960×64 | 10 | 96×64 |
| DOING | base_doing_strip8.png | 768×64 | 8 | 96×64 |
| MINING | base_mining_strip10.png | 960×64 | 10 | 96×64 |
| WAITING | base_waiting_strip9.png | 864×64 | 9 | 96×64 |
| ATTACK→CASTING 等 | | | | |

> **帧数怎么算**：`总宽 ÷ 96 = 帧数`。文件名里的 `strip9` / `strip23` 就是帧数，可交叉验证。

### 1.3 ⚠️ 三个必须知道的坑

**坑 1：Goblin 那批的文件名帧数是错的**

逐个验证发现 Goblin 的 6 个文件文件名标注的帧数与实际不符：

| 文件 | 文件名声称 | 实际 | 真实网格 |
|---|---|---|---|
| spr_idle_strip9.png | 9 帧 | **8 帧** | 8列×1行，每格 96×64 |
| spr_waiting_strip9.png | 9 帧 | **8 帧** | 8列×1行，每格 96×64 |
| spr_attack_strip10.png | 10 帧 | **9 帧** | 9列×1行，每格 96×64 |
| spr_death_strip13.png | 13 帧 | **9 帧** | 9列×1行，每格 96×64 |
| spr_dig_strip13.png | 13 帧 | 13 帧 | **10列×2行**，每格 96×64 |
| spr_reeling_strip13.png | 13 帧 | 13 帧 | **10列×2行**，每格 96×64 |
| spr_hammering_strip23.png | 23 帧 | 23 帧 | **10列×3行**，每格 96×64 |

> **Goblin 的 dig / reeling / hammering 是多行图**，切的时候 Horizontal=10、Vertical=2 或 3。
> 人类角色没有这个问题，全是单行。

**坑 2：`base` 和 `tools` 是两套不同的角色**

- `base_xxx` = **裸角色**（没有头发、没有工具）
- `tools_xxx` = **带工具的角色**（但像素数反而更少，因为它是"只有工具/简化版"）
- `shorthair_xxx` / `curlyhair_xxx` / `bowlhair_xxx` 等 = **不同发型**

像素数对比：
```
AXE/base_axe_strip10.png   不透明像素 = 2158
AXE/tools_axe_strip10.png  不透明像素 = 1275   ← 少 883
IDLE/base_idle_strip9.png   不透明像素 = 1359
IDLE/tools_idle_strip9.png  不透明像素 =  112   ← 少 1247（几乎是空的！）
```

`tools_idle` 只有 112 个不透明像素 —— 说明 **`tools_` 系列在 IDLE 这类"没有明显工具动作"的帧上是空的**。
所以：**做行走/待机动画用 `shorthair_` 或 `curlyhair_` 这种带发型的；拿工具时才切 `tools_` 系列。**

**坑 3：角色在格子里的位置不居中**

逐帧测得各动作的包围盒：

```
IDLE      角色占 x[43,54]  y[23,38]   中心 x=48   脚底线 y=38
WALKING   角色占 x[43,53]  y[23,38]   中心 x=48   脚底线 y=38
RUN       角色占 x[43,54]  y[21,38]   中心 x=48   脚底线 y=36/38（跳跃帧会抬脚）
ATTACK    角色占 x[32,89]  y[..,38]   ← 挥砍时大幅偏移
AXE       角色占 x[29,89]  y[..,38]   ← 同上
WATERING  角色占 x[43,55]  y[..,38]   中心 x=49
```

**好消息**：水平方向**几乎所有帧都精确居中在 x=48**（格子正中）。
**需要处理的**：格子是 96 宽 64 高，但角色只有 11 宽 16 高 —— 意味着 **95% 是透明空白**。
Godot 会把这 96×64 整块都当成一帧，角色实际仅占中间一小块。

**该规格直接决定碰撞体与 pivot 的设置方式**，见 §四。

---

## 二、切图前的准备：项目设置（必做，否则必糊）

> **这一步不做，后面切得再对，角色也是糊的。**

`项目设置 → 渲染 → 纹理 → 画布纹理`：
```
Default Texture Filter = Nearest
```
（默认是 Linear，会将 11×16 的小像素抹成马赛克）

`项目设置 → 显示 → 窗口`：
```
Viewport Width  = 320        ← ★ 见下方说明
Viewport Height = 180
Stretch Mode    = canvas_items
Stretch Aspect  = keep
Stretch Scale Mode = integer     ← 整数倍缩放，不产生半像素
```

> ### ⚠️ 为什么是 320×180 而不是 640×360
>
> 角色实际尺寸为 **11×16 像素**。
> - 在 **640×360** 视口里 → 角色只有屏幕高度的 1/22，几乎看不见
> - 在 **320×180** 视口里 → 角色占屏幕高度 1/11，配 16×16 的地块比例正好
>
> 这也正是《星露谷》的原始思路：**16×16 地块 + 小人物**，靠整数倍放大到屏幕。
>
> 待地块美术确定后再统一决定最终分辨率 —— **先用 320×180 跑通流程**可降低返工成本。

`项目设置 → 渲染 → 2D → 吸附`：
```
Snap 2D Transforms To Pixel = true
Snap 2D Vertices To Pixel   = true
```

### ⚠️ 关于素材缩放的实测结论

检查 `base_idle_strip9.png` 的颜色分布，发现**相邻肤色像素存在 ±1 的色差**：

```
(232,173,125) <-> (232,172,125) : 5
(232,173,125) <-> (233,173,125) : 5
```

这说明**这批 PNG 不是原生像素画，而是从 aseprite 缩放导出的**（原生像素画的同色区域不会有这种抖动）。

实际影响：
- 角色本体只有 **11×16 像素**（这是缩小后的尺寸）
- 而 aseprite 源文件的帧尺寸为 **141×75**（Human）或 **36×75**（condensed 版本）
  —— 说明原始画其实有 4 倍分辨率（141 ≈ 36×4，75 ≈ 19×4）

**因此采用 `_Source/` 中的 aseprite 重新导出 4 倍分辨率 PNG。**

> 也可先使用现有 PNG 跑通流程（后续步骤不受影响），动画调优完成后再替换高清图。
> 但**换图时要重新切一遍**（或保持 SpriteFrames 不动、只替换贴图源）。

---

## 三、切割步骤（Godot 编辑器，3 种方法）

### player.tscn 当前状态

```gdscript
[node name="Player" type="CharacterBody2D"]
[node name="CollisionShape2D" type="CollisionShape2D"]
[node name="AnimatedSprite2D" type="AnimatedSprite2D"]
    sprite_frames = SubResource("SpriteFrames_y8v0a")   ← 动画名 idle/run/walk 已建好，但 frames 是空的
```

**SpriteFrames 与三个动画名已创建**，尚需填入帧。

---

### 方法 A：用 SpriteFrames 面板（，最直观）

**这是 Godot 内置的切图工具，图形界面点几下就行。**

**步骤 1** — 选中 `AnimatedSprite2D` 节点

**步骤 2** — 在检视器（Inspector）找到 `Sprite Frames` 属性，双击（或点右侧下拉箭头 → `New SpriteFrames`）
> 资源已存在，点击资源名即可在底部面板打开

**步骤 3** — 底部弹出 **SpriteFrames 面板**，工具栏最右边有个网格图标
（鼠标悬停会显示 **"Add frames from sprite sheet"** / 「从精灵表添加帧」），点它

**步骤 4** — 弹出切图对话框，按下面填：

```
┌──────────────────────────────────────────────────┐
│  Create Frames from Sprite Sheet                 │
│                                                  │
│  Horizontal:  9        ← 帧数（横向格子数）        │
│  Vertical:    1        ← 行数（Human 全是1）       │
│                                                  │
│  Size:        96       ← ★ 每格宽（像素）         │
│               64       ← ★ 每格高（像素）         │
│                                                  │
│  Separation:  0                                  │
│               0                                  │
│  Offset:      0                                  │
│               0                                  │
│                                                  │
│         [预览网格，可点格子取消选择]               │
│                                                  │
│  [ Add Frames ]                        [ Cancel ] │
└──────────────────────────────────────────────────┘
```

> ### ⚠️ 三个注意点（已核对 4.7.2 源码）
>
> **① 填写 `Horizontal` / `Vertical` 后，`Size` 自动计算 —— 只需填格数**
>
> Godot 的逻辑是（源码 `sprite_frames_editor_plugin.cpp`）：
> ```
> count = (纹理尺寸 - offset) / (frame_size + separation)
> ```
> 例如填 `Horizontal=9`、`Vertical=1`，自动得出 `Size = 864÷9 = 96`、`64÷1 = 64`。
> **反过来**，直接填 `Size=96,64` 亦可，自动得出 `Horizontal=9, Vertical=1`。
> 两种填法等价，**但必须有一个是对的**，否则预览网格会显示错位。
>
> **② 新建纹理时默认是 4×4 —— 这是主要陷阱**
>
> 源码里写死了：
> ```cpp
> // Different texture, reset to 4x4.
> const Size2i split_sheet = Size2i(4, 4);
> ```
> 即每次更换 PNG，该对话框都会重置为 4 列 × 4 行。
> 对本项目素材（1 行 × 9 帧），4×4 不适用 —— **每次均需重新设置 Horizontal/Vertical**。
>
> **③ "Auto Slice" 按钮不适用于本项目素材**
>
> 该按钮通过扫描透明区域估算行列数。问题在于：**每帧之间存在大片透明空白**
> （96 格子里角色只占 11 像素宽），自动估算很可能数错。
> **对 Human 系列，手动填数字最可靠。**
>
> **④ 对话框窗口标题是 "Create Frames from Sprite Sheet"**
>
> 工具栏那个网格图标的提示文字是 **"Add frames from sprite sheet"**，
> 但点开后弹出的窗口标题是 **"Create Frames from Sprite Sheet"** —— 是同一个东西。

**步骤 5** — 点 **Add Frames**

**步骤 6** — 在 SpriteFrames 面板左侧的动画列表里，**双击 `idle` 这个名字**改名
> 面板默认新建名为 `default` 的动画，改名为目标名称（`idle` / `walk` / `run`）
> 场景中已预建 `idle`、`run`、`walk` 三个动画，因此**加完帧后需删除 `default`**，
> 或者直接把这三个空动画填上（选中动画名 → 面板上方的添加按钮）。

**步骤 7** — 设置动画参数（面板右上角）：
```
Speed (FPS):  idle=6, walk=10, run=12
Loop:         idle ✓, walk ✓, run ✓
```
> 像素风角色动画通常 6~12 FPS。太高会抽搐，太低会卡顿。

---

### 方法 B：用 AtlasTexture 手动切（更精确，适合高级需求）

如需完全控制每帧的裁剪区域，可不使用 SpriteFrames 面板，改用 `AtlasTexture`：

1. 在文件系统里右键 PNG → **Import** → 选 **AtlasTexture** → 导入
2. 在场景里加 `Sprite2D`，把 `AtlasTexture` 拖上去
3. 在 `AtlasTexture` 资源里填 `Region`：
   - `Margin` = (0, 0)
   - `Size` = (96, 64)  ← 每格尺寸
   - `Margin` / `Region` 调 `Position` = (第几帧 × 96, 0)

**这个方法太笨重，20 个动画要做 200 次。** 方法 A 一劳永逸。

---

### 方法 C：用代码批量生成（可选）

如果以后加了 Goblin、Skeleton 多套角色，手工切太累，可以写个 `@tool` 脚本批量生成 SpriteFrames。
**但现在别用这个** —— 先手切一个动画，理解原理。

---

## 四、切割完之后：pivot 和碰撞体（这一步最容易做错）

### 4.1 问题所在

每帧尺寸为 96×64，角色实际仅占中间 11×16。
Godot 里 `AnimatedSprite2D` 的 `centered` 默认为 `true`，即**整块 96×64 的中心**对准节点原点。

```
格子 (0,0) ────────────────────────── (96,0)
           │                          │
           │        [角色在这]          │   ← 96 宽的格子
           │         ↑                 │
           │      脚底线 y=38           │
(0,64) ───┴──────────────────────────┴─── (96,64)
```

如果 `centered = true`，节点原点在 (48, 32) —— 也就是**角色腰部偏下一点**，
而不是角色的脚。这会导致走路时角色在地面上**滑动**（脚在原点上方 6 像素）。

### 4.2 解决方案：调整 offset

选中 `AnimatedSprite2D`，在检视器里设：

```
Offset = (0, -6)
```

**为什么是 -6（这个数是从 Godot 源码推出来的，不是猜的）**

Godot 4.7 的 `AnimatedSprite2D` 绘制时这样算贴图左上角的位置
（源码 `scene/2d/animated_sprite_2d.cpp`）：
```cpp
Point2 ofs = offset;
if (centered) {
    ofs -= s / 2;          // s = 帧纹理尺寸 = 96×64
}
Rect2 dst_rect(ofs, s);
```

代入当前数据：
```
贴图左上角落在节点坐标 = offset - (48, 32)
角色脚底在贴图内 y = 38
→ 角色脚底在节点坐标 = offset.y - 32 + 38 = offset.y + 6
→ 要让脚底落在节点原点(0)：offset.y = -6
```

水平方向：角色中心 x=48 = 贴图中心 48 → `offset.x = 0`。

> **验证方法**：切完第一帧后运行游戏，选中 `AnimatedSprite2D`，
> 看 2D 视图里角色的脚底是否正好压在节点原点（十字标记）上。
> 差几个像素就微调 `offset.y`。**这个值只对当前这批素材有效**，
> 换成 4 倍大图或换角色后要重新对。

> **另一个思路（更省事）**：把 `centered` 取消勾选，
> 然后 `offset` 填 `(-48, -38)` —— 直接把贴图左上角对齐到「角色左上角」。
> 但 `centered=true` 配合 `offset` 更为常规，采用前者。

### 4.2.1 顺便解决「角色太小」的问题

角色实际只有 **11×16 像素**，需要决定用什么分辨率呈现。三个方案：

| 方案 | 做法 | 效果 |
|---|---|---|
| A. 缩小视口（优先试） | `viewport = 320×180` | 角色占屏高 1/11，配合 16×16 地块刚刚好 |
| B. 放大精灵节点 | `AnimatedSprite2D.scale = (2,2)` | 角色变 22×32，接近星露谷比例。**但 offset 会跟着放大**（offset 是节点局部坐标），所以要改成 `offset = (0, -12)` |
| C. 重新导出大图 | 从 `_Source/` 的 aseprite 导出 4 倍 PNG | 最清晰，但要重新切一遍 |

> **注意**：`offset` 在节点局部空间，`scale` 会一并缩放它。
> 所以 scale=2 时，`offset=(0,-6)` 要同步改成 `offset=(0,-12)`。

> **采用方案**：先用 **A（320×180 视口）+ 16×16 地块** 跑通流程，
> 这是星露谷原始比例的思路（它就是 16×16 地块 + 小人物）。
> 待地块美术确定后再统一决定最终分辨率。

### 4.3 碰撞体

在 `CollisionShape2D`（已存在）上添加 `RectangleShape2D`：
```
Size = (12, 8)      ← 比角色 11×16 略窄一点，只挡身体下半部分
Position = (0, -4)  ← 对准角色的下半身
```
> 碰撞体不用包住整个角色，星露谷的惯例是只挡脚部一小块，
> 这样玩家能走到树后面、不会被凸出的边缘卡住。

> ⚠️ **这个数值是按 1:1 缩放算的**（角色 11×16）。
> 若采用 §4.2.1 的方案 B（scale=2），碰撞体需同步放大：
> `Size = (24, 16)`、`Position = (0, -8)`。

### 4.4 Y 排序（俯视游戏必做）

玩家走到树后面时应该被树挡住。做法：
1. 玩家的**父节点**（或者一个叫 `Entities` 的 `Node2D`）→ 检视器 → 勾选 **Y Sort Enabled**
2. 所有会互相遮挡的东西放在这个节点下

> `Y Sort Enabled` 在 `CanvasItem` 上，但**它对子节点生效**，
> 所以要开在**父节点**上，不是开在角色自己身上。

---

## 五、播放动画：脚本

当前 `player.tscn` 里 `AnimatedSprite2D` 的 `animation = &"idle"`，
但**光设属性不会自动播放**，还需要在脚本里调 `play()`。

新建 `scripts/actors/player.gd`：

```gdscript
extends CharacterBody2D

const SPEED := 200.0

@onready var anim: AnimatedSprite2D = $AnimatedSprite2D


func _physics_process(delta: float) -> void:
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	velocity = direction * SPEED
	move_and_slide()

	# 根据方向切换动画
	if direction == Vector2.ZERO:
		anim.play("idle")
	else:
		anim.play("walk")
```

> ⚠️ `Input.get_vector("move_left", ...)` 用的是**输入映射里的动作名**，
> 不是键盘键码。需在 `项目设置 → 输入映射` 中添加这 4 个动作。
> 没有输入映射的话，`get_vector` 会一直返回零向量，角色不动，而且**不报错**。

---

## 六、自检清单

切完第一个动画（idle）后，逐条确认：

- [ ] SpriteFrames 面板里 `idle` 动画有 9 帧
- [ ] 帧缩略图是**完整的角色**，不是半个
- [ ] 运行游戏，角色**在原地呼吸/待机**，不是静止不动
- [ ] 角色**不糊**（是 Nearest 不是 Linear）
- [ ] 角色脚底**对齐** `CharacterBody2D` 原点
- [ ] 碰撞体**在脚下**，不挡到角色头顶
- [ ] 动画**循环**正常（idle 循环，walk 走起来是循环的）

---

## 七、完成后需确认的事项

完成后提交，包含以下内容：
1. 读本项目的 `player.tscn` 和脚本
2. 跑 `godot --headless` 抓运行时错误
3. 逐条给反馈

**需确认三个选项**（影响后续实现路径）：

1. **发型**：用哪个？`shorthair` / `curlyhair` / `bowlhair` / `longhair` / `mophair` / `spikeyhair` / `base`（裸头）
2. **画面尺寸**：用现有的小图（配 320×180 视口），还是从 aseprite 重新导出 4 倍大图？
   → 若选重新导出，可提供 aseprite 的导出参数
3. **要做几个动作**：先做 `idle` + `walk` 两个跑通流程，还是一次把 20 个动作全切了？

---

## 附：本文所有数据的来源

| 数据 | 方法 |
|---|---|
| 每格尺寸 96×64 | 读取 PNG IHDR 宽高 ÷ 文件名帧数 |
| 角色包围盒、脚底线 | 逐帧扫描 alpha 通道找非透明像素 |
| 颜色抖动（=缩放产物） | 统计相邻像素色差分布 |
| Goblin 真实帧数 | 按列检测内容段 + 枚举可整除的网格 |
| base vs tools 差异 | 统计各自不透明像素总数 |
| aseprite 原始分辨率 | 解析 .aseprite 文件头（帧数、画布尺寸） |
