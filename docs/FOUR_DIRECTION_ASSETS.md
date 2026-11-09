# 四向移动素材 —— 完整盘点与接入方案

> 日期：2026-11-09
> 素材来源：`assets/Characters/Human_v1/`（从 `human_v1.0.aseprite` 提取，源文件已从项目移除，此处为唯一副本）
> 配套图：`docs/images/frame_index_310.png`（310 帧索引图）、`docs/images/swap_compare.png`（换色对比）

---

## 0. 一句话结论

`human_v1.0` 的 310 帧**不是**"4 个方向各一套动画"，而是**两个不同发型角色版本的素材混装**：

| | bowlhair（橙色，游戏在用） | bob（深棕色） |
|---|---|---|
| 正面走 | ✗ 没有 | 27–42 |
| 背面走 | ✗ 没有 | 47–58 |
| 侧身走 | **99–106** | ✗ 没有 |
| 转身 | **0–15** | ✗ 没有 |
| 正面跑 | **159–176** | 60–75 |
| 背面跑 | ✗ 没有 | 80–91 |

**两套互补**。所以"四向移动"完全可以**只用原生 bowlhair** 拼出来，一个像素都不用改：

- 向下走 → 现有 `assets/Characters/Human/WALKING/` 分层素材（本来就是 bowlhair）
- 向左/右走 → v1.0 第 99–106 帧
- 向上走 → v1.0 第 8–15 帧（转身动画里的背面段）
- 转身切换 → v1.0 第 0–15 帧

---

## 1. 证据链（每条都可复验）

### 1.1 310 帧里有两套角色

按头发主色统计（bowlhair 橙 `[224,115,23]` / bob 深棕 `[117,61,58]`、`[62,38,48]`）：

```
ORANGE     0-15      (turn 转身)
MID/DARK   27-92     (bob 四向移动)
ORANGE     99-309    (bowlhair 其余全部动作)
```

### 1.2 两套是**不同发型**，不只是配色不同

头部轮廓 IoU（只看 alpha 形状）：

```
bowlhair turn 1-7  vs  bob 27-33   →  0.72 ~ 0.79
bowlhair turn 1-7  vs  bowlhair 159-165 → 0.82 ~ 0.94
```

同发型对比明显更高 → bob 是另一款发型（刘海+鬓角造型），bowlhair 是圆润的碗盖头。

### 1.3 动作性质靠下半身运动量区分

下半部分（脚/腿区域）相邻帧差异均值：

| 帧段 | 运动量 | 判定 |
|---|---|---|
| 27–42 | 0.333 | 走 |
| 47–58 | 0.213 | 走 |
| 60–75 | 0.755 | 跑 |
| 80–91 | 0.537 | 跑 |
| 99–106 | 0.255 | 走 |
| 115–122 | 0.311 | 走 |
| 159–176 | 0.901 | 跑 |

判据：走路 ≈ 0.2–0.45，跑步 > 0.5，静止 < 0.1。

### 1.4 bowlhair 确实没有正面走

对全部 310 帧做「橙发 + 可见脸 + 走路速度」的连续段搜索，**结果为空**（只有零散单帧命中，无任何长度 ≥3 的连续段）。

### 1.5 肤色像素要按精确色值判断

坑：衣服主色 `[192,203,220]` 满足 `R>190 且 G>140 且 B>110`，用宽阈值会把衣服误判成脸。
正确的肤色是 `[233,173,125]` / `[232,173,125]`，必须用精确色值或 tol≤26。

---

## 2. 310 帧完整分段表

| 帧段 | 帧数 | 内容 | 发型 |
|---|---|---|---|
| 0–15 | 16 | **转身**（1–7 正面，8–15 背面） | bowlhair |
| 16 | 1 | 空白 | — |
| 17–24 | 8 | 被抓（武器飞出） | — |
| 25–26 | 2 | 空白 | — |
| 27–42 | 16 | **正面走** | bob |
| 43–58 | 16 | 转身尾 + **背面走**（47–58 是纯背面走） | bob |
| 59 | 1 | 空白 | — |
| 60–75 | 16 | **正面跑** | bob |
| 76–91 | 16 | 转身尾 + **背面跑**（80–91 是纯背面跑） | bob |
| 92 | 1 | 空壳（无头发无脸） | — |
| 93–98 | 6 | 空白 | — |
| 99–106 | 8 | **侧身走**（朝右） | bowlhair |
| 107–114 | 8 | 搬运（顶箱子） | bowlhair |
| 115–122 | 8 | **侧身走**（朝右，另一套） | bowlhair |
| 123–129 | 7 | 浇水（蓝色水花） | bowlhair |
| 130–149 | 20 | 死亡（红色→骷髅） | bowlhair |
| 150–158 | 9 | 持白色道具 | bowlhair |
| 159–176 | 18 | **正面跑** | bowlhair |
| 177–180 | 4 | 翻滚 | bowlhair |
| 181–204 | 24 | 攻击（斧/剑/鞭） | bowlhair |
| 205–216 | 12 | 游泳 | bowlhair |
| 217–230 | 14 | 挖矿 | bowlhair |
| 231–278 | 48 | 钓鱼/抡绳/战斗 | bowlhair |
| 279–309 | 31 | 钓鱼收线 | bowlhair |

---

## 3. 已生成的素材

目录：`assets/Characters/Human_v1/atlas/`，全部是 **96×64 一帧、横排** 的 PNG。

| 文件 | 帧数 | 来源帧 | 说明 |
|---|---|---|---|
| `walk_side.png` | 8 | 99–106 | bowlhair 侧身走，朝**右**（向左用 flip_h） |
| `walk_back_native.png` | 8 | 8–15 | bowlhair 背面（取自 turn 动画背面段） |
| `turn.png` | 16 | 0–15 | bowlhair 转身（正面→背面） |
| `run_front_native.png` | 18 | 159–176 | bowlhair 正面跑 |
| `walk_front_swap.png` | 16 | 27–42 | **换色版** bob 正面走（备选） |
| `walk_back_swap.png` | 12 | 47–58 | **换色版** bob 背面走（备选） |
| `run_front_swap.png` | 16 | 60–75 | **换色版** bob 正面跑（备选） |
| `run_back_swap.png` | 12 | 80–91 | **换色版** bob 背面跑（备选） |

### 3.1 换色映射表（palette swap）

作者原话建议用 palette swapping 换发型颜色。实测色阶**一一对应**：

```
bob 发主色  [117,61,58] [117,60,57] [117,60,58]  →  bowlhair [224,115,23] [225,116,24] [225,116,23]
bob 发暗色  [62,38,48]                          →  bowlhair [149,70,39]
描边        [23,20,36] [24,20,36] [24,20,37]    →  保持不变
皮肤        [233,173,125] [187,109,83]          →  保持不变
```

**风险**：换色后**轮廓仍是 bob 造型**，与 bowlhair 不同款。混用会明显违和，
所以 `*_swap.png` 只在"愿意让主角改用 bob 造型"时才用（那样整套都得换成 bob）。

---

## 4. 接入 Godot 的步骤（操作指南）

### 4.0 先理解一个结构约束

新 atlas 是**合成单层图**（身体+头发+手臂已经叠在一起）。而现有角色是三层结构：

```
BodySprite  身体
HairSprite  头发
ToolSprite  手臂/工具
```

三层播同一份 SpriteFrames 的同名动画 → 自动帧同步。

**所以新 atlas 只能给一个节点播**，不能三层都播（否则同一张图叠三遍，alpha 混合会把颜色叠暗）。

### 4.1 建第二份 SpriteFrames

1. 打开 `scenes/player.tscn`，选中 `BodySprite`
2. 右侧 Inspector → `Sprite Frames` 旁边点 **"新建 SpriteFrames"**（或直接复制现有那份）
3. 把新的命名为 `SpriteFrames_dir`（放 `assets/Characters/Human_v1/`）

> 建议**新建一份空的**，只放四向动画；原来的 `SpriteFrames_y8v0a` 留给三层用。

### 4.2 往 SpriteFrames_dir 里加动画

Godot 的 SpriteFrames 面板左上角有 **`Add Frame (from Sprite Sheet)`**：

1. 点 `Add Frame (from Sprite Sheet)` → 选 `assets/Characters/Human_v1/atlas/walk_side.png`
2. 弹窗里 **Horizontal** 填 `8`，**Vertical** 填 `1`
3. **Select** → 会生成 8 帧，全部选中
4. 点 **Add Animation**（面板顶部 `+`）→ 命名 `walk_side`
5. 把这 8 帧加进 `walk_side` 动画
6. **Animation Speed** 建议 `10`（和现有 walk 一致；跑用 `14`）
7. **Loop** 打开

重复以上步骤：

| 动画名 | atlas 文件 | 切片数 | Speed | 用途 |
|---|---|---|---|---|
| `walk_side` | `walk_side.png` | 8 | 10 | 左/右走 |
| `walk_back` | `walk_back_native.png` | 8 | 10 | 向上走（背面） |
| `turn` | `turn.png` | 16 | 14 | 转身过渡 |
| `run_front` | `run_front_native.png` | 18 | 14 | 向下跑（可选） |

### 4.3 场景加节点

在 `Player` 下、`BodySprite` **上面**（更靠后画）新增一个 `AnimatedSprite2D`：

- Name: `DirSprite`
- SpriteFrames: `SpriteFrames_dir`
- Position: `(0, -5)`（和另外三层一致）
- `Visible`: false（默认隐藏，四向时才显示）

节点顺序（后面的画在上面）：

```
Player
├── CollisionShape2D
├── BodySprite    ← v0.07 分层，正面/动作用
├── HairSprite    ← v0.07 分层
├── ToolSprite    ← v0.07 分层
├── DirSprite     ← v1.0 合成图，四向移动用（新建）
└── Camera2D
```

### 4.4 player.gd 的切换逻辑

思路很简单：

- **facing 是 left / right** → 显示 `DirSprite`，播 `walk_side`；`flip_h` 决定朝左还是朝右
- **facing 是 up** → 显示 `DirSprite`，播 `walk_back`
- **facing 是 down** → 隐藏 `DirSprite`，三层照旧播 `walk` / `run`

伪代码：

```gdscript
func _update_move_animation() -> void:
    var use_dir := facing == Vector2i.LEFT or facing == Vector2i.RIGHT or facing == Vector2i.UP
    dir_sprite.visible = use_dir
    body_sprite.visible = not use_dir
    hair_sprite.visible = not use_dir
    tool_sprite.visible = not use_dir
    if not use_dir:
        return
    var anim := "walk_side"
    if facing == Vector2i.UP:
        anim = "walk_back"
    dir_sprite.play(anim)
    dir_sprite.flip_h = (facing == Vector2i.LEFT)
```

> 三层和单层**不要同时显示**，否则画面会重影。

### 4.5 需要注意的点

- `DirSprite` 的 `flip_h` 独立于三层，不要让两边的 flip 逻辑互相干扰
- 三层的 `flip_h` 同步逻辑照旧保留
- `turn`（转身）动画可以以后再接：检测到 facing 变化时先播 turn，播完再切方向

---

## 5. 还没解决的 / 下一步

- **bowlhair 没有正面走**：向下走继续用 v0.07 分层素材。若嫌两套身体动画风格不一致，需要另想办法。
- **背面走只有 8 帧**（取自 turn 动画的背面段），可能看起来偏"转身"而非"走路"。若不接受，可用 `walk_back_swap.png`（bob 换色，12 帧），代价是发型变成 bob 造型。
- **`turn` 动画完整 16 帧**已备好，可用于 4 向之间的转身过渡（比瞬间切换自然）。
- **run 背面**（80–91）只有 bob 版本。
- 其它 6 款发型（v0.07 的 curlyhair / longhair / mophair / shorthair / spikeyhair）**都没有 v1.0 的四向帧**。
- aseprite 源文件已删，**frame tag 的官方语义无法再还原**；上表的分段全部靠像素特征反推，已逐项目视复核。
