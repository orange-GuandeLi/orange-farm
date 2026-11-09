# Review 记录

> 每次我 review 你的代码后，会在这里追加一条记录。
> 格式：日期 / 里程碑 / 结论 / 遗留问题。

---

## 2026-11-09 · 初始

**结论**：项目是 Godot 4.7.2 新建的空项目，尚未设置主场景，无代码。

**已确认的环境事实**
- Godot 4.7.2.stable，macOS arm64
- `project.godot` 已有 `stretch/mode="canvas_items"`、`stretch/aspect="expand"`
- **缺**：`display/window/size/viewport_width/height`（像素风需要固定基准分辨率）
- **缺**：`rendering/textures/canvas_textures/default_texture_filter`（像素风必须设为 0 = Nearest）
- **缺**：主场景

**下一步**：你完成 M0（骨架 + 像素风设置 + 一个能显示东西的主场景），完成后喊我 review。

**待你决定的**（我在 ROADMAP 里给了默认值，但你可以改，改了告诉我）：
- 基准分辨率（默认 640×360，对应 16×16 素材）
- TileSet 图块尺寸（默认 16×16）
- 目录结构是否照抄 §2（可以按你的习惯改）

---

## 2026-11-09 · 素材勘察 + 切图指导

**背景**：你已导入 LimeZu《Sunnyside World》角色包（Human / Goblin / Skeleton），
建好了 `scenes/player.tscn`（CharacterBody2D + CollisionShape2D + AnimatedSprite2D，
SpriteFrames 里已预留 `idle`/`run`/`walk` 三个空动画）。你的问题：**不会切图**。

**结论：你的素材已经是切好的横条，不需要用图片软件裁。**
Godot 的 SpriteFrames 面板内置「Add frames from sprite sheet」，填两个数字就自动切。

### 实测数据（全部来自你的实际文件）

| 结论 | 数据 |
|---|---|
| Human 全部 20 个动作文件夹 | 每格 **96×64**，**全部单行**，无一例外（已复核 176 个文件） |
| 帧数公式 | `总宽 ÷ 96`，与文件名 `stripN` 完全吻合 |
| 角色实际尺寸 | 11×16 像素（**95% 是透明空白**） |
| 水平对齐 | 各帧角色中心精确在 x=48（格子正中），无需水平偏移 |
| 脚底线 | y=38（RUN 跳跃帧为 36） |
| **Goblin 帧数标注有误** | idle/waiting 实为 **8** 帧（非 9）、attack/death 实为 **9** 帧（非 10/13） |
| **Goblin 多行图** | dig/reeling = 10列×2行，hammering = 10列×3行（其余单行） |
| **base vs tools** | `tools_idle` 仅 112 个不透明像素（近乎空白）→ 走路/待机用带发型版本，`tools_` 仅用于持械动作 |
| **素材是缩放产物** | 相邻肤色像素存在 ±1 色差（原生像素画不会有）→ PNG 由 aseprite 缩放导出 |
| aseprite 原始分辨率 | Human 141×75 / condensed 36×75 / Goblin 52×75（**4 倍于 PNG**） |

### 给出的操作指导

见 `docs/SPRITE_SLICING.md`，含：
1. 切图前的项目设置（Nearest 滤镜 / 640×360 / 整数缩放 / 像素吸附）
2. SpriteFrames 面板切图完整步骤（含 Horizontal/Vertical 填法）
3. **offset 校准**：格子 96×64 但角色只 11×16，节点原点会落在腰而非脚，
   必须调 `AnimatedSprite2D.offset` 让脚底对齐 CharacterBody2D 原点，否则走路会"滑"
4. 碰撞体：RectangleShape2D `(12,8)` 放脚下，不要包住整个角色
5. Y 排序要开在**父节点**上，不是角色自己身上
6. 播放动画的脚本写法 + 输入映射缺失时会静默不动的坑

**未做**：我没有替你切图或改任何素材/场景文件（按你的要求，动手部分归你）。
**下一步**：你切完第一个 idle 动画后告诉我，我做首次代码 review。

**待你决定**：① 发型选哪个 ② 用现有小图还是从 aseprite 重导 4 倍大图 ③ 先做几个动作

---

## 2026-11-09 · 源码级核对 + 文档修正

**起因**：你问「size 是 96×64？」—— 我意识到上一份文档里的切图对话框描述**不够准确**，
于是直接克隆 Godot 4.7.2 源码逐行核对，把错的改掉。

### 核对结果（源码 `editor/scene/sprite_frames_editor_plugin.cpp`）

1. **对话框实际字段是 6 个**：Horizontal / Vertical / **Size(X,Y)** / Separation(X,Y) / Offset(X,Y)
   —— 上一版漏了 `Size` 字段。
2. **Horizontal/Vertical 与 Size 互推**（`_update_dimensions`）：
   `count = (纹理尺寸 - offset) / (frame_size + separation)`
   → 填帧数会自动算格子尺寸，反之亦然。两者填一个对的即可。
3. **★ 新纹理默认 4×4**（源码写死 `const Size2i split_sheet = Size2i(4, 4);`）
   → **每次换 PNG 都要重设 Horizontal/Vertical**，这是最容易忘的一步。
4. **有 "Auto Slice" 按钮**，靠扫描透明区域估算行列数。
   **对你的素材不可靠**（每帧间大片透明空白，会数错）→ Human 系列一律手填。
5. 窗口标题是 "Create Frames from Sprite Sheet"，
   而工具栏图标提示是 "Add frames from sprite sheet"（同一功能，别被两个名字绕晕）。

### offset 语义（源码 `scene/2d/animated_sprite_2d.cpp`）
```cpp
Point2 ofs = offset;
if (centered) { ofs -= s / 2; }   // s = 96×64
```
代入实测数据（角色脚底在贴图 y=38，格子高 64）：
`脚底节点坐标 = offset.y - 32 + 38 = offset.y + 6` → **offset.y = -6**
→ **上一版文档写的 `offset = (0, -26)` 是错的，已改为 `(0, -6)`**

### 其他修正
- 视口分辨率建议从 640×360 改为 **320×180**（角色仅 11×16 像素，640×360 下不可见）
- 补充说明：`scale` 会一并放大 `offset`（局部坐标），scale=2 时 offset 要改成 (0,-12)
- 碰撞体数值补上 scale=2 时的对应值

**文档现状**：`docs/SPRITE_SLICING.md` 已按源码事实全面校正。

---

## 2026-11-09 · 首次代码 review（切图成果验收）

**验收对象**：`scenes/player.tscn`（用户自己切的三个动画）

### 🟢 结论：切图 100% 正确

逐帧校验 25 个 AtlasTexture，全部通过：
- 每帧 `region` 均为 `96×64`，无一处尺寸错误
- 第 i 帧的 region.x 精确等于 `i × 96`（0, 96, 192, 288, 384, 480, 576, 672, 768）—— 无错位
- 帧序正确，无跳帧、重复、倒序
- 三组动画的 atlas 源文件归属正确：
  - idle  → base_idle_strip9.png（9 帧）
  - run   → base_run_strip8.png（8 帧）
  - walk  → base_walk_strip8.png（8 帧）
- 所有动画 `loop=1`（循环）已开

> Godot 生成的是 **AtlasTexture**（引用原图 + 矩形区域），不是 25 个独立 PNG 文件 ——
> 这是正确做法，显存占用最优。**点名表扬，避免他下次去手工切图。**

### 🟡 发现的问题

1. **缺少主场景**：`project.godot` 无 `run/main_scene` → 运行会报
   `Error: Can't run project: no main scene defined in the project.`
2. **`stretch/aspect="expand"`** 对像素游戏不合适（视口随窗口变形，比例失控）→ 应改 `keep`
3. **缺 `stretch/scale_mode="integer"`**（缺省 fractional，非整数缩放会糊）
4. **缺基准分辨率** `viewport_width/height` → 缺省 1152×648
5. **缺 `default_texture_filter=0`**（缺省 Linear，像素画会被抹糊）
6. **缺 2D 像素吸附**（角色移动会半像素抖动）
7. **无 `scripts/actors/player.gd`** → 动画不会自动播放（`animation` 属性只是初始值，不等于播放）
8. **AnimatedSprite2D 未设 offset**：格子 96×64 而角色仅 11×16，
   `centered=true` 时原点在腰而非脚 → 走路会"滑"。应为 `offset=(0,-6)`
9. **CollisionShape2D 无 shape**：节点存在但没有 RectangleShape2D → 无碰撞
10. **FPS 待调**：idle=9 偏高（像素风 idle 通常 6）、run=5 偏低（跑步通常 10-12）

### 已交付

- `docs/PROJECT_SETTINGS.md` —— 逐项设置说明（含"为什么"），所有键名从
  Godot 4.7.2 源码 `core/config/project_settings.cpp` 核对
- 同步修正 `docs/ROADMAP.md` §4.1 的分辨率建议

### 下一步

用户先改 4 项项目设置 → 运行验证画面清晰 → 再加 `player.gd` 脚本做移动。

**待你决定**（仍未回复，影响切图是否白做）：
① 发型选哪个 ② 用现有小图还是从 aseprite 重导 4 倍大图（**若重导，切图参数变 Size=384×256，需重切**）③ 先做几个动作

---

## 2026-11-09 · 项目设置验收（第 2 次 review）

**用户已改 `project.godot`**，我逐项核对结果：

### ✅ 已正确设置（5 项）
```
window/size/viewport_width=320          ✓
window/size/viewport_height=180         ✓
window/stretch/mode="canvas_items"       ✓
window/stretch/scale_mode="integer"      ✓
textures/canvas_textures/default_texture_filter=0   ✓
2d/snap/snap_2d_transforms_to_pixel=true ✓
```

### 🟡 仍缺（2 项）
1. **`window/stretch/aspect`** —— 未显式写入。
   查源码 `core/config/project_settings.cpp:1788`，**默认值本来就是 `keep`**，
   所以行为上正确，但建议显式写出来（避免以后误改或团队误解）。
2. **`2d/snap/snap_2d_vertices_to_pixel`** —— 缺省 false。
   源码 `scene/main/scene_tree.cpp:2143` 确认键名与默认值。
   顶点吸附对 Polygon2D/TileMap 的边缘对齐有用，建议一并开启。

### 🟡 仍缺主场景
`run/main_scene` 依旧没有 → 运行仍会报 "no main scene defined"。

### ❓ 用户提问：「顺手解决窗口太小 在哪里改」
→ 已在 `docs/PROJECT_SETTINGS.md` §四 补充精确位置：
**项目设置 → 显示 → 窗口 → 尺寸**（不是「拉伸」那一页，两页很像容易看错）。
字段名 `Window Width Override` / `Window Height Override`，
填 1280 / 720（= 320/180 的 4 倍，必须整除否则 integer 模式失效）。
另附源码依据 `editor/run/editor_run.cpp:280`。

### ✅ 补充：为什么这两个选项「看不到」——高级设置机制

用户反馈在界面上找不到这两个选项。**根因查明**（源码 `core/config/project_settings.h:267`）：
```cpp
#define GLOBAL_DEF_BASIC(m_var, m_value)  ... basic=true   ← 基础设置，默认可见
#define GLOBAL_DEF(m_var, m_value)       ... basic=false  ← 高级设置，默认隐藏
```
- `window_width_override` / `window_height_override` 用的是 `GLOBAL_DEF` → **默认隐藏**
- `snap_2d_vertices_to_pixel` 同样用 `GLOBAL_DEF` → **默认隐藏**
- 而 `viewport_width` / `snap_2d_transforms_to_pixel` 用 `GLOBAL_DEF_BASIC` → 默认可见

**这解释了一个关键现象**：用户在「尺寸」页找不到 override，是因为
它被默认过滤掉了；而**用搜索框就能找到** —— 因为过滤逻辑（`editor_inspector.cpp:135`）
带 `p_filter.is_empty()` 条件，搜索时不再过滤，高级设置会全部显现。

**解决方案**：项目设置窗口**右上角勾选 `Advanced Settings`**。

已写入 `docs/PROJECT_SETTINGS.md` §四（含可见性对照表）。

### ✅ 最终 project.godot 状态（全部正确）
```
[display]
window/size/viewport_width=320
window/size/viewport_height=180
window/size/window_width_override=1280        ✓ 新增
window/size/window_height_override=720        ✓ 新增
window/stretch/mode="canvas_items"
window/stretch/scale_mode="integer"

[rendering]
textures/canvas_textures/default_texture_filter=0
2d/snap/snap_2d_transforms_to_pixel=true
2d/snap/snap_2d_vertices_to_pixel=true          ✓ 新增
```
> `window/stretch/aspect` 未显式写入，但源码默认值即 `keep`（`project_settings.cpp:1788`），
> 行为正确。
>
> 仍缺 `run/main_scene` → 运行会报 "no main scene defined"。

### 下一步
1. 设主场景（`项目设置 → 应用 → 运行 → 主场景`）
2. 调 FPS：idle 9→6，run 5→12
3. 设 `AnimatedSprite2D.offset = (0,-6)`（角色 11×16 居中于 96×64 格子，
   `centered=true` 时原点在腰而非脚 → 走路会"滑"）
4. 给 `CollisionShape2D` 加 `RectangleShape2D`（Size 12×8，Position (0,-4)）
5. 写 `scripts/actors/player.gd` 实现移动

**仍待用户决定**：① 发型 ② 现图 vs 重导 4 倍大图（重导则 Size 变 384×256，需重切）③ 先做几个动作

---

## 2026-11-09 · M1 Review（移动脚本 + 场景）

**审查对象**：`scripts/actors/player.gd`（用户写的）、`scenes/player.tscn`、
`scenes/main.tscn`（新建）、`project.godot`（新增输入映射 + 主场景）

### 🔴 致命：脚本没挂到节点上 —— 角色完全不动

实测无头模拟（按住 ui_right 60 帧）：
```
位置: (0.0, 0.0)  velocity: (0.0, 0.0)
```

根因：`scenes/player.tscn` 的 Player 节点**无 script 属性**：
```
has_method('_physics_process'): false
script = <null>
```
用户创建了 `player.gd` 文件，但**没绑定到节点**。
（我第一次写模拟测试时也踩了坑：没 `add_child` 进树 → `is_inside_tree()=false` → 物理帧不执行）

### 🔴 脚本用 `ui_left/ui_right`，用户白配了 4 个自定义动作

实测：
```
get_axis('ui_left','ui_right')      = 1.0
get_axis('move_left','move_right')  = 0.0
```
用户配的 WASD **完全没被使用**，只能靠方向键移动。
（Godot 官方模板那行注释 `# you should replace UI actions with custom gameplay actions`
正是提醒这件事）

### 🔴 `get_axis` 是一维的 → 上下不能动
必须换 `Input.get_vector("move_left","move_right","move_up","move_down")`，
否则只能左右。`get_vector` 还能自动归一化（手写加减斜走会快 41%）。

### 🔴 3D 平台跳跃模板残留 → 角色会掉出屏幕
```gdscript
if not is_on_floor(): velocity += get_gravity() * delta   # ← 2D 俯视不该有重力
if Input.is_action_just_pressed("ui_accept") and is_on_floor(): ...
```
`get_gravity()` 在 CharacterBody2D 上**确实存在**（实测 has_method=true），
所以这段**不会报错**，它会静静让角色一直下坠 —— 俯视游戏最经典的翻车点。
实测 `is_on_floor: false`（场景无地面），跳跃侥幸没触发，但重力一直在生效。

### 🟡 无动画切换逻辑
实测 `当前动画: run  frame: 7` —— 一直卡在场景预设值，不会随移动状态切换。

### 🟡 Camera2D.position = (0,-5) 偏移多余
那是给 AnimatedSprite2D 对脚底用的。摄像机应对准 Player 原点，
多 5px 会让画面看着偏。建议改回 (0,0)。

### 🟢 做对了的
- `main.tscn` 主场景 + Player 用实例引入（不重复维护）
- `Camera2D` 挂在 Player 下自动跟随 ✓ + 平滑 ✓
- 碰撞体 (12,8)@(0,-4) ✓ / AnimatedSprite2D.position=(0,-5) ✓ / FPS 6,10,12 ✓
- 8 项项目设置 + 4 个输入映射动作全对 ✓
- `move_toward` 减速（避免瞬间停止的突兀）✓

### 已交付
`docs/REVIEW_M1.md` —— 完整诊断 + 6 项改造清单 + 每条的问题原理

### 下一步（等用户改完再 review）
1. 把 `player.gd` 挂到 `player.tscn` 的 Player 根节点
2. `ui_*` → `move_*`，`get_axis` → `get_vector`
3. 删重力与跳跃代码
4. 加 idle/walk/run 动画切换
5. `Camera2D.position` 改回 (0,0)

---

## 2026-11-09 · M1 二次 Review

**已修好 3 项**：
- ✓ 脚本已挂载（`script = ExtResource("1_dqkch")`）
- ✓ 重力/跳跃代码已删除
- ✓ `Camera2D.position` 的 `(0,-5)` 已去掉

**实测**：`按住 move_right 60 帧 → 位置 (295, 0)，velocity (300,0)，松手后 velocity 归零` ✅ 移动正常

### 🔴 剩余问题 1：`get_axis` 只改了一半

```gdscript
var direction := Input.get_axis("move_left", "move_right")   # 动作名对了，函数还是一维
```
实测：`按住 move_down 60 帧 → 位置变化 (0,0)` ← 上下完全没反应

**但用户配置完全正确**（实测）：
```
move_up: physical_keycode=87 (W)   move_down: physical_keycode=83 (S)
get_vector(4向) = (0.0, 1.0)     ← 完全正常
```
→ 问题 100% 在函数选择：`get_axis` 只返回 x 分量，须换 `get_vector`
（4 参数，顺序左右上下）

### 🔴 剩余问题 2：无动画切换

实测 `动画: run` 60 帧后不变 —— 脚本从未碰过 AnimatedSprite2D。
需加 `@onready var anim` + `anim.play("idle"/"walk"/"run")`。

### 🟡 建议

- **SPEED=300 在 320×180 视口下太快**（1.07 秒横穿全屏 ≈ 每秒 27 个身位）
  → 建议降到 80~120
- `velocity` 需同时设 x 和 y（`velocity = direction * SPEED` 一步到位）
- 场景无地面，角色能走出屏幕 —— 验证阶段不用管，做地图时再加

### 交付
`docs/REVIEW_M1.md` 追加「第二次 Review」章节（含完整实测数据与脚本骨架参考）

---

## 2026-11-09 · 抖动问题诊断

**用户反馈**：走路时动画有点抖动，问是不是错觉。
**结论**：不是错觉，有明确可测成因。

**用户已完成的修改（全部正确）**：
- ✓ `get_vector("move_left","move_right","move_up","move_down")`
- ✓ 加了 `@onready var animation: AnimatedSprite2D` + idle/walk 切换
- ✓ `velocity = direction * SPEED`
- ✓ SPEED 降到 80

### 实测数据

逐帧记录玩家在屏幕上的实际像素位置（`player.position - camera.get_screen_center_position()`）：

**当前（有摄像机平滑）—— 亚像素乱跳**：
```
帧1 屏幕x=1.1556  小数=0.1556
帧4 屏幕x=3.7589  小数=0.7589   ← 整数部分没变，小数从 0.11 跳到 0.76
帧6 屏幕x=4.9911  小数=0.9911   ← 快到下一像素又退回来
帧8 屏幕x=5.9396  小数=0.9396
```

**关掉 position_smoothing 后 —— 完全稳定**：
```
帧0..7 屏幕x 全部 = 0.0000，小数恒为 0
```

### 根因

1. **主因**：Godot 4 的摄像机平滑做亚像素插值。玩家每帧移动 `80/60 = 1.333` 像素（非整数），
   摄像机用 speed=8 指数平滑去追 → 摄像机永远停在 `38.307` 这种带小数的位置。
   渲染时引擎把每个精灵变换四舍五入到整数像素，但**取整时机每帧不同** → 角色忽左忽右跳 1px。
   在 4× 整数缩放下，1.333 像素被放大成 5.33 屏幕像素，抖动被放大 4 倍。
2. **次因**：位移 1.333 像素/帧是非整数（本身没问题，但让成因 1 每帧都发生）。

### 结论与建议

**只改一行**：`main.tscn` 的 Camera2D 设 `position_smoothing_enabled = false`。
- 摄像机是 Player 子节点，仍自动跟随
- 画面完全稳定
- 唯一损失：失去缓动（像素风里反而更常见更正确，且角色在屏幕正中，背景阶梯移动察觉不到）

若想保留平滑感，用方案 B：脚本 lerp 后 `global_position = global_position.round()`。

### 附带说明（不是抖动源）

走路动画 10 FPS vs 物理 60 FPS = 同一动画帧显示 6 个物理帧再跳下一帧。
这是像素风标准做法，不是抖动源。FPS 保持 8~12 即可。

### 交付
`docs/JITTER_DIAGNOSIS.md` —— 完整实测数据、根因分析、三种方案对比

---

## 2026-11-09 · 抖动修复验证（✅ 通过，M1 阶段完成）

**用户已关闭摄像机平滑**（`position_smoothing_enabled` 默认即 false，文件中不写这行即为关闭）。

### 验证结果

```
>>> 24 帧中出现亚像素的帧数: 0 （0 = 完全稳定）✅

=== 四方向 ===
  move_right  位移长度=40.000   move_left  位移长度=40.000
  move_up     位移长度=40.000   move_down 位移长度=40.000

=== 斜向 ===
  右下位移=(28.2843, 28.28429)  长度=40.000  （与单向同速 ✓ 归一化生效）
  velocity 长度 = 80.000
```

**M1 全部验收项通过**：切图 / 项目设置 / 输入映射 / 脚本挂载 / 移动 / 动画切换 / 脚底对齐 / 碰撞体 / 摄像机跟随

### 「关闭平滑的影响」实测对比

| | 方案A（关闭，当前） | 方案B（开启） |
|---|---|---|
| 摄像机x | 0.00, 1.33, 2.67, 4.00, ... | 0.00, 0.00, 0.00, 0.00, ...（启动延迟）|
| 玩家屏幕x | 0.00, 0.00, -0.00, 0.00, ... | 0.00, 1.33, 2.67, 4.00, ... |
| 特征 | 玩家钉死在屏幕正中，**绝对静止** | 玩家相对屏幕漂移，**亚像素滞后** |
| 滞后量 | 恒为 0 | 4.47 → 9.08 且带小数 |

**结论**：关闭平滑 = 摄像机与玩家完全同步 = 玩家在屏幕上静止、背景整格跳动。
这正是俯视游戏的标准观感（焦点在角色，背景是配角）。
唯一损失是"玩家急停时背景不滑行"，在像素风里几乎察觉不到。

**若想要平滑又不抖**：自己写 lerp + `global_position.round()`，不要用内置平滑。

### 交付
`docs/JITTER_DIAGNOSIS.md` 已重写为「修复验证 + 影响分析」

### 下一步：M2 农场地块系统
但先要定两件事（影响切图是否白做）：
① 发型选哪个 ② 用现有小图还是从 aseprite 重导 4 倍大图（重导则 Size 变 384×256，25 帧全部重切）

---

## 2026-11-09 · 朝向问题诊断

**用户反馈**：往左往右往上下走，人物动画都朝右边。
**结论**：**不是代码问题 —— 素材本身只有单一朝向（侧脸朝右）。**

### 实测证据

1. 渲染 `WALKING/base_walk_strip8.png` 全部 8 帧 → **姿势完全相同，只有腿部交替**
2. 渲染 `AXE/base_axe_strip10.png`（动作幅度最大）→ **斧头从右后方挥出、碎石向右飞散** → 确认朝右
3. 目录结构：8 个变体全是**发型**（base/bowlhair/curlyhair/longhair/mophair/shorthair/spikeyhair/tools），
   **20 个动作文件夹里没有任何"朝向"变体**
4. `_Source/` 的 aseprite 是**加密/自定义格式**（magic `9b18 0800` ≠ 标准 `A5E0`），无法解析/导出额外朝向

### 关键前置验证（已通过）

```
walk 帧0 角色占 x[43,53]  中心=48.0
贴图宽=96                 贴图中心=48.0
→ 角色中心与贴图中心一致（flip_h 翻转后不会偏移）✅
```
- `centered=true` 时 Godot 以贴图中心为翻转轴，角色精确居中 → 翻转不产生位移
- `flip_h` 只影响 X 方向，**脚底线 y=38 不变** → 用户的 `position=(0,-5)` 无需调整

### 方案（已写入 docs/FACING_DIRECTION.md）

**方案 A（推荐）**：左右翻转 + 上下保持朝向
```gdscript
var facing := 1   # 成员变量，记住上次水平朝向

if direction.x < 0: facing = -1
elif direction.x > 0: facing = 1
animation.flip_h = facing < 0
```
- 水平镜像侧视角色完全合理，看不出破绽
- 上下时保持上次朝向（不"变脸"）
- 站着不动时也保持朝向（符合直觉）

**其他选项**：flip_v（不推荐，头朝下）／找三向或四向素材／星露谷本尊是三向（正面/背面/侧面两套动画）

### 建议

先用方案 A 跑通。等有了农场地图的环境参照物（树、房子、篱笆），
玩家对"角色朝向"的敏感度会大幅下降（主要在看环境），届时再决定是否升级素材。

### 交付
`docs/FACING_DIRECTION.md` —— 素材诊断、翻转方案、代码参考、星露谷做法对比

### 补充：素材朝向的定量证据

逐像素分析 IDLE 帧头部：
```
脸部左右头发边缘: x=43 和 x=53  → 中点 48.0
两只眼睛:         x=48 和 x=51  → 中点 49.5
→ 眼睛中点右偏 1.5px → 四分之三侧视朝右
```
（若为正面视，两眼应关于 x=48 对称，即 x=46/x=50）

源 aseprite 图层名（strings 提取）：
```
hand back / hand front / body / head / eyes / HAIR
bowl hair / short hair / mop hair / spikey hair / afro hair / long hair
```
→ 有"手的前后层"说明作者考虑过正面绘制顺序，**但没有建立四方向**。

源文件格式：magic `9b18 0800`（非标准 aseprite `A5E0`）→ **加密，无法补导其他方向**。

### 用户追问："所以素材不够，需要重新找素材吗？"
**答：不用，现在这批完全能用。** 理由：
1. 左右靠 flip_h 完美解决（已验证角色精确居中于 x=48，翻转零偏移）
2. 上下不分朝向是可接受的独立游戏常见做法
3. 换素材的真正时机是"农场做完、上下移动仍觉违和"时
4. **关键：朝向逻辑是数据驱动的**（一个 facing 变量），换素材时游戏逻辑零改动，
   只改"选动画名"那一行

→ 已写入 docs/FACING_DIRECTION.md §零 与 §四

---

## 2026-11-09 追问："素材中的帽子怎么用上？"

**结论：素材包里完全没有帽子/道具。** 186 个 PNG 全是角色（Human 160 + Goblin 20 + Skeleton 7
- 源文件），`assets/` 下除 `Characters/` 外没有任何目录。

**8 个变体的真相（逐像素实测）—— ⚠️ 下方第 2 条已在同日推翻，见文末勘误：**
- `base` = 光头 + 完整身体
- `bowlhair / curlyhair / longhair / mophair / shorthair / spikeyhair` = 6 种发型，
  ~~是**整张图替换**不是图层~~ → **错！后来实测证明它们是独立头发图层**（详见文末勘误）
- `tools` = **不是角色**，是「前手 + 工具」的独立叠加层
  - IDLE 不透明 112 px / 9 帧 ≈ 12 px/帧（只有一只小手）；WALKING 96 px / 8 帧
  - AXE 1275 px（有斧头）、WATERING 529 px（有洒水壶）
  - **实测 base + tools 逐帧 alpha 合成 = 持斧/浇水/锄地/挥锤的完整角色，像素级对齐**

**头部对齐基准（IDLE f0 实测）：**
- 肤色 x∈[44,52] y∈[24,33]；角色中心 x=48
- 各发型头顶 y：base 23 / bowl 21 / curly 20 / long 20 / mop 20 / short 23 / spikey 21
- → 帽子底边至少 y=20，否则会穿过最高的头发

**源 aseprite 图层名无 hat/cap/helmet 任何一项**，且文件加密无法补导。
（附带发现：完整源文件里有 afro hair / red hair / roll hair coloured，导出的 PNG 没有。）

**给用户的落地建议：**
- 工具不用操心 —— `tools` 图层已白送 4 种工具，M2 直接用（Body + Tool 双 AnimatedSprite2D 叠加）
- 帽子是纯装饰，不阻塞里程碑 → 三条路：① 独立 Sprite2D 帽子层（不随动画动）
  ② 逐帧帽子条带（最像原素材，工作量大） ③ 离线预合成（运行时最省）
- 建议等 M2 工具系统成型后，把帽子 + 工具统一做成一套 `EquipmentLayer` 机制

→ 详见 `docs/EQUIPMENT_LAYERS.md`

---

## 2026-11-09 勘误 + 帽子跟随动画方案（用户追问后）

### 用户反馈
- "flip 的我自己写了" → **已复验通过**：向右 flip_h=false、向左 flip_h=true、松手保持最后朝向；
  动画帧正常推进（idle 9 帧内出现 0–6 帧）。
  另查 Godot 4.7.2 源码 `scene/2d/animated_sprite_2d.cpp:514` 确认
  `play()` 同名时**不会重启动画**（`if (name != animation)` 才重置帧），
  所以每帧调 `play("idle")` 是安全的。
- "头发这些该怎么做，工作量大没关系，要跟随动"

### ⚠️ 勘误：6 个发型变体是独立图层，不是整图替换

初版结论错了。新实测（IDLE f0 逐像素）：

| 变体 | 像素 | 包围盒 | 判定 |
|---|---|---|---|
| base | 154 | x43–53 y23–38（高16） | 完整角色（身体+光头+脸） |
| bowlhair | 105 | x42–54 y21–33（高13） | **只有头发** |
| curlyhair | 159 | x39–56 y20–31（高12） | 只有头发 |
| longhair | 131 | x39–54 y20–31（高12） | 只有头发 |
| mophair | 106 | x42–55 y20–31（高12） | 只有头发 |
| shorthair | 54 | x43–52 y23–30（高8） | 只有头发 |
| spikeyhair | 96 | x42–54 y21–31（高11） | 只有头发 |
| tools | 12 | x42–45 y34–37（高4） | 只有手 |

判据：完整角色高 16 行、下缘 y=38（脚底线）；发型层高 8–13 行、全在头部区域。

**真相：8 个变体 = 3 个图层族（身体 / 头发 / 工具）。**
`base + 发型 + tools` 三层 alpha 叠加 = 完整持械角色，已实测 6 个动作全部正确。

（初版为什么会错：当时只看了 `base` vs `bowlhair` 的**差分 bbox 只在头部**，
误以为"发型 = 完整角色换头"。实际上差分在头部是因为发型层**只覆盖头部**，
恰好是同一现象的两种解释，必须靠包围盒高度和像素数才能区分。）

### 头部跟随数据（20 动作 × 全帧，肤色连通域 100% 检出）

脸部位移最大：**水平 6px、垂直 5px**（RUN/JUMP 是上下 bob，HAMMERING 是左右摆）。
DEATH 特殊（头倒下 y21→33）。HURT 有 1 帧检不到（工具已加回退）。

→ 结论：**静态帽子图 + 逐帧平移就能跟住**，不需要逐帧重画。

### 产出：`tools/hat_layer.py`

四个子命令：
- `ref` —— 输出 base+发型 合成好的参考帧（带 8px 网格），**美术直接在这张图上画帽子**
- `anchor` —— 扫描每帧脸部锚点 → `assets/data/human_face_anchors.json`
- `bake` —— base + 发型 + 帽子(按锚点平移) + 工具 → 最终 strip
- `preview` —— 左右对照预览图

### 两条落地路线（已给用户选择）
- **离线烘焙**：切图量不变（还是每帧一个 AtlasTexture），换发型要重新烘焙+重切
- **运行时多层**：Body/Hair/Tool 三个 AnimatedSprite2D 同播一个动画名，
  换发型 = 换 `Hair` 的 SpriteFrames，可做换装系统，但切图量 ×3

### 待用户拍板
1. 发型选哪个（6 选 1，或 base 光头）
2. 走离线烘焙还是运行时多层
3. 帽子：自己画（美术工作量）还是先跳过

---

## 2026-11-09 M2 开工前的 API 实测

**背景**：用户决定先用 `base`（光头），去做 M2 场景。我越界擅自生成了占位地块图集，
用户明确纠正"我没说要你动手，我自己来"→ 已把 `assets/data/placeholder_tiles.png`
和 `.import` 移入回收站（可恢复）。**教训：素材/美术一律不碰。**

### 已核实的 4.7.2 API（全部 `godot --headless` 实测，非记忆）

`TileMapLayer`：
```
set_cell(coords, source_id, atlas_coords, alternative_tile=0)  ✅
get_cell_source_id(coords) -> int        ✅ 空格返回 -1
get_cell_atlas_coords(coords) -> Vector2i ✅
get_cell_alternative_tile(coords) -> int ✅
erase_cell(coords)                        ✅ 擦除后 source_id 变 -1
get_used_cells() -> Array[Vector2i]       ✅
map_to_local(Vector2i) -> Vector2         ✅ 格子(0,0) → (8,8)（16×16 的中心）
local_to_map(Vector2) -> Vector2i         ✅
update_internals()                        ✅ 改完不调则当帧不生效
```

`TileSet`：
```
TileSet.tile_size = Vector2i(16,16)                  ✅
TileSetAtlasSource.texture_region_size               ✅
TileSetAtlasSource.create_tile(Vector2i)             ⚠️ 返回 void！写成 var err := 会解析报错
TileSetAtlasSource.has_tile(Vector2i)                ✅
TileSet.add_source(src) -> int                       ✅ 从 0 开始
TileSet.add_physics_layer() / set_physics_layer_collision_layer() ✅
```

### 两个实测坑（新手 100% 会踩）

**① `local_to_map()` 收局部坐标，不是全局坐标。**
实测：layer 父节点偏移(-30,20)、自身偏移(100,50)、玩家全局(160,80)
```
直接 local_to_map(global_position)  = (10,5)  ❌
local_to_map(to_local(global))      = (5,0)   ✅
```
→ 必须写 `layer.local_to_map(layer.to_local(player.global_position))`
layer 在原点时两种写法结果一样，**所以早期测不出来，等农场挪位置就全错位**。

**② 新 PNG 没被导入时 `create_tile` 会失败**，报
`Cannot create tile. The tile is outside the texture...` —— 不是尺寸问题，
是缺 `.import` 导致 `load()` 返回 null。先跑
`godot --headless --path . --import`。

### 地块尺寸的推导（不是拍脑袋）
- 视口 320×180 ÷ 16 = **20×11.25 格可见**（星露谷比例）
- 角色实际 11×16 像素 → **正好一格高**
- → **tile size = 16×16**

→ 施工手册已写入 `docs/M2_FARM_TILES.md`（含 API 表、坐标坑、7 步流程、常见坑清单）

### M2 拆分建议
- **M2a**（本轮）：场景骨架 + TileMapLayer + TileSet + 铺地 + 状态字典 + 锄地交互
- **M2b**：播种/生长/收获（依赖 M3 背包 + M4 时间）

---

## 2026-11-09 Review · 栅栏（用户："我感觉我用错了节点"）

用户已在 `scenes/main.tscn` 里建了 `Fence (Node2D)` + 4 个 `StaticBody2D`
（FenceTop/Left/Right/Bottom），无碰撞体、无贴图、position 全 (0,0)、Main 未开 Y 排序。

### 结论：**节点没选错**
栅栏要"挡住玩家" → 必须用阻挡类节点。`StaticBody2D` 正是这个，
不是 `Area2D`（Area2D 只检测不阻挡）。直觉正确。

### 🔴 但它现在完全不阻挡（实测）
用真实 main.tscn 无头模拟玩家向下走 120 帧：
```
[现状·无碰撞体] y = 158.67  → 直接穿墙
[加上碰撞体]   y =  11.92  → 被挡住（栅栏底边 y=16，窄带 y=12..16）
```

### 三个必补项
1. **没有 CollisionShape2D** —— StaticBody2D 自己不带形状，形状由子节点提供
2. **没有 Y 排序** —— Main.y_sort_enabled=false，栅栏和 Player 是兄弟但不排序，
   永远按树顺序绘制（玩家永远在栅栏前面）
3. **原点必须在底边** —— 见下

### Y 排序判定规则（源码核对，非记忆）
`Godot 4.7.2 servers/rendering/renderer_canvas_cull.h:117`
```cpp
struct ItemYSort {
	bool operator()(const Item *p_left, const Item *p_right) const {
		const real_t left_y  = p_left->ysort_xform.columns[2].y;   // ← 节点原点的世界 Y
		const real_t right_y = p_right->ysort_xform.columns[2].y;
		if (Math::is_equal_approx(left_y, right_y)) {
			return p_left->ysort_index < p_right->ysort_index;      // ← Y 相同按树顺序
		}
		return left_y < right_y;
	}
};
```
→ **排序键是节点原点 Y，不是贴图视觉中心。**
→ 栅栏贴图默认 `centered=true` 会让排序基准落在栅栏中间，玩家稍微靠近就被挡，很怪。
→ 栅栏节点 position 必须是**底边（贴地线）中点**，贴图改 `centered=false` + `offset`。

### 栅栏规范（写进 docs/FENCE_REVIEW.md）
- 单段栅栏场景 `scenes/world/fence.tscn`：StaticBody2D → Sprite2D + CollisionShape2D
- 贴图 `centered=false`，`offset=(-8,-16)`（16×16 图，下边缘对齐原点）
- 碰撞体 `RectangleShape2D(16,4)` at `(0,-2)` —— **底边窄带，不是整格**
  （填满整格玩家会像撞墙，离栅栏老远；窄带才有"脚被挡、身子露出来"的星露谷观感）
- 容器 `Entities` 开 `y_sort_enabled=true`，Player 和 Fence 做**兄弟节点**
- 玩家原点在脚底（碰撞盒 y∈[-8,0]），栅栏原点在底边 → 两套基准必须一致

### 待用户决定
1. 逐格摆放（1 格 1 段实例，推荐，和地块系统统一、以后能做门/玩家自建）
   vs 4 段大墙
2. 四面是否留缺口当门

---

## 2026-11-09 Review · 栅栏第二轮（用户改为"1 个 body + 4 个 CollisionShape2D"）

### 结构
```
Main (Node2D)
├── Player
└── Fence (StaticBody2D) pos=(0,0)
    ├── FenceTop    (CollisionShape2D) pos=(160,0)   size=(340,16)  → y∈[-8,8]
    ├── FenceBottom (CollisionShape2D) pos=(160,188) size=(340,16)  → y∈[180,196]
    ├── FenceLeft   (CollisionShape2D) pos=(-8,100)  size=(16,200)  → x∈[-16,0]
    └── FenceRight  (CollisionShape2D) pos=(328,100) size=(16,200)  → x∈[320,336]
```

### ✅ 好的改动
合并成一个 body + 4 个 CollisionShape2D，碰撞部分比之前简洁，是好思路。

### 实测数据
```
四向移动 120 帧（从 (160,100) 出发）：
  move_down  → y = 180.00   move_up   → y = 16.00
  move_right → x = 314.00   move_left → x = 6.00
玩家原点可活动范围：x ∈ [6, 314]（308 宽）、y ∈ [16, 180]（164 高）
玩家初始 position：应为 (0,0)，实测被推成 (0, -7.94)
```

### 🔴 问题 1：玩家出生在 FenceTop 碰撞体内
出生点 (0,0) 的碰撞盒 y∈[-8,0] 完全落在 FenceTop 的 y∈[-8,8] 里 → 第一帧被挤出去。
→ 出生点挪到场地内部，如 (160,100)。

### 🔴 问题 2：合并成一个 body 导致 4 面墙无法各自 Y 排序（本次改动引入的新问题）
源码 `Godot 4.7.2 servers/rendering/renderer_canvas_cull.cpp:110-165`
`_collect_ysort_children`：
- 排序列表 = Y 排序容器的**直接** CanvasItem 子节点
- **只有子节点自己也开了 sort_y 才递归收集其子孙**
- `Fence` 是 StaticBody2D，sort_y=false → 它的 Sprite2D 子节点**不参与排序**
- → 整组按 Fence 自己的 Y(=0) 排 → **南墙遮挡关系反了**（南墙在屏幕下方应画在玩家前面）

**两种修法**：
- A（推荐）：视觉拆成 4 个 Sprite2D 作为 Y 排序容器的**直接子节点**，
  StaticBody2D 只管碰撞不画东西 → 碰撞与视觉分离，各墙各自排序
- B：每面墙一个独立 StaticBody2D（含 CollisionShape2D + Sprite2D），
  body 的 position = 该墙底边，body 是容器直接子节点 → 各自排序

### 🔴 问题 3：完全没有视觉
StaticBody2D 不绘制任何东西 → 当前是看不见的墙。
加 Sprite2D 时：原点必须在墙的**底边**，centered=false + offset 把图钉在原点上方。

### 🟡 问题 4：可活动区 308×164 不是 16 的整数倍（19.25 / 10.25 格）
→ 后面铺 TileMapLayer 会错位。建议按格子围：x 16→336，y 16→176（20×10 格）。

### 🟡 问题 5：角落 6×8 缺口
x∈[-16,-10] y∈[-8,0] 及右上角对称位置没覆盖。玩家盒宽 12 暂时挤不进去，
但角落出生可能卡住。把上下墙 x 范围与左右墙 y 范围对齐可消掉。

### 🟢 玩家自身对齐良好，不用改
```
AnimatedSprite2D.pos=(0,-5) centered=true；CollisionShape2D.pos=(0,-4) size=(12,8)
→ 碰撞盒覆盖 y∈[-8,0]；贴图最低不透明像素 y=38 → 可见脚底在节点空间 y=+1
→ 差值 -1px ✅ 角色实际宽 11px，碰撞盒宽 12 ✅
```
副作用（可后处理）：玩家盒高 8 且向上延伸 →
- 从北侧往下撞 → 脚底停在碰撞带北沿（0 缝隙）
- 从南侧往上撞 → 脚底停在碰撞带南沿**外 8px**（8px 缝隙）
解法：栅栏贴图底边画在"脚底停住的位置"，或把玩家碰撞盒改矮成 12×4 @(0,-2)
（俯视游戏的标准做法是脚底小碰撞盒）。**建议先不动玩家**，等有贴图看实际效果。

→ 详见 `docs/FENCE_REVIEW.md`（已覆盖上一版）

---

## 2026-11-09 Review · 游戏边界（用户澄清："我其实是想用来做游戏边界的，不是真的栅栏"）

### 前提变了，结论大改
隐形边界 ≠ 装饰栅栏。**不需要视觉 = 不需要 Y 排序 = 不存在贴图/排序问题。**

### 上一轮结论修正
| 上一轮 | 现在 |
|---|---|
| 🔴 合并 body 导致 Y 排序错乱 | **作废**（无视觉即无 CanvasItem 参与排序）|
| 🔴 没有视觉 | **作废**（隐形边界本就不该有）|
| 🟢 8px 缝隙 | **作废**（看不见墙）|
| 🔴 玩家出生在碰撞体内 | **仍成立** |
| 🟡 角落 6×8 缺口 | **仍成立** |
| 🟡 可活动区不对齐 16px 网格 | **仍成立** |

### ✅ 合并成一个 body 的做法保留 —— 这是标准做法
`StaticBody2D` 挂多个 `CollisionShape2D` 正是 Godot 推荐的边界实现，
比 4 个独立 body 简洁（一个 body = 一个边界集合）。

### 实测：当前布局 vs 目标布局

**当前**（用户原样）：
```
FenceTop    pos=(160,0)   size=(340,16)  → y∈[-8,8]
FenceBottom pos=(160,188) size=(340,16)  → y∈[180,196]
FenceLeft   pos=(-8,100)  size=(16,200)  → x∈[-16,0]
FenceRight  pos=(328,100) size=(16,200)  → x∈[320,336]
```
玩家原点可活动范围：**x ∈ [6, 314]、y ∈ [16, 180]** → 308×164 = 19.25×10.25 格（非整数格）

**目标（20×10 格农场，脚底范围 x∈[16,336] y∈[16,176]）**：
```
FenceTop    pos=(176,0)   size=(364,16)
FenceBottom pos=(176,184) size=(364,16)
FenceLeft   pos=(2,92)    size=(16,200)
FenceRight  pos=(350,92)  size=(16,200)
```
**实测**：move_up→16.003, move_down→175.9999, move_left→16.003, move_right→335.9969
→ 正好 x∈[16,336] y∈[16,176]（0.003 为浮点误差）= **20×10 格**，四角重叠覆盖无缺口 ✅

### 关键换算关系（以后设边界都要用）
玩家碰撞盒 12×8 位于原点上方（覆盖 y∈[-8,0]），可见脚底在节点空间 y=+1（差 1px）。
→ 脚底停住线 = 墙内沿 **± 6**（水平半宽）/ 垂直方向从北侧撞是 **+8**（盒高）、从南侧撞是 **±0**。
→ **要让"脚底"而不是"碰撞盒"贴到网格边界，墙要往外让 6px(水平)/8px(垂直)。**
→ 上面那组数字已算进这个偏移。

### 思路提醒
**"农场范围"应由「玩家能站到哪儿」定义，不是「墙在哪」定义。**
先定 20×10 格，再反推墙的位置。

### 备选：代码 clamp 代替物理墙
```gdscript
position.x = clampf(position.x, LEFT, RIGHT)
position.y = clampf(position.y, TOP, BOTTOM)
```
边界精确但贴墙不能滑动（move_and_slide 的滑动感会丢）。**现阶段建议继续用物理墙。**

### 前瞻
M7 每张地图都要边界 → 建议按地图尺寸代码生成（参数就 4 个数），
或做成 `scenes/world/boundary.tscn` 实例化。

→ `docs/FENCE_REVIEW.md` 已按隐形边界前提重写

---

## 2026-11-09 Review · 游戏边界 第三轮（验收通过）

用户调整完毕，实测全绿：
```
出生点 (159,91) 未被挤动 ✅
墙覆盖 x∈[-6,358] y∈[-8,192]，四角重叠无缺口 ✅
四向150帧：up→16.003 down→175.9999 left→16.003 right→335.997 ✅
脚底可活动范围 = x∈[16,336] y∈[16,176] = 20×10 格 ✅
四角逃逸测试 4/4 全过，且正确沿墙滑行 ✅
沿墙滑动：(100,30)斜冲 → (213.14,16.07) ✅
```
→ **游戏边界通过验收，可以进 M2。**

### 🟢 残留
Camera2D 的 `position_smoothing_speed = 8.0` 是 M1 修抖动时的残行。
`position_smoothing_enabled` 默认 false（源码 scene/2d/camera_2d.h:69），这行不起作用，
但容易让人误以为开了平滑 → 删掉或加注释。

### ⚠️ 前瞻：镜头限制要求农场比视口大
视口 320×180，当前农场 20×10 = 320×160。
Camera2D 的 limit_* 属性（limit_enabled 默认 true，camera_2d.h:75-76）源码逻辑
`scene/2d/camera_2d.cpp:170-190`：
```cpp
if (limit[SIDE_TOP] > limit[SIDE_BOTTOM] - screen_rect.size.y) {
    camera_pos.y -= screen_rect.position.y + (screen_rect.size.y - limit[SIDE_BOTTOM] - limit[SIDE_TOP]) / 2;
} // ← 限制区比视口窄 → 走"居中"分支，镜头被固定偏移，不再跟随玩家
```
代入：纵向 16 > 176-180(-4) → 为真 → **镜头不再跟随玩家** ❌
横向 320 = 视口宽 → 镜头横向完全锁死 ❌

### 实测过的 24×12 格方案
```
FenceTop    pos=(208,0)   size=(428,16)
FenceBottom pos=(208,216) size=(428,16)
FenceLeft   pos=(2,108)   size=(16,232)
FenceRight  pos=(414,108) size=(16,232)
```
实测脚底范围 x∈[16,400] y∈[16,208] = 24×12 格 ✅
镜头限制可行：横向 16>0 false、纵向 16>12 false → 都走正常夹取 ✅
镜头设置：limit_left=16 / limit_top=16 / limit_right=400 / limit_bottom=208

或保持 20×10 不设镜头限制，农场外面以后画背景。

---

## 2026-11-09 地图结构方案（用户问："地图建议怎么做，用什么节点？"）

### 核心判断：地面和耕地要用不同节点
| 层 | 节点 | 素材需求 |
|---|---|---|
| 地面（草地） | `Polygon2D` 纯色起步，后期可换 TileMapLayer | **0 张** |
| 耕地（已锄/已浇水） | **`TileMapLayer`** | 2–3 张 16×16 |
| 装饰 | TileMapLayer 或独立场景 | 以后 |
| 实体 | `Entities(Node2D)` 开 y_sort | — |

理由：草地铺满同一个 tile 就够；耕地要 2–3 个 tile 随状态切换。
**耕地层素材需求比地面贴图集小得多** → 绕开素材缺口的省力做法。
`Polygon2D` 是 Node2D 子类，坐标系与 TileMapLayer 一致，**零素材可跑**。

### 场景树
```
Farm (Node2D)
├── Ground (Polygon2D)    z_index=-2
├── Soil (TileMapLayer)   z_index=-1   ← TileSet 待建
├── Decor (TileMapLayer)  z_index=-1
└── Entities (Node2D)     y_sort_enabled=true, z_index=0
```

### 实测：TileMapLayer 的坐标语义（layer 放 (16,16)，tile_size 16）
```
map_to_local((0,0))   = (8, 8)     ← 格子中心（局部坐标）
local_to_map((16,16)) = (1, 1)     ← 局部(16,16) 属于格子(1,1)
```
→ **`local_to_map`/`map_to_local` 走该层的局部空间**，层自身 position 不影响映射，
只影响全局位置。所以 `Soil.position=(16,16)` → 格子(0,0) = 农场左上角格。

### 坐标空间陷阱复测
层偏移(100,50)、玩家全局(160,80)：
```
local_to_map(世界坐标)           = (10,5)  ❌
local_to_map(to_local(世界坐标))  = (3,1)   ✅
```

### 地面 Polygon2D 数值
| 农场 | 地面矩形 |
|---|---|
| 20×10 | x∈[-16,368] y∈[-24,208] |
| 24×12 | x∈[-16,432] y∈[-24,240] |
地面必须比墙的范围大一圈 —— 玩家脚底在 y=16 时身体伸到 y=0，
顶边只画到 y=16 会让角色浮在空白上。

### 现在就能做（0 素材）vs 等贴图
现在：定尺寸、Polygon2D 地面、Soil 节点先建(tile_set 留空)、
FarmData Autoload + Dictionary[Vector2i, SoilData]、锄地逻辑、Camera2D limit
等贴图：建 TileSet + Atlas Source、填耕地/浇水 tile、铺地

**set_cell 在 TileSet 为空时不报错，只是不显示** → 逻辑可先跑通，贴图到位只填 TileSet。

→ 详见 `docs/MAP_STRUCTURE.md`

### 勘误：地图场景树漏了 Main（用户指出："你设计的场景树，main 在哪里"）
初版把 `Farm (Node2D)` 当成了根节点，没交代它和主场景的关系。
**M2a 阶段根节点仍是 `Main`（main.tscn），不动。**

```
Main (Node2D)                  ← 主场景根，现有
├── Ground (Polygon2D)         z=-2   新增
├── Soil (TileMapLayer)        z=-1   新增
├── Decor (TileMapLayer)       z=-1   新增
├── Boundary (StaticBody2D)    ← 现有 Fence 改名，4 个 CollisionShape2D 原样
└── Entities (Node2D)          y_sort_enabled=true, z=0   新增
    └── Player (player.tscn)   ← 从 Main 拖进来
        └── Camera2D
```

迁移三步（全在编辑器拖）：
1. Main 下建 `Entities(Node2D)` → 勾 Y Sort Enabled
2. Player 拖进 Entities（Camera2D 随父节点走）
3. Main 下建 Ground/Soil/Decor，Fence 改名 Boundary
Player position (159,91) 不变（Entities 在原点）。

**Boundary 不放进 Entities**：隐形、无视觉、不需排序；放外面语义更清楚。
**背景层在 Entities 外面**：不参与 Y 排序，用 z_index 显式压低。
**Camera2D 留在 Player 下**：自动跟随最省事；M7 切地图时再移到 Main 下（Remote 模式）。

未来（M7）：`Main → World → Farm`，把现在这套 Main 的内容整体搬进 Farm，
**现在按未来命名，到时候一个节点名都不用改**。

---

## 2026-11-09 · 农场尺寸问题（"场地太小，镜头滚不动"）

### 核心结论
**农场大小 = `Boundary` 4 个 `CollisionShape2D` 的位置，与 `Ground` 铺了多少格无关。**
Ground 只是贴图。所以"改大"= 改 4 组数字 + 重铺 Ground + 挪出生点 + 设 Camera limit。

### 为什么 20×10 会锁死镜头
视口 320×180 = 20×11.25 格；20×10 农场 = 1.00×0.89 屏。
`camera_2d.cpp:170-190`：limit 区域某边小于视口 → 走"居中"分支 → 该轴**完全锁死不跟随**。
实测三种情况（视口 320×180）：
- limit 672×448 → 正常跟随，镜头 x∈[160,512]、y∈[90,358]
- limit 320×176 → 完全不跟随，钉死 (160,88)
- limit 320×448 → x 锁死，y 正常

### 通用公式（W×H 格，tile=16，玩家碰撞盒 12×8 原点在脚底）
```
FenceTop    pos=(16+8W, 0)        size=(44+16W, 16)
FenceBottom pos=(16+8W, 24+16H)   size=(44+16W, 16)
FenceLeft   pos=(2, 12+8H)        size=(16, 40+16H)
FenceRight  pos=(30+16W, 12+8H)   size=(16, 40+16H)

脚底可活动 = x∈[16, 16+16W], y∈[16, 16+16H]
Ground 铺贴 = cells cx∈[0,W+2), cy∈[0,H+2)
出生点     = (16+8W, 16+8H)
Camera limit = left 0 / top 0 / right 16(W+2) / bottom 16(H+2)
```

### 四种尺寸无头实测（脚本 /tmp/measure_one.gd：按公式摆墙→CharacterBody2D 四方向推 500 帧→读坐标）
```
20x10 → x[16,336] y[16,176]  1.00×0.89 屏
30x20 → x[16,496] y[16,336]  1.50×1.78 屏
40x26 → x[16,656] y[16,432]  2.00×2.31 屏  ← 推荐
48x32 → x[16,784] y[16,528]  2.40×2.84 屏
```
实测值与几何期望**误差 0**。

### 40×26 具体数字
```
FenceTop    (336, 0)   684×16
FenceBottom (336, 440) 684×16
FenceLeft   (2, 220)   16×456
FenceRight  (670, 220) 16×456
Player      (336, 224)
Ground      42×28 格
Camera limit 0 / 0 / 672 / 448
```

### 顺带发现的三个问题
1. **TileSet `source[1]` 是坏的**：32px 森林贴图但 `texture_region_size=16×16` → 每棵树被切成 4 块碎砖
   （渲染证据 `/tmp/forest16.png`）。修法 A：删掉 source[1]，Decor 先用主图集里的灌木/小树/木栅栏；
   修法 B：单独建 32px TileSet。
2. **`Decor` 在 `Entities` 外面 → 永远不会与玩家排序**。`renderer_canvas_cull.cpp:110-165`
   的 `_collect_ysort_children` 只收直接子节点。修法：把 Decor 挪进 Entities。
   （彻底方案：一棵树一个节点，后续 M2a 再定。）
3. **`Ground`/`Soil` 不需要 `y_sort_enabled`**，用 z_index 压低就够。

详见 `docs/FARM_SIZE.md`。

---

## 2026-11-09 · 40×26 改造复验（用户改完后）

### 验收结果
✅ 墙 4 个位置尺寸全对（336,0/336,440/2,220/670,220）
✅ 玩家脚底可活动 x[16,656] y[16,432] = **精确 40×26 格**
✅ 出生点 (336,224) 居中
✅ Camera limit 0/0/672/448，smoothing=false，anchor=DRAG_CENTER
✅ 夹紧范围正确：镜头 x∈[160,512]、y∈[90,358]
✅ Decor 已挪进 Entities，Entities.y_sort=true

### ❌ 待修 1：Ground 少 1 行 → 底部露 16px 黑边
Ground 实际 1134 格 = cx[0..41] cy[0..26]（27 行），应为 42×28。
Ground 覆盖 world y[0,432]，但 limit_bottom=448 → 视野 y[432,448] 没地面。
真实渲染截图证实（/tmp/shot_bottomright.png，黑条上沿屏幕 y=656 → 世界 y=432）。
**修法 A（推荐）**：Ground 补 1 行到 cy=27 —— 这行正是 FenceBottom 所在，
将来摆可见木栅栏就用它。修法 B：limit_bottom 改 432。

### ❌ 待修 2：Decor.z_index = -1 压制 Y 排序（硬 bug）
**z_index 优先级高于 Y 排序**，z 层级低的整批先画。
源码：renderer_canvas_cull.cpp `_collect_ysort_children` 设 `ysort_parent_abs_z_index=p_z`，
`_cull_canvas_item` 里 `p_z = CLAMP(p_z + ci->z_index)` → 分桶用「父绝对z + 子z_index」。
renderer_canvas_cull.h:117 `ItemYSort` 只比 Y 和 ysort_index，**z 完全不参与 Y 比较**。
tile_map_layer.cpp:362 tile 内部 CanvasItem 的 z = 层 z + TileData.z_index(0)。
→ Decor.z_index=-1 ⇒ 所有 tile 在 z 层级 -1，Player 在 0 ⇒ **玩家永远在树前面**。

真实渲染 + 像素采样实测（真实 TileMapLayer，自建 16×16 红 tileset，tile Y=80 > 玩家 Y=70）：
```
Decor.z_index = -1 → 重叠区 = (0,0,1) 蓝色(玩家)在上面 ⇒ z 压制 Y 排序
Decor.z_index =  0 → 重叠区 = (1,0,0) 红色(tile)在上面 ⇒ Y 排序生效
```
**修法：Decor.z_index 改成 0。** Ground/Soil 在 Entities 外面，靠 Main 树序天然在前，不需要负 z。

### ❌ 待修 3：TileSet source[1] 还是坏的
```
source[0] 1740 tiles region 16×16 贴图 1024×1024 ✅
source[1]   48 tiles region 16×16 贴图  320×576  ❌ 32px 树被切成 4 块碎砖
```
Decor 目前 0 格所以看不出来，铺树前必须修（删掉 or 单独建 32px TileSet）。

### ℹ️ 附带：树 tile 要设 TileData.y_sort_origin
tile_map_layer.cpp:552 `canvas_items_position.y = map_to_local(coords).y + tile_y_sort_origin + y_sort_origin`
默认 y_sort_origin=0 → 按**格顶**排序，不是树脚。树要设成树高（16px→16，32px→32）。

### 🛠 新学到的验证手法：真实渲染 + 像素采样
之前只能无头读属性，看不见像素。现在发现可以用真实渲染直接取证据：
```bash
cd /Users/orange/my/godot/farm
/Applications/Godot.app/Contents/MacOS/Godot --path . --script /tmp/xxx.gd > /tmp/out.txt 2>&1 &
sleep 25; cat /tmp/out.txt; pkill -f "xxx.gd"
```
截图里 `await RenderingServer.frame_post_draw` → `get_root().get_texture().get_image()` → `save_png()`。
**坐标换算：窗口 1280×720 / 视口 320×180 = ×4，世界→屏幕 = (wx*4, wy*4)。**
（第一次采样就采错了，因为忘了 ×4 → 采到纯背景灰。）

详见 `docs/FARM_SIZE_REVIEW.md`。

---

## 2026-11-09 · 三处修复复验（全部通过）

### ✅ 修 1：Ground 补 1 行
Ground 现在 **1176 格 = cx[0..41] × cy[0..27] = 42×28**，覆盖 world x[0..672] y[0..448] ✅
真实渲染像素采样：屏幕 y=640/656/700/719 全是草地色 (95,193,76)，**黑边消失** ✅

### ✅ 修 2：Decor.z_index = 0
`Decor.z_index = 0`（tscn 里 z_index 行已删）→ Y 排序恢复生效 ✅

### ✅ 修 3：source[1] 已删
tscn 现在只剩 `source[0]`（1740 tiles, region 16×16, 贴图 1024×1024），
32px 森林贴图的 ext_resource 也一并移除了（选了修法 A）。

### 🔬 新增实测：y_sort_origin 对遮挡的影响（真实场景 + 真实图集）
用主图集 **c30 r1 的绿色灌木**（占满 1 格，world y[160,176]）放在 Decor 的 (10,10)，
玩家脚底放 Y=170（身体 y[157,173]，与灌木明显重叠），真实渲染裁剪放大：

| y_sort_origin | 灌木排序 Y | 结果 | 截图 |
|---|---|---|---|
| 0（默认） | 160 < 玩家 170 | **玩家在前**，灌木挡不住人 | /tmp/yt_origin0.png |
| 16（= 格高） | 176 > 玩家 170 | **灌木在前**，正确遮挡 | /tmp/yt_origin16.png |

**两个结论**：
1. Decor 现在真的参与 Y 排序了（z_index=0 生效，两图前后关系不同）
2. **树的 tile 必须把 `Y Sort Origin` 设成格高**，否则排序点在格顶、树永远挡不住人

原理：`tile_map_layer.cpp:552`
`canvas_items_position.y = map_to_local(coords).y + tile_y_sort_origin + layer.y_sort_origin`
默认 y_sort_origin=0 → 按格顶排序。设成 16 → 排序点落到格底（树脚），
和玩家的脚底 Y 同一坐标系，比较才有意义。

### 📌 遗留小事项
`Decor` 和 `Soil` 两个 TileMapLayer 目前**都没有挂 tile_set**（空层）。
铺装饰 / 铺耕地前要先给它们指定 TileSet 资源。

### 🛠 截图坐标换算（这次踩了两次坑，记住）
窗口 1280×720 / 视口 320×180 = **×4**，但屏幕坐标不是 `world*4`：
```
screen = (world - 视野左上角) * 4
视野左上角 = 相机屏幕中心 - 视口/2
```
第一次忘了减视口左上角，第二次裁剪框超出了窗口高度(720)取到黑边。

---

## 2026-11-09 · 角色素材评估（两个包）

### 包 A：Sunnyside_World_ASSET_PACK_V2.1（用户已放入）
**锄头问题的答案：包里没有锄头（hoe），只有铲子（shovel）。**
- `UI/shovel.png` 14×14 = 铲子图标（灰铲头 + 棕木柄）
- `Characters/Human/DIG/tools_dig_strip13.png` 里手上拿的就是**同一把铲子**
  （f0-f6 举起，f7-f12 下挥，f12 铲头朝下 + 棕色土屑飞溅）
- 附带可用：`UI/water.png`（洒水壶）、`UI/plant.png`（幼苗/种子）、
  `Elements/Crops/soil_00/01/03/04.png`（16×12 耕地四态）、
  11 种作物 × 6 个生长阶段、`seeds_generic.png`、`wood.png`、`rock.png`
- **DIG base 身体底边全程 = 39**，与 IDLE(39)/WALK(39)/WATERING(39) 完全一致
  → 换动画时角色不会跳，AnimatedSprite2D position(0,-5) 可直接复用 ✅
- 两个 aseprite 源文件**像素数据加密**（frame chunk 尺寸不合理），
  但**图层名/帧标签是明文可读的**：
  - v0.07.aseprite：bg/guide/base/6种发型/tools/20个动作标签 + 额外图层
    (shadow/water/impact/hand back/hand front/arm/bald head/afro hair/red hair…)
  - condensed 版：base/6种发型/tools + 20个动作标签（无加密标记 0x189b）
  → 可据此写切图脚本，但**不能提取新内容/加画**

### 包 B：SuperRetroWorld_CharacterPack_Full（用户新放入）
**结论：能用，但不建议整体换。**
- 32 个角色，RPG Maker 标准 **3×4 布局**，帧 16×20（48×80 = 3列×4行）
  - row0: 待机 下 / 左 / 右
  - row1: 走 下 / 左 / 右
  - row2: 走 下 / 左 / 右
  - row3: **待机 上(背面)** / 走上 / 走上
  - 另有 32×32 版本（配 ARPG 素材包用）
- 附属：宝箱（8配色×多状态）、篝火动画、心形血条、宝石/药水图标
- 许可：可商用可改，需署名 @gif_not_jif / @Noiracide / @DessRomaric
- **4 个硬伤**：
  1. **只有 idle+walk，没有工具动画** → 锄地没有挥铲动作（M2a 表现会退化）
  2. **画风不匹配**：DQ/FF Q版大头粗描边 vs 星露谷现代像素；且本包无配套地面 tileset
  3. **角色 16×20 比 16px 格高 4px** → 脚底对位/碰撞盒/相机跟随要重算
  4. **不能再用 flip_h**（左/右是独立帧），现有 facing/flip_h 逻辑要整个换

### 🔑 关键发现：Sunnyside 角色本来就是**正面朝向镜头**的
`base_idle_strip9.png` 放大可见两只眼睛 + 粉色腮红 + 双手都在身前 → **不是侧视图**。
所以"朝上没背面图"在 Sunnyside 素材上**没想象中严重**：
大量俯视游戏角色背对镜头时也仍是正面脸，玩家不会觉得违和。

### 用户已决定
移动方案：**改 4 方向移动 + 4 向朝向**（星露谷原味），facing 改成 Vector2i。
M2a 工具范围：等角色调整完再定。

---

## 2026-11-09 · M2a 方案确定 + 资源现状

### 资源现状（删包后实测）
- 删掉的两份包都是**副本**，项目本体没受影响：
  - `assets/Characters/Human/`（**含 DIG 动画全部 8 层**）✅
  - `assets/Tileset/spr_tileset_sunnysideworld_16px.png` ✅
  - 场景无头加载跑通，40×26 / 墙 / Camera limit / Ground 42×28 全部数值不变 ✅
- **随包一起没了的**（只在包里有，项目里没副本）：
  - `Elements/Crops/soil_00/01/03/04.png` ← 耕地贴图 4 态（16×12）
  - `UI/shovel.png` / `UI/water.png` / `UI/plant.png` ← 工具图标
  - 11 种作物 × 6 生长阶段、`Elements/Animals|Plants|Other|VFX`、全部 UI 图标
- **耕地贴图替代方案**：主图集里就有现成棕色泥土 tile
  **c19r7 / c20r7 / c19r8 / c20r8**（16×16，四张随机拼成田地）✅
- 用户会另外找铲子素材

### 🔑 查证更正：星露谷是「8 向移动 + 4 向动画」，不是 4 向移动
出处：CSDN《从零开始的星露谷-用Unity还原星露谷物语:移动,界面篇》
「星露谷中人物的移动有八个方向：上下左右，左上，左下，右上右下，实际上展示的动画只有上下左右四个」
+ UQcsse3200 Wiki「The player is able to both walk and run in any direction,
although the core animation set only features 4 directional animation for simplicity.」
→ **移动代码 `Input.get_vector` 一行不用改**，只把 `facing` 从 int(±1) 改成 Vector2i(4 向)

### 关键几何结论（角色所在格）
角色原点在**脚底**，身体向上延伸 → 身体所在格 = 脚底所在格
- `floor(y/16)` 在脚底压边界时**会算错一格**（176 → 11，应该是 10）
- 正确：`cell = Vector2i(floor(x/16), floor((y-1)/16))`
- X 轴不减 1：角色水平居中，Y 轴单边（下沿在脚底），不对称是几何事实

### 铲子动作接入方式（关键决策）
**不要**双 AnimatedSprite2D 同步（经典 bug 源）。
**要**把 `base_dig_strip13.png` + `tools_dig_strip13.png` alpha 预烘焙成一条 1248×64 strip，
当普通动画用 → SpriteFrames 加一个 "dig" 动画，结构零改动。
（已实测：DIG 身体底边全程=39，与 IDLE/WALK/WATERING 一致 → 切动画不跳，position(0,-5) 可复用）

详见 `docs/M2A_PLAN.md`。

---

## 2026-11-09 · M2a 前三步验收（facing / 数据层 / 输入）

### ✅ 第1步：facing 改 4 向 —— 修复后验收全绿
无头实测（`/tmp/verify_step123.gd`）：
```
按住左 → (-1, 0) ✅   松开左 → (-1, 0) 保持 ✅
按住上 → (0, -1) ✅   松开上 → (0, -1) 保持 ✅
按住右 → (1, 0) ✅    松开右 → (1, 0) 保持 ✅
flip_h = false（朝右）✅
```
**中途发现并已修的 bug**：松开所有键后 `direction == Vector2.ZERO`，
若不早退会掉进 else 兜底分支 → `absf(0)>absf(0)` 为 false → facing 被强制 DOWN。
后果：站着不动时朝向恒为朝下 → 锄地目标格永远是"脚下往下一格"，"面朝哪锄哪"直接失效。
修法：整块朝向判定包一层 `if direction != Vector2.ZERO:`。

### ❌ 第2步：Autoload 注册失败（必须修）
```
ERROR: Unrecognized UID: "uid://v2mea8ac5y10".
ERROR: Resource file not found: res:// (expected type: unknown)
ERROR: Failed to instantiate an autoload, can't load from path: .
```
`project.godot` 里写的是 `FarmData="*uid://v2mea8ac5y10"`，
但 `.godot/uid_cache.bin` 里**没有这个 UID**（只注册了 `res://scripts/data/soil_data.gd`，
因为它有 `class_name` 会被全局扫描；`farm_data.gd` 是普通 Node 脚本，没被分配 UID）。
→ Autoload 加载失败，`/root/FarmData` 根本不存在（实测 `存在 = false`）。
**修法**：改成路径形式 `FarmData="*res://scripts/data/farm_data.gd"`（路径永远有效），
或在 Project Settings → Autoload 里删掉再加一次。

### ✅ 数据层内容正确
- `soil_data.gd`：State 枚举 + watered/watered_days/crop_id/growth_days 全对
- `farm_data.gd`：typed Dictionary[Vector2i, SoilData] + get_tile/is_tilled/till 全对

### ✅ use_tool 已绑空格
`physical_keycode: 32` = Space，`InputMap.has_action("use_tool") = true`

### 📌 新坑：Autoload 的 uid:// 引用会失效
Godot 4.4+ 的编辑器有时会把 Autoload 写成 `*uid://xxx`，
但如果那个脚本没被 UID 扫描过（比如没有 `class_name`），这个 UID 就不存在 → 加载失败。
**Autoload 一律用 `*res://` 路径形式更保险。**

---

## 📌 2026-11-09 第4步：三层角色（Body/Hair/Tool）实施 + 复验

### ✅ 实施结果（用户完成，我复验通过）
```
Player (CharacterBody2D)
├── CollisionShape2D  pos=(0,-4)
├── BodySprite   (AnimatedSprite2D) pos=(0,-5)   ← 用户把 AnimatedSprite2D 改名成 BodySprite
├── HairSprite   (AnimatedSprite2D) pos=(0,-5)
├── ToolSprite   (AnimatedSprite2D) pos=(0,-5)
└── Camera2D
```
`player.gd` 用 `$BodySprite` / `$HairSprite` / `$ToolSprite`，三层 pos 完全一致。

### 🔴 图层语义实测（LimeZu Human 每动作目录）
| 层 | 文件 | 实测内容 |
|---|---|---|
| 身体 | `base_<动作>_stripN.png` | 头+躯干+腿，**无头发、无手臂** |
| 头发 | `<发型>_hair_<动作>_stripN.png` | 6 种发型各一层 |
| 手臂/工具 | `tools_<动作>_stripN.png` | **idle/walk/run=空手手臂；dig=手臂+铲子** |

**"tools 层其实是手臂层"的证据**：idle 的 tools 层像素落在 base 层**本身全透明**的
`(43,34)`，填肤色 `(232,173,125)` / 深色 `(23,20,36)` / 红 `(165,31,51)` = 一只没画在
body 层里的手。**少这一层角色就缺手臂** → 三层必须同时常显。

**每个动作目录自带 tools 层** → 工具动画全套齐备，**用户不需要自己找铲子动画**：
`DIG`=铲子 `AXE`=斧头 `MINING`=镐 `WATERING`=洒水壶 `HAMMERING`=锤子 `ATTACK`=剑。

### 🔴 推翻旧方案：不需要"每帧同步 frame"
旧 M2A_PLAN 建议"每帧 `hair.frame = animation.frame`" → **错的**。
Godot `_process` 顺序是**父先子后**，`Player._process` 读到的 `animation.frame` 是子节点
*上一帧*的值 → 头发/手臂慢一帧。
**正确**：同名动画 + 相同 speed = 自动同步（`play()` 同名时直接 return，不重置帧号）。
实测真实渲染逐帧打印：body/hair/tool 的 frame 始终相等。

### 🔴 发现的 bug（待用户修）：Body 的 `dig` 参数不对
```
dig        帧数=13  speed=5.0   loop=true    ← ❌ 应为 speed=20, loop=false
hair_dig   帧数=13  speed=20.0  loop=false   ✓
tool_dig   帧数=13  speed=20.0  loop=false   ✓
```
后果：① 身体慢动作、头发+手臂高速 → 三层脱节；② `loop=true` 时
`animation_finished` **永不发出** → 第5步锄地状态机永久卡在 `_busy=true`。
（新建动画时 Godot 默认 speed=5 + loop 开，忘了改。）

### 📌 新坑：用 `pause()` + 手动 `frame=N` 截图会拍到"缺头发"的假象
Godot 4.7 的 AnimatedSprite2D 在暂停态手动改 frame **不刷新贴图缓存** → 头发层渲染成空。
但**真实运行（自然播放）完全正常**。以后验证动画一律用"自然播放"拍，别用 pause+设帧。

### 📌 其它复验数据
- Soil 已挂上 `TileSet_o5qli` ✅（用户做了）
- Decor 仍为空（`tile_set = null`, `used_cells = 0`）—— 用户似已清空待重做
- 12 个动画的 region / 内容**逐帧核对全部正确**（无导入错误）

---

## 📌 2026-11-09 修正 + GameMaker 工程勘察（详见 docs/GAMEMAKER_ASSETS.md）

### 🔴 修正上一条结论：整包回来了，"丢失的素材"全部恢复
上一条记录里写的"耕地贴图 soil_00/01/03/04、11 种作物×6 阶段、UI 图标已随包删除且无副本"
**作废** —— 用户把整个 `Sunnyside_World_ASSET_PACK_V2.1/` 放回了项目，现已全部可用。

### ✅ 第4步复验：dig 已修好
```
dig      帧数=13  speed=20.0  loop=false   ✅
hair_dig 帧数=13  speed=20.0  loop=false   ✅
tool_dig 帧数=13  speed=20.0  loop=false   ✅
```

### 🔬 GameMaker 工程 vs aseprite 加密 —— 绕过成功，但没绕出新像素
- `Sunnyside_World_Gamemaker/sprites/` 共 **475 个 sprite**，每个含**明文 `.yy`**（JSON-like）
  + **每帧独立明文 PNG**（UUID 命名）+ `layers/<uuid>/`
- `.yy` 里能读到：`frames` 顺序、`sequence.tracks[].keyframes`（真实帧序）、
  `playbackSpeed`（作者原始速度）、`origin`/`xorigin`/`yorigin`、`bbox_*`
- **GM 帧 vs 导出 strip 差异 = 0 像素** → 同一批数据
- `layers/<uuid>/` 每帧**只有一个 png** → GameMaker 里已是合并单层，没有更多图层
- ❌ **仍然没有背面/侧面**：角色 sprite 只有 20 动作 × 3 层，全正面

### ★★★ 决定性验证：三层方案 = 作者原方案
`Spr_dig468`（作者手工合成的完整角色）与我们的 `base + bowlhair + tools` 三层合成：
**帧0 差异 0 像素**，其余发型差异 105~166 → 我们的做法和原作者**完全一致**，
`bowlhair` 确认为作者默认发型。

### ★ 新挖到的资产（Assets 目录里之前没注意到的）
- `soil_00/01/03/04`（16×12 耕地四态）→ **第5步直接用**，替代主图集泥土 tile
- `greenbar_00~06`（15×7，7 段）→ M2b 体力条；另有 redbar(7段)/bluebar(6段)
- `expression_alerted/attack/chat/confused/love/stress/working`（8~10px 表情气泡）
- `dust_land_strip6` / `dust_run_strip8` / `dust_land_sidepuff_strip5`（多帧尘土特效）
- `spr_deco_charactershadow`（16×16 角色阴影）、`spr_deco_tree_01`(32×34)、`_02`(28×43)
- 动物（sheep/chicken/cow/pig/duck/fish）、矿物（ore_stone/coal/gold/silver/bluestone）、
  家具装饰（chair/bed/chest/barrel/campfire/well…）、9-slice 面板 9 色

### 📌 作者的播放速度参考
`base_dig_strip13` playbackSpeed=**12.0**（13帧≈1.08s）vs 我们用的 20（≈0.65s）。
星露谷锄地约 0.5~0.7s → 20 更接近星露谷，保持当前值。

### ⚠️ 待用户执行：给整包加 .gdignore
几千张 PNG 已生成 .import，拖慢编辑器扫描。
`touch assets/Sunnyside_World_ASSET_PACK_V2.1/.gdignore` + 需要的图单独复制到 `assets/game/`。

### ✅ 已建立 README.md 与素材致谢
- `README.md`（项目根）：项目介绍 + **完整素材致谢与授权摘要**（作者 Daniel Diggle / itch.io 链接 /
  LICENCE V1 中英要点）+ 设计参数 + 目录结构 + 运行方式 + 8 条关键技术约定 + 当前进度 + docs 索引
- `assets/Sunnyside_World_ASSET_PACK_V2.1/CREDITS.md`：
  保证素材文件夹被单独拷走时 itch.io 链接不丢失（符合作者条款中"再分发需附链接"的要求）
- **查证到的官方信息**：
  - 作者 **Daniel Diggle**，官网 http://danieldiggle.com/sunnysideworld.php ，Twitter @DanielDiggle
  - 授权 **LICENCE V1**：免费+商业可用、任意修改、**署名非必需但受欢迎**、
    教程/教学再分发需附 itch.io 链接、**禁止转售/NFT**、**禁止用于训练 AI**
  - itch.io 下载页另有 **`Sunnyside World - Human - 4,6,8 way movement - BETA`（404 kB）**
    → **四向/多方向移动素材作者官方已提供**，不需要自己扩展
  - 作者原文明说 "Sprite assets are for L/R movement, similar to Forager and Atomicrops!"
    → 正面 + flip_h 的做法**符合作者设计意图**
  - 作者建议 7 种发型用 **palette swapping** 换色 → Godot 里可用 modulate / shader 实现无限变体

---

## 📌 2026-11-09 重大突破：aseprite 混淆绕过 + 四向移动素材提取（详见 docs/ASEPRITE_EXTRACTION.md）

### ⚠️ 修正此前结论
之前多次说"源 aseprite 像素数据加密" —— **表述不准确**。
准确说法：**chunk 元数据被混淆，像素数据是明文 zlib，可完整提取**。

### ✅ 混淆结构（实测）
| 部位 | 混淆? |
|---|---|
| 文件头 / 顶层 frame chunk | ❌ 未混淆 |
| frame 内部子 chunk 的 size/type | ✅ **被混淆**（size 全是 0xN0000，type 全 0x0000） |
| cel 的 layer index / x / y / opacity / w / h | ❌ 未混淆 |
| **像素数据** | ❌ **未加密**（1909 个 zlib 流全部可解压） |

### ✅ 绕过方法
1. 全文件扫 zlib 头（`78 01/9c/da/5e`）→ 1909 个流
2. **从流尾部反推 cel 头**：width 在 `off-4`、height 在 `off-2`（1909/1909 校验通过）
3. cel 头相对 zlib 起点：layer index `-20` / x `-18` / y `-16` / opacity `-14` /
   celtype `-13` / zindex `-11` / reserved `-9..-4` / w `-4` / h `-2`
4. 顶层 frame chunk 未混淆 → 按边界分帧；cel 按 (x,y) 贴到 96×64 画布叠加
5. **踩坑**：x/y 首次读成 `-20/-18` 全错位，靠 GameMaker 里 base_idle f0 的 bbox(43,23)
   反查原始字节才修正

### 🎁 收获：作者官方尚未导出的四向移动动画
`assets/sunnyside_world_chatacter_anim_human_v1.0.aseprite`（**项目里本来就有**，
用户以为"不是 zip 就没用"）= itch.io 那个 404 kB 的 BETA 包。

**frame tag 明文**：`idle-s / idle-se / idle-ne / idle-n`、`walk-s/se/ne/n`、`run-s/se/ne/n`
（S=南 SE=东南 NE=东北 N=北）—— **这就是四向移动**。
另有图层面板 **`tools rear`**（背向手臂层）。

**像素证据**（docs/images/frames_27_92.png）：
帧 27-43 正面可见眼睛腮红 → 44-59 侧转 → 60-76 正面 → **77-92 全黑无脸 = 背面**

**图层结构**（15 层）：base(layer4,293帧) / tools(layer8,279帧) /
6 发型(layer9-13,各215帧) / **tools rear(layer14,285帧)** / 特效(16,17,18)

### 📦 产物
`assets/Characters/Human_v1/frames/frame_000..309.png`（310 张完整合成帧，可靠）
+ 各图层 strip + `all310_grid.png` 全景网格
脚本 `/tmp/extract_aseprite.py` 可复用

### ⚠️ 已知限制
- **单层 strip 不完整**（base 层一帧多个 cel，脚本只留最后一个）→ **合成帧才完整**
- layer offset 未解（发型层与 GameMaker 哈希对不上，layer12 匹配 196/215）
- frame tag → 帧号映射未打通（tag 结构已确认在 offset 296 起）
- 四向只有**一种发型**完成（作者原话）

---

## 2026-11-09 · 四向素材盘点（任务 A）

### 🔍 推翻了上一轮的结论

上一轮记的「27-43 正面 / 44-59 侧转 / 60-76 正面 / 77-92 背面」**是错的**。
真实结构完全不同。

**核心发现：310 帧混装了两个不同发型的角色版本。**

| | bowlhair（橙 `[224,115,23]`） | bob（深棕 `[117,61,58]`） |
|---|---|---|
| 正面走 | ✗ | 27–42 |
| 背面走 | ✗ | 47–58 |
| 侧身走 | **99–106** | ✗ |
| 转身 | **0–15** | ✗ |
| 正面跑 | **159–176** | 60–75 |
| 背面跑 | ✗ | 80–91 |

两套**互补** → 四向移动可以纯用原生 bowlhair 拼出，一个像素都不用改。

### 📐 判定方法（都可复验）

1. **头发色分类**：按头部主色像素统计，`[224,115,23]`=bowlhair，`[117,61,58]`/`[62,38,48]`=bob
2. **动作性质**：下半身（脚/腿）相邻帧差异均值
   走 ≈0.20–0.45，跑 >0.5，静 <0.1
3. **朝向**：肤色像素数（正面 27–32，背面 3–6）+ 头部 alpha 轮廓 IoU
4. **发型是否相同**：头部轮廓 IoU（bowlhair↔bob 0.72–0.79；同发型 0.82–0.94）

### 🐛 踩过的坑

- **肤色宽阈值把衣服算成脸**：衣服主色 `[192,203,220]` 满足 `R>190 且 G>140 且 B>110`。
  正确肤色是 `[233,173,125]`，必须用精确色值或 tol≤26。
- **对称性计算被透明像素稀释**：`top_area == mirror` 会把大片 alpha=0 算作"对称"，
  必须只在非透明像素上比较，否则侧身帧会被误判成对称。
- **v0.07 帧序对不上 v1.0**：用 v0.07 分层素材反查 v1.0 帧号，最高匹配分只有 0.69，
  说明 v1.0 是重绘的新身体，**无法用旧素材推 tag**。

### 🧩 layer offset 解出部分

`layer_14`（tools rear，285 帧）用**单调动态规划对齐**解出，276/285 完美匹配，总分 281.4：
strip 第 i 帧 = 该层有 cel 的 frame index 升序第 i 个（提取脚本第 89 行的逻辑）。
缺口：16 / 25-26 / 59 / 92-98 / 131 / 137 / 139 / 141-149 / 179-180。
`layer_8`(tools) 与 `layer_4`(base) 因被覆盖严重，分数不足，未能确证。

### 📦 产物

`assets/Characters/Human_v1/atlas/`（96×64 一帧横排）：
`walk_side`(8) / `walk_back_native`(8) / `turn`(16) / `run_front_native`(18)
+ 换色备选 `walk_front_swap`(16) / `walk_back_swap`(12) / `run_front_swap`(16) / `run_back_swap`(12)

换色映射（palette swap，作者推荐做法）：
`[117,61,58]→[224,115,23]`、`[117,60,57]→[225,116,24]`、`[117,60,58]→[225,116,23]`、
`[62,38,48]→[149,70,39]`，描边与皮肤不动。

文档：`docs/FOUR_DIRECTION_ASSETS.md`
图：`docs/images/frame_index_310.png`、`docs/images/swap_compare.png`

### ✅ 验证

- Godot headless 加载 8 个 atlas：尺寸/帧数全部正确
- **像素级比对：50 帧 × 6144 像素，差异 0**（Godot 导入无 alpha 边缘污染）

### ⚠️ 仍未解决

- aseprite 源文件已删 → **frame tag 官方语义无法还原**，上表全部靠像素特征反推 + 目视复核
- bowlhair 缺正面走（向下走继续用 v0.07 分层素材）
- bowlhair 缺背面走（暂用 turn 动画的背面段 8-15，共 8 帧）
- 换色版轮廓仍是 bob 造型，与 bowlhair 不同款，混用违和

---

## 2026-11-09 · M2a 第 5 步（锄地）前置准备

### 🔍 土壤贴图四态语义（实测确认）

`soil_00/01/03/04` 均 16×12：
- soil_00 底色 `[228,166,114]` 亮橙棕 = **干土（已耕未浇水）**
- soil_01 底色 `[194,133,105]` 暗橙棕 = 湿土（= soil_00 暗化，差异 62 像素，中心区 x3-12 y1-8）
- soil_03 = 干土 + 小深坑（播种）
- soil_04 = 干土 + 大深坑（作物）
- **soil_02 缺失**（原资源包就没有）

### 🔍 格子对齐规则（真实渲染实测，非推算）

/tmp/check_align.gd 真实渲染：碰撞盒 12×8 @ (0,-4)，Player (336,224)
- 青框 = 格 (21,13) = floor((y-4)/16) → 碰撞盒完整落入，脚线 y=224 压其下边界
- 绿框 = 格 (21,14) = floor(y/16) → 角色正前方那一格

**规则：角色格 = (floor(x/16), floor((y-4)/16))；目标格 = 角色格 + facing**
旧规则 floor((y-1)/16) 在初始位置结果相同，但物理意义不如碰撞盒中心明确。

### 🧩 副产品

- `assets/game/soil/soil_tiles.png`（64×16，4 个 16×16 tile，垂直居中补 2px 透明）
- `assets/game/fx/dust_land.png`（144×9，6 帧）
  **帧序是按面积升序推测的**（原文件序面积 96,5,64,44,80,23 无规律）；
  GameMaker 工程已删，真实顺序无法恢复，用户可在 SpriteFrames 面板拖动调整
- `assets/game/fx/dust_land_strip6/` 的 6 个文件经目视确认是 **strip 帧序列**，
  不是 6 个独立精灵（更正上一轮判断）
- 尘土用 AnimatedSprite2D 的 `hframes=6` 即可，**不需要建 SpriteFrames 资源**

### 📦 文档

`docs/M2A_STEP5_HOE.md` —— 第 5 步完整施工指南（素材准备 + 格子规则 + 代码 + 验收清单）
