# 项目设置配置手册（Godot 4.7.2）

> 说明每项设置的原因、修改后的影响，以及在编辑器中的对应位置。
> 本文所有设置键名都从 Godot 4.7.2 源码 `core/config/project_settings.cpp` 核对过。
>
> **最后同步：2026-11-10** —— 视口改为 **640×360**，窗口 override 为 **1920×1080**（3×）。
> 本文写于 M0，§一 的帧校验数据早于四向改造；当前设置值以 `project.godot` 为准。

---

## 一、切图成果验收（已通过 ✓）

对 `scenes/player.tscn` 逐帧校验了 25 个 AtlasTexture：

```
=== idle: 9帧 loop=1 speed=9.0
  OK 0: base_idle_strip9.png       region=(0,0,96,64)
  OK 1: base_idle_strip9.png       region=(96,0,96,64)
  OK 2: base_idle_strip9.png       region=(192,0,96,64)
  OK 3: base_idle_strip9.png       region=(288,0,96,64)
  ...
  OK 8: base_idle_strip9.png       region=(768,0,96,64)

=== run: 8帧 loop=1 speed=5.0     ✓ 全部正确
=== walk: 8帧 loop=1 speed=5.0     ✓ 全部正确

>>> 全部帧 region 正确且顺序无误
```

**结论**：每帧 region 都是 `96×64`，第 i 帧的 x 正好是 `i × 96`，无一错位，顺序也对。
**Godot 里生成的是 AtlasTexture（指向原图 + 一个矩形区域），不是把图切成 25 个小文件** —— 这正是 Godot 的正确做法，显存占用也最优。

---

## 二、必须改的项目设置（4 项）

> 本节记录 M0 时补的 4 项设置；现在 `project.godot` 已包含全部正确值。
> 下面保留每项的原因说明，改动前先看影响。

### 设置 1 · 基准分辨率（最重要）

`项目设置 → 显示 → 窗口 → 尺寸`

| 键 | 值 | 说明 |
|---|---|---|
| `display/window/size/viewport_width` | **640** | 虚拟画布宽度 |
| `display/window/size/viewport_height` | **360** | 虚拟画布高度 |

**为什么是 640×360？**

角色可见尺寸约 **13×18 像素**（身体 11×16 + 头发），地块 16×16。
- 2560×1440 窗口 → 4×，角色约 72 px 高（参考图的 4× 角色约 68 px）
- 1920×1080 窗口 → 3×，角色约 54 px 高
- 320×180 在 2560×1440 下是 8×、角色 144 px，实测画面过近（2026-11-10 改成 640×360）

代价：一次看到 **40×22.5 格**；农场 80×45 格，镜头余量 **640×360 px**（正好一屏，见 `FARM_SIZE.md`）。

### 设置 2 · 拉伸模式与宽高比

`项目设置 → 显示 → 窗口 → 拉伸`

| 键 | 当前值 | 改成 | 说明 |
|---|---|---|---|
| `display/window/stretch/mode` | `canvas_items` | **保持 `canvas_items`** | ✓ 已符合 |
| `display/window/stretch/aspect` | 未设置（默认 `keep`） | **保持 `keep`** | ✓ 已符合 |
| `display/window/stretch/scale_mode` | `integer` | **保持 `integer`** | ✓ 已符合 |

#### `aspect` 为什么必须是 `keep`

`expand`（扩展）会让**视口尺寸跟着窗口变**，窗口拉多宽视口就多宽。这对像素游戏是灾难：

- 窗口拉宽 → 视口变成 1000×360 → 角色位置和 UI 布局全乱
- 玩家拖动窗口大小 → 游戏画面比例失控

`keep` 下**视口永远保持 640×360 的 16:9 比例**，窗口多出来的部分用黑边填充，游戏内坐标永远稳定。

> 本项目没有再显式写 `stretch/aspect`，因为 Godot 的默认值就是 `keep`。

#### ⚠️ `scale_mode` 为什么必须改成 `integer`

`fractional`（缺省）允许 **1.5 倍、2.7 倍**这种非整数缩放。
后果是：像素画被拉伸到非整数倍 → 每个像素变成 1.5 个像素宽 → **画面糊、边缘抖动**。

`integer` 只允许 1×、2×、3×、4× 这样的整数倍 → **像素永远整齐对齐，不会糊**。

> 源码依据（`core/config/project_settings.cpp`）：
> ```cpp
> GLOBAL_DEF_BASIC(PropertyInfo(Variant::STRING, "display/window/stretch/scale_mode",
>              PROPERTY_HINT_ENUM, "fractional,integer"), "fractional");
> ```
> 只有这两个值，没有第三个。

### 设置 3 · 纹理过滤（像素风的命门）

`项目设置 → 渲染 → 纹理 → 画布纹理`

| 键 | 改成 |
|---|---|
| `rendering/textures/canvas_textures/default_texture_filter` | **0（Nearest）** |

**为什么**：Godot 默认是 `1`（Linear，线性插值），
会把 11×16 的小像素画**抹成一团模糊**。改成 Nearest（最近邻）后每个像素保持硬边。

> **注意**：Godot 4 里这个选项**只在项目设置里**，不在图片导入面板。
> （Godot 3 时代导入面板有 Filter 勾选框，Godot 4 移除了。）
>
> 如果改了还是糊 → 说明图片是**改设置之前导入的**，需要重新导入：
> 选中 PNG → Import 面板 → **Reimport**。

### 设置 4 · 2D 像素吸附

`项目设置 → 渲染 → 2D → 吸附`

| 键 | 值 |
|---|---|
| `rendering/2d/snap/snap_2d_transforms_to_pixel` | **true** |
| `rendering/2d/snap/snap_2d_vertices_to_pixel` | **true** |

**为什么**：不开启时，角色的位置可能是 100.5 这样的半像素，
渲染器会把它画在两个像素中间 → **移动时角色边缘闪烁抖动**。
开启后位置会被吸附到整数像素，彻底消除抖动。

---

## 三、渲染器（Renderer）：要不要换？

`项目设置 → 渲染 → 渲染器 → 渲染方法`

当前为 **`Forward Plus`**（来自 `config/features=PackedStringArray("4.7", "Forward Plus")`）。

| 渲染器 | 特点 | 本项目是否适用 |
|---|---|---|
| Forward+ | 功能最全，Vulkan | 能用，但对 2D 农场游戏**是浪费** |
| Mobile | 移动端优化 | 中等规模 2D 项目够用 |
| **Compatibility** | OpenGL，兼容性最好 | ✅ **2D 项目的稳妥选择** |

**处理方式**：**暂不更换**。

理由：
- Forward+ 在桌面 macOS 上运行本 2D 游戏**毫无性能问题**
- 换渲染器会改变部分 2D 效果（灯光、CanvasItem shader 的行为）
- 待需要**导出到手机/网页**时再更换 —— 此时 Compatibility 更合适

> 顺带一提：`project.godot` 里这行
> ```
> rendering_device/driver.windows="d3d12"
> ```
> 是 Godot 生成器模板留下的默认值，**只影响 Windows 导出**，macOS 开发环境不涉及该配置。

---

## 四、窗口在屏幕上显示多大？（可选但建议）

视口设成 640×360 后，如果没设窗口 override，**游戏窗口在屏幕上只有 640×360 像素**。

### 📍 具体在哪改

> ### ⚠️ 关键前提：这两个是「高级设置」，默认不显示！
>
> 项目设置窗口**右上角**有一个 **`Advanced Settings`** 勾选开关（在搜索框旁边）。
> **它默认是关闭的**，而：
>
> ```
> core/config/project_settings.h:
>   #define GLOBAL_DEF_BASIC(m_var, m_value)  ... basic=true   ← 基础设置，默认可见
>   #define GLOBAL_DEF(m_var, m_value)       ... basic=false  ← 高级设置，默认隐藏
> ```
>
> 实际归属（源码 `core/config/project_settings.cpp:1719-1741`）：
>
> | 设置 | 宏 | 默认可见？ |
> |---|---|---|
> | `display/window/size/viewport_width` | `GLOBAL_DEF_BASIC` | ✅ 可见 |
> | `display/window/size/viewport_height` | `GLOBAL_DEF_BASIC` | ✅ 可见 |
> | `display/window/size/window_width_override` | `GLOBAL_DEF` | ❌ **隐藏** |
> | `display/window/size/window_height_override` | `GLOBAL_DEF` | ❌ **隐藏** |
>
> 同理（源码 `scene/main/scene_tree.cpp:2140-2144`）：
>
> | 设置 | 宏 | 默认可见？ |
> |---|---|---|
> | `rendering/2d/snap/snap_2d_transforms_to_pixel` | `GLOBAL_DEF_BASIC` | ✅ 可见 |
> | `rendering/2d/snap/snap_2d_vertices_to_pixel` | `GLOBAL_DEF` | ❌ **隐藏** |
>
> **过滤逻辑**（源码 `editor/inspector/editor_inspector.cpp:135`）：
> ```cpp
> (p_filter.is_empty() && restrict_to_basic && !(p.usage & PROPERTY_USAGE_EDITOR_BASIC_SETTING))
> ```
> 注意 `p_filter.is_empty()` —— **一旦在搜索框中输入内容，
> 高级设置就会全部显示出来**（因为搜索时不再过滤）。
> 这也是「用搜索框找 override」能直接找到它的原因。
>
> ### 📍 操作步骤
>
> 1. 打开 `项目设置`
> 2. **右上角勾选 `Advanced Settings`** ← 关键
> 3. 左侧树选 **`显示`** → **`窗口`** → **`尺寸`**
> 4. 找到 **`Window Width Override`** = 2560、**`Window Height Override`** = 1440
>
> （或者：直接在顶部搜索框输入 `override`，搜索时高级设置会自动显示）

`项目设置` → 左侧选 **`显示`** → **`窗口`** → **`尺寸`**

该页面包含以下字段：

| 编辑器界面上的名字 | 对应配置键 | 当前值 |
|---|---|---|
| **Viewport Width** | `display/window/size/viewport_width` | 640 ✓ 已设 |
| **Viewport Height** | `display/window/size/viewport_height` | 360 ✓ 已设 |
| Window Width Override | `display/window/size/window_width_override` | **1920 ✓ 已设** |
| Window Height Override | `display/window/size/window_height_override` | **1080 ✓ 已设** |
| Mode | `display/window/size/mode` | Windowed ✓ |

> **注意**：这个选项**不在「拉伸」那一页**，在**「尺寸」那一页**。
> 两个页面长得有点像，很容易看错地方。

### 为什么窗口必须是视口的整数倍

Godot 编辑器运行游戏时的逻辑（源码 `editor/run/editor_run.cpp:280`）：
```cpp
desired_size.x = GET_CONFIG_WITH_OVERRIDE("display", "window/size/window_width_override");
desired_size.y = GET_CONFIG_WITH_OVERRIDE("display", "window/size/window_height_override");
if (desired_size.x > 0 && desired_size.y > 0) {
    placement.size = desired_size;   // 覆盖视口尺寸，作为窗口实际大小
}
```

配合 `scale_mode = integer`，Godot 会把 640×360 的视口**整数放大 3 倍**填进 1920×1080 的窗口。

```
1920 ÷ 640 = 3  ✓ 整数
1080 ÷ 360 = 3  ✓ 整数
```

**必须是整数倍**，否则 `integer` 模式失效，画面又会糊。

> 想要 2560×1440 全屏就是 4×（角色约 72px）：把 override 改回 2560 / 1440 即可。

### 另一个办法：直接拖窗口

运行游戏后直接**拖动窗口边框**，Godot 会自动找最合适的整数倍缩放。
适合开发期快速验证，不用改设置。

> **注意**：`window_width_override` 只影响**编辑器里按 F5 运行**的窗口。
> 导出成正式版本后，窗口大小由导出预设和 `override.cfg` 决定。

---

## 五、设置改完后的完整 project.godot

改完之后，本项目的 `project.godot` 应该长这样（**也可直接在编辑器中修改，效果一致**）：

```ini
[application]

config/name="farm"
run/main_scene="uid://d1flhep88ywh0"      # 主场景 scenes/main.tscn
config/features=PackedStringArray("4.7", "Forward Plus")

[display]

window/size/viewport_width=640
window/size/viewport_height=360
window/size/window_width_override=1920          ← 窗口大小覆盖
window/size/window_height_override=1080
window/stretch/mode="canvas_items"
window/stretch/scale_mode="integer"
# stretch/aspect 未显式设置，默认就是 keep

[rendering]

textures/canvas_textures/default_texture_filter=0
2d/snap/snap_2d_transforms_to_pixel=true
2d/snap/snap_2d_vertices_to_pixel=true
```

---

## 六、主场景（已完成）

`project.godot` 的 `run/main_scene` 已指向 `scenes/main.tscn`（UID `uid://d1flhep88ywh0`），按 F5 直接进游戏。

早期步骤（已不需要，保留作记录）：

1. **编辑器里**：`项目设置 → 应用 → 运行 → 主场景` → 选目标场景
2. **或者**：把场景拖到 Scene 面板顶部（场景树上方），它会成为主场景

> 现在的 `scenes/main.tscn` 已包含 Ground / Soil / Boundary / Entities（Player + Camera），
> 不再用 `player.tscn` 当主场景。

---

## 七、改完之后的自检清单

- [ ] 运行游戏，**画面不糊**（像素硬边，不是模糊的）
- [ ] 窗口大小正常（1920×1080 或手动拖拽的尺寸），而非 640×360 的小窗口
- [ ] 角色**在动**（idle 呼吸动画循环播放）
- [ ] 角色**清晰可见**，大小合理（不是一个小点）
- [ ] 拖动窗口边缘，画面比例**不变形**、角色不闪烁
- [ ] 放大到 3 倍或 4 倍看，**像素依然是方的**

---

## 八、顺序建议

**先改设置，再动代码。** 顺序很重要：

1. 改上面 4 项项目设置 → 运行看看效果
2. 看到角色在动、清晰、不糊 → 说明设置对了
3. 再加 `player.gd` 脚本做移动
4. 再做摄像机

如果先写代码再改设置，将难以区分"画面糊"是设置问题还是代码问题。

---

## 九、附：本次核对的源码依据

| 结论 | 源码位置 |
|---|---|
| `scale_mode` 只有 `fractional` / `integer` | `core/config/project_settings.cpp:1790` |
| `stretch/mode` 三种：Disabled / Canvas Items / Viewport | `scene/main/window.cpp:3595` |
| `stretch/aspect` 五种：Ignore / Keep / Keep Width / Keep Height / Expand | `scene/main/window.cpp:3596` |
| `offset` 与 `centered` 的计算顺序 | `scene/2d/animated_sprite_2d.cpp:302-313` |
| 切图对话框字段与 4×4 默认值 | `editor/scene/sprite_frames_editor_plugin.cpp:2640-2760` |
