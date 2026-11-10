# 角色图层系统 —— 素材包实测报告 + 发型/帽子施工手册

> 调查与实测时间：2026-11-09
> 工具：`tools/hat_layer.py`
> 锚点数据：`assets/data/human_face_anchors.json`

---

## ⚠️ 勘误

本文档初版曾断言「6 个发型变体是整张图替换，不是图层」。**这是错的，已推翻。**

实测证据（IDLE 第 0 帧，逐像素）：

| 变体 | 不透明像素 | 包围盒 | 判定 |
|---|---|---|---|
| `base` | 154 | x43–53, y23–38（高 16） | **完整角色**：身体 + 光头 + 脸 |
| `bowlhair` | 105 | x42–54, y21–33（高 13） | **只有头发** |
| `curlyhair` | 159 | x39–56, y20–31（高 12） | 只有头发 |
| `longhair` | 131 | x39–54, y20–31（高 12） | 只有头发 |
| `mophair` | 106 | x42–55, y20–31（高 12） | 只有头发 |
| `shorthair` | 54 | x43–52, y23–30（高 8） | 只有头发 |
| `spikeyhair` | 96 | x42–54, y21–31（高 11） | 只有头发 |
| `tools` | 12 | x42–45, y34–37（高 4） | **只有手**（IDLE/WALKING） |

判据：完整角色高 16 行且下缘在 y=38（脚底线）；发型层高 8–13 行且全部落在头部区域。

**结论：8 个变体是 3 个图层族 —— 身体 / 头发 / 工具。**
这比初版结论好得多：换发型是换一层，不是换整套素材。

---

## 一、素材包全貌

```
assets/characters/
├── _Source/       加密 .aseprite（magic 9b18 0800，不可解析）
├── Human/         20 动作 × 8 变体 = 160 PNG
├── Goblin/PNG/    20 动作，无变体
└── Skeleton/PNG/  7 动作，无变体
```
共 **186** 个 PNG，全部是角色。**没有任何道具 / 帽子 / 地块 / UI 素材。**

Human 全部 strip 为**单行**布局，96×64 一格：

| 动作 | 帧数 | 动作 | 帧数 | 动作 | 帧数 |
|---|---|---|---|---|---|
| ATTACK | 10 | HAMMERING | 23 | RUN | 8 |
| AXE | 10 | HURT | 8 | SWIMMING | 12 |
| CARRY | 8 | IDLE | 9 | WAITING | 9 |
| CASTING | 15 | JUMP | 9 | WALKING | 8 |
| CAUGHT | 10 | MINING | 10 | WATERING | 5 |
| DEATH | 13 | REELING | 13 | | |
| DIG | 13 | ROLL | 10 | | |
| DOING | 8 | | | | |

---

## 二、三层合成（实测验证）

```
完整角色 = base  +  发型层  +  tools 层
```

三层是**同一坐标系、同一帧节奏**的独立 PNG，直接 alpha 叠加即可。

验证结果（IDLE f0 / AXE f0 / AXE f3 / DIG f5 / WATERING f0 / HAMMERING f10）：
全部合成正确，无错位、无残影。

`tools` 层内容：AXE=斧头、WATERING=洒水壶、DIG=锄头、HAMMERING=锤子、
MINING=镐、REELING=鱼竿、CASTING=法杖。IDLE/WALKING 里只有一只小手（12 px）。

---

## 三、头发怎么用

### 3.1 运行时多层（，能做换装系统）

```
Player (CharacterBody2D)
├── Body (AnimatedSprite2D)   ← base_*    SpriteFrames 资源 A
├── Hair (AnimatedSprite2D)   ← bowlhair_* SpriteFrames 资源 B，z_index = 1
└── Tool (AnimatedSprite2D)   ← tools_*    SpriteFrames 资源 C，z_index = 2
```

三个节点播**同一个动画名**，帧节奏自动同步（因为素材本身就是同节奏导出的）。

换发型 = 给 `Hair` 节点换一套 SpriteFrames 资源（或用
`AnimatedSprite2D.set_frames()`），无需重新切任何图。

**切图工作量**：每个变体每个动作 N 帧都要切。
- 只要 1 种发型 → base(20 动作) + hair(20 动作) + tools(20 动作)
- 若只做 M1/M2 需要的动作：base(idle/walk/run) + hair(idle/walk/run) + tools(axe/watering/dig)

### 3.2 离线烘焙（切图量不变，最省事）

用 `tools/hat_layer.py bake` 把 base+hair+tools 合成成一张最终 strip，
仅需切图一张 —— **切图工作量与当前相同**。

代价：换发型要重新烘焙 + 重新切图。

### 3.3 处理方式

M1/M2 阶段用 **3.2**（切图量不变）；等做「角色创建 / 换装界面」时再上 **3.1**。

---

## 四、帽子怎么用（要跟随动画）

### 4.1 关键前提：头部会动多少？

实测每个动作每帧的脸部左上角（肤色连通域，20 动作全帧 100% 检出）：

| 动作 | 帧数 | 脸 x 范围 | 脸 y 范围 | 最大位移 |
|---|---|---|---|---|
| IDLE | 9 | 44 | 24–25 | (0, 1) |
| WALKING | 8 | 44 | 24–26 | (0, 2) |
| RUN | 8 | 44 | 22–27 | (0, 5) |
| JUMP | 9 | 44 | 21–26 | (0, 5) |
| AXE | 10 | 41–45 | 24–25 | (4, 1) |
| MINING | 10 | 41–45 | 24–25 | (4, 1) |
| HAMMERING | 23 | 40–46 | 24–25 | (6, 1) |
| DIG | 13 | 41–45 | 23–25 | (4, 2) |
| REELING | 13 | 41–45 | 24–25 | (4, 1) |
| WATERING | 5 | 44 | 24 | (0, 0) |
| CASTING | 15 | 42–45 | 24–25 | (3, 1) |
| DEATH | 13 | 43–44 | 21–33 | (1, 12) |

**头最多平移 6px。** 这就是「静态帽子图 + 逐帧平移」能跟住的原因。

### 4.2 方案：帽子作为第 4 层，逐帧跟随

`tools/hat_layer.py` 已经把这件事做完了：

1. **生成锚点表** —— 扫描每个动作每帧的脸部位置
2. **生成参考帧** —— base+发型 合成好、带 8px 网格的画布，**美术直接在这张图上画帽子**
3. **烘焙** —— 帽子图按「该帧脸部位置 − 参考帧脸部位置」平移后叠加，
   再合成 base+发型+工具，输出最终 strip
4. **预览** —— 左右对照图，肉眼验收

### 4.3 完整命令

```bash
# 1) 参考帧 → 交给美术画帽子
python3 tools/hat_layer.py ref \
    --dir assets/characters/human --hair bowlhair \
    --out /tmp/ref_bowlhair.png --zoom 8

# 2) 锚点表（已生成过一次，改素材后重跑）
python3 tools/hat_layer.py anchor \
    --dir assets/characters/human --variant base \
    --out assets/data/human_face_anchors.json

# 3) 合成
python3 tools/hat_layer.py bake \
    --dir assets/characters/human \
    --hair bowlhair --tools \
    --hat /path/to/hat.png \
    --anchors assets/data/human_face_anchors.json \
    --out-dir assets/characters/human_baked \
    --actions IDLE WALKING RUN AXE WATERING DIG

# 4) 预览验收
python3 tools/hat_layer.py preview \
    --dir assets/characters/human \
    --hair bowlhair --tools --hat /path/to/hat.png \
    --anchors assets/data/human_face_anchors.json \
    --out /tmp/preview.png --actions IDLE AXE HAMMERING --zoom 6
```

### 4.4 帽子图的约定

- 尺寸必须是 **96×64**（和角色同坐标系）
- 透明底
- 画在**参考帧**（IDLE f0，脸在 (44,24)）上，导出后缩小回 96×64
- 头部各发型的头顶高度（IDLE f0 实测）：
  `base 23 / bowl 21 / curly 20 / long 20 / mop 20 / short 23 / spikey 21`
  → 帽子底边至少要在 **y=20**，否则会穿过最高的头发
- 不同发型头顶高低不同 → **每种发型各画一顶帽子**最保险
  （或者让帽子位置只依赖脸部 y，那样短发会被帽子压住、长发会露出）

---

## 五、已知限制

1. **帽子不会随头倾斜变形**。头顶是正面的 11px 小人，倾斜幅度极小，
   实测头只有平移没有旋转（AXE/HAMMERING 里头只是左右移），静态图 + 平移完全够用。
2. **DEATH 动作**头会倒下去（y 21→33），帽子会跟着平移但姿态不跟着躺倒。
   死亡动画本来也短，影响可忽略。
3. **HURT 有一帧脸部检测不到**（表情被遮），工具会自动回退到最近可用帧。
4. **源 aseprite 加密**，无法补导任何新图层。图层名里也没有 hat/cap/helmet。
   （附带发现：完整源文件有 `afro hair` / `red hair` / `roll hair coloured`
   三种额外发型，导出的 PNG 里没有。）
5. **帽子素材仍然要自己找或画**。这个包一个道具都没有。
   素材来源：LimeZu Sunnyside World 的**完整发行版**（含作物、家具、道具），
   当前下载的只是 Characters 部分。

---

## 六、与 Godot 的对接

如果走「离线烘焙」路线，最终产物就是普通 strip PNG，
**按现有流程切图即可**（`docs/SPRITE_SLICING.md`），Godot 侧零改动。

如果走「运行时多层」路线：

- 每个图层一套 `SpriteFrames` 资源
- 节点 z 顺序：Body(0) → Hair(1) → Hat(2) → Tool(3)
- 三个节点 `animation` 名相同即自动同步；`flip_h` 要一起设（角色居中于 x=48，翻转零偏移）
