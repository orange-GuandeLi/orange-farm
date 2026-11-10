# 四向移动素材 —— 盘点与接入方案

> 最后更新：2026-11-10
> 素材来源：`tmp/sunnyside_world_chatacter_anim_human_v1.0.aseprite`（作者 v1.0 源文件，310 帧，96×64）
> 配套图：`tmp/CHECK_dirs_crop.png`（四向合成对照）、`tmp/CHECK_v21_idle9.png`、`tmp/CHECK_v21_walk8.png`

---

## 0. 一句话结论

作者 v1.0 源文件里**四向素材齐全**，不用自己画侧身：

- 文件内自带 frame tag：`idle-s` / `idle-se` / `idle-ne` / `idle-n`、`walk-s` / `walk-se` / `walk-ne` / `walk-n`、
  以及 `run-s/se/ne/n`、`axe`、`roll`、`carry`、`watering`、`hurt`、`death`、`doing`、`jump`、`mining`、
  `swimming`、`hamering`、`attack`、`casting`、`waiting`、`reeling`、`caught`、`dig` 等
- 加上 V2.1 素材包自带的朝东（`_e`）那套，四个方向就凑齐了
- 朝西（`_w`）不需要单独导出：`_e` 素材水平镜像即可，运行时用 `flip_h` 实现，视觉完全等价

---

## 1. 命名规范（2026-11-10 起统一）

方向一律用**东南西北**，不再用 down / up / left / right / side：

| 后缀 | 含义 | 游戏里的 `facing` |
|---|---|---|
| `_s` | 南 = 朝下（面向镜头） | `Vector2i.DOWN` |
| `_n` | 北 = 朝上（背对镜头） | `Vector2i.UP` |
| `_e` | 东 = 朝右 | `Vector2i.RIGHT` |
| `_w` | 西 = 朝左 | `Vector2i.LEFT` |

**文件名** = `<层>_<动作>_<方向>.png`，层名 ∈ `base` / `bowlhair` / `tools`：

```
assets/characters/human/idle/base_idle_s.png       assets/characters/human/walking/base_walk_s.png
assets/characters/human/idle/bowlhair_idle_s.png   assets/characters/human/walking/bowlhair_walk_s.png
assets/characters/human/idle/tools_idle_s.png      assets/characters/human/walking/tools_walk_s.png
```

**动画名**（SpriteFrames 里）= `<动作>_<方向>`，头发层加 `hair_` 前缀、工具层加 `tool_` 前缀：

```
idle_s / hair_idle_s / tool_idle_s
idle_e / hair_idle_e / tool_idle_e
walk_s / hair_walk_s / tool_walk_s
```

代码里按 `"hair_" + base` / `"tool_" + base` 拼接，所以**名字必须严格一致**。

方向无关的动作（`run` / `use_dig` 等）不加方向后缀，保持 `run` / `hair_run` / `tool_use_dig` 这样。

---

## 2. 源文件的帧段（实测）

作者文件里 tag 的 from/to 字段被破坏过（只坏 tag 的范围字段和 chunk size/type 的高位，**像素数据完好**），
所以帧段是用「tag 顺序 + 像素比对」定的：

| tag | 帧段 | 帧数 | 画面 |
|---|---|---|---|
| `idle-s` | 0–3 | 4 | 正面朝下 |
| `idle-se` | 4–7 | 4 | 斜下 |
| `idle-ne` | 8–11 | 4 | 侧身（露右侧） |
| `idle-n` | 12–15 | 4 | 背面朝上 |
| `walk-s` | 27–34 | 8 | 正面朝下走 |
| `walk-se` | 35–42 | 8 | 斜下走 |
| `walk-ne` | 43–50 | 8 | 侧身走 |
| `walk-n` | 51–58 | 8 | 背面走 |

**验证方式**：v1.0 的 base 层第 1–4 帧与已导出的 `assets/characters/human/idle/base_idle_s.png`
**逐像素完全一致**（4/4 帧命中，其余 310 帧无一命中）。
`tmp/CHECK_dirs_crop.png` 是把 base + bowlhair + tools 三层合成后按方向排的对照图。

源文件还有一批空白帧（16 / 25–26 / 59 / 92–98 等），是动作段之间的过渡空档。

### 2.1 各层构成

| layer | 内容 | 帧数 |
|---|---|---|
| 4 | base（身体） | 293 |
| 8 | bowlhair（游戏在用的头发） | 279 |
| 9–13 | 另外 5 款发型 | 各 215 |
| 14 | tools（手臂/工具） | 285 |
| 0/1/2/6/16/17/18 | 背景与特效 | — |

walk 段（27–58）里**没有那 5 款发型的图层**，只有 base + bowlhair + tools 三层。
idle 段（0–15）有全部 8 层。

---

## 3. 现有素材清单

`assets/characters/human/idle/`

| 文件 | 帧数 | 来源 | 说明 |
|---|---|---|---|
| `base_idle_s.png` / `bowlhair_idle_s.png` / `tools_idle_s.png` | 4 | v1.0 `idle-s`（0–3） | **游戏在用**，朝下 |
| `base_idle_n.png` / `bowlhair_idle_n.png` / `tools_idle_n.png` | 4 | v1.0 `idle-n`（12–15） | **游戏在用**，朝上 |
| `base_idle_e.png` / `bowlhair_idle_e.png` / `tools_idle_e.png` | 9 | V2.1 `*_idle_strip9.png` | 朝东（V2.1 的老版本） |
| `curlyhair/longhair/mophair/shorthair/spikeyhair_idle_e.png` | 9 | V2.1 | 其它发型的朝东版，游戏暂时不用 |

`assets/characters/human/walking/`

| 文件 | 帧数 | 来源 | 说明 |
|---|---|---|---|
| `base_walk_e.png` / `bowlhair_walk_e.png` / `tools_walk_e.png` | 8 | V2.1 `*_walk_strip8.png` | 朝东，**游戏在用** |
| `curlyhair/longhair/mophair/shorthair/spikeyhair_walk_e.png` | 8 | V2.1 | 其它发型的朝东版，游戏暂时不用 |
| `base_walk_s.png` / `bowlhair_walk_s.png` / `tools_walk_s.png` | 8 | v1.0 `walk-s` 27–34 | 朝下，**游戏在用** |
| `base_walk_n.png` / `bowlhair_walk_n.png` / `tools_walk_n.png` | 8 | v1.0 `walk-n` 51–58 | 朝上，**游戏在用** |

> V2.1 那套朝东素材是**老版本**（角色更简化），v1.0 是作者重绘过的同一款角色。
> 两者画风一致、体型一致，混用不会出现角色变形。

---

## 4. 接入 Godot 的结构

### 4.1 三层结构不变

```
Player
├── CollisionShape2D
├── BodySprite    ← base 层
├── HairSprite    ← bowlhair 层
├── ToolSprite    ← tools 层
└── Camera2D
```

三层播同一份 SpriteFrames 的同名动画 → 自动帧同步。
**不要用「合成单层图 + 额外节点」的方案**：同一张图叠三遍会被 alpha 叠暗。

### 4.2 player.gd 的方向切换

```gdscript
func _play_anim(base_name: String) -> void:
	var suffix := _dir_suffix()
	_play_one(animation, base_name, suffix)
	_play_one(hair_sprite, "hair_" + base_name, suffix)
	_play_one(tool_sprite, "tool_" + base_name, suffix)

## 播一个动作的方向版本：
##   1. 有带方向的版本就直接播
##   2. 没做这个方向 -> 借东(_e)顶替，朝西(_w)时再镜像一次
##   3. 方向无关的动作(锄地等) -> 播不带后缀的
func _play_one(sp: AnimatedSprite2D, anim_name: String, suffix: String) -> void:
	if sp.sprite_frames.has_animation(anim_name + suffix):
		sp.play(anim_name + suffix)
		sp.flip_h = false
		return
	if sp.sprite_frames.has_animation(anim_name + "_e"):
		sp.play(anim_name + "_e")
		sp.flip_h = suffix == "_w"
		return
	if sp.sprite_frames.has_animation(anim_name):
		sp.play(anim_name)
		sp.flip_h = suffix == "_w"

## 方向后缀：南 s=朝下 北 n=朝上 东 e=朝右 西 w=朝左
func _dir_suffix() -> String:
	match facing:
		Vector2i.UP: return "_n"
		Vector2i.LEFT: return "_w"
		Vector2i.RIGHT: return "_e"
	return "_s"
```

三点说明：

1. **`flip_h` 归 `_play_one` 管**，`_update_facing()` 不再碰 `flip_h`。
   否则会出现「朝向是西、但动画是东的素材」和「朝向是西、但没翻」两种状态打架。
2. **朝西靠镜像**：`_w` 没有独立素材，播 `_e` 并 `flip_h = true`。
   预先把 PNG 水平翻转成静态 `_w` 素材，视觉上和 `flip_h` 完全等价，所以没必要多一套文件。
3. **回退链的顺序**：带方向 → `_e` → 不带后缀。
   第三级是给 `use_dig` 这类方向无关的动作用的，它们没有方向版本。

### 4.3 各动作的现状

| 动作 | 方向版本 | 备注 |
|---|---|---|
| `idle` | `_s` ✓ / `_e` ✓ / `_n` ✓ / `_w`（镜像 `_e`） | 4 帧 idle speed 2.67（1.5 秒一轮）；9 帧 idle speed 6.0 |
| `walk` | `_e` ✓ / `_s` ✓ / `_n` ✓ / `_w`（镜像 `_e`） | 8 帧，speed 10.0 |
| `run` / `use_dig` 等 18 个动作 | 无方向版本 | 保持原样 |

---

## 5. 还没解决的 / 下一步

### 5.1 要补的素材（从 v1.0 源文件导出）

| 目标 | 源 tag | 帧段 | 层 |
|---|---|---|---|
| `_s` 的 walk | `walk-s` | 27–34 | base / bowlhair / tools ✅ 已入库 |
| `_n` 的 idle | `idle-n` | 12–15 | base / bowlhair / tools ✅ 已入库 |
| `_n` 的 walk | `walk-n` | 51–58 | base / bowlhair / tools ✅ 已入库 |
| `_e` 的 v1.0 版（可选） | `idle-ne` / `walk-ne` | 8–11 / 43–50 | base / bowlhair / tools |

导出操作（LibreSprite 1.3）：

1. `View → Zoom → 8x`，勾上 Pixel-perfect
2. Tags 面板点标签 → 选中该段所有帧
3. `File → Export Sprite Sheet...`
   - Sprites = `Selected sprite`
   - Frames = `Selected frames`
   - Layout = `Horizontal`
   - **Trim sprite 不勾**（否则帧宽会不一致，切不出 96×64）
   - **Export Layers 勾上**
   - Split Layers 不勾
   - Format = PNG
4. 每次导出改文件名，避免覆盖
5. **导 walk 段时要把 5 款其它发型的图层眼睛关掉** —— walk 帧里它们是空的，不然会多出一堆透明条

### 5.2 其它待办

- **朝下 idle 是 4 帧、朝东 idle 是 9 帧**，帧数不统一。后果只有一个：转身停下时 idle 动画会重启一次，
  站姿轮廓接近所以跳变很轻微。真要统一就把朝东也换成 v1.0 的 4 帧。
- **走路的帧数统一（8 帧）**，`_s` / `_n` 的 walk 都已补齐，朝下走朝下那套、朝上走朝上那套。
- 角色**逐格吸附移动**：按下方向键后要先把当前这一步走到格子中心才切 idle，
  一格 16px ÷ `SPEED 40` = **0.4 秒**。这段等待不是动画 bug，是移动方式决定的。
- `turn`（转身过渡）动画没接：现在是瞬间切换。
- 其它 5 款发型**只有朝东版本**（来自 V2.1），v1.0 的 walk 段里也没有它们的图层。
