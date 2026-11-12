# spec 格式参考

spec 是一个 JSON 文件，描述"从哪些图、取哪些块、涂成什么色"，渲染器照着画。

- 渲染器：`node <skill目录>/scripts/sprite_spec.js <spec.json>`
- 校验（不写文件）：`--check`
- 额外出对照图：`--preview`，倍率 `--scale N`（默认 3）

---

## 1. 顶层结构

```jsonc
{
  "name": "dig_north",              // 名字，只用于日志
  "root": "../..",                  // 相对本 spec 所在目录；源文件与输出都相对它解析
  "cell": { "w": 96, "h": 64 },     // 单帧尺寸
  "frames": 13,                    // 总帧数

  "palette": {                     // 命名颜色，算子里用名字引用
    "skin": "#E8AD7D",
    "navy": "#374464"
  },

  "sources": {                     // 来源文件别名 → 路径
    "dig_base": "assets/characters/human/dig/base_dig.png",
    "idle_hair_n": "assets/characters/human/idle/bowlhair_idle_n.png"
  },

  "outputs": {                     // 输出别名 → 路径
    "base_dig_n": "tmp/north/dig/base_dig_n.png"
  },

  "layers": [                      // 每层渲染成一条 帧数×cell.w 宽的横向条带
    {
      "name": "base",
      "output": "base_dig_n",      // 对应 outputs 里的别名
      "frames": [
        { "frame": 0, "ops": [ /* 按顺序执行 */ ] }
      ]
    }
  ],

  "composites": [                  // 把多层叠起来（不写盘，除非写进 outputs）
    { "layers": ["base_dig_n", "bowlhair_dig_n"], "output": "dig_north_composite" }
  ],

  "masters": [                     // 多图层母版：一个 .aseprite 里放多层，方便一次打开叠看
    { "layers": ["base_dig_n", "bowlhair_dig_n", "tools_dig_n"], "output": "dig_north.aseprite" }
  ],

  "preview": "tmp/north/dig/_spec_preview.png",   // 对照图路径（--preview 时才写）
  "legend": { "o": "outline" }     // brush 的默认字符对照，可放顶层
}
```

- `root` 是相对 spec 文件所在目录解析的，所以 spec 可以带着走。写绝对路径也行。
- `layers` 里每个 `frames` 条目必须覆盖 0..frames-1，渲染器会检查帧数与输出尺寸。
- 每一层输出都是"整条动画条带"，不是单帧图——引擎要的就是这种。
- `masters` 里的层顺序 = **下层在前**（`base` → `bowlhair` → `tools`，后写的叠在上面）；
  它和 `composites` 的区别是：`composites` 烘成一张图，`masters` 保持图层可分别编辑。

### 输出格式：`.png` 还是 `.aseprite`

`outputs` 里写什么扩展名，就产出什么格式：

```jsonc
"outputs": {
  "idle_s_noblush": "base_idle_s_noblush.aseprite"   // ← 可编辑母版
}
```

| 扩展名 | 产出 | 说明 |
|---|---|---|
| `.png` | 横向条带（帧数 × cell.w 宽） | 进引擎的贴图 |
| `.aseprite` / `.ase` | Aseprite 工程 | **人能接着改的母版** |

`.aseprite` 的结构：

- 画布 = `cell.w × cell.h`（**单帧尺寸**，不是条带宽度）
- 帧数 = `spec.frames`，每帧一个 cel（cel 类型 2 = zlib 压缩 RGBA）
- 图层名 = spec 里该层的 `name`（默认可见 + 可编辑）
- **图层定义只写在第 0 帧**，后续帧只放 cel —— 这是 Aseprite 格式的要求。
  （早先的写法每帧都写一遍图层定义，LibreSprite 打开就会看到 N 个同名图层、
  只有最后一个在所有帧里都有内容。）
- 多层母版（`masters`）= 一个文件里 N 个图层，每帧 N 个 cel，图层顺序 = 下层在前
- 帧时长 = `spec.frame_duration`（毫秒，默认 100）
- 调色板自动从像素里收集（不透明色，按首次出现排序）

`.aseprite` 也能当**输入**：`copy` / `mirror` 算子可以直接引用它，
渲染器会自动转成同尺寸条带参与运算。所以常见流程是
「在 Aseprite 里改母版 → 导出 PNG → 用 spec 生成朝向/配色变体」。

`.aseprite` 的读写实现见 `scripts/aseprite.js`（纯 Node，只用内置 fs / zlib / path）。

---

## 2. 算子

每个算子作用在**当前帧的 cell.w×cell.h 画布**上，按 `ops` 数组顺序执行。

### `copy` —— 从别的文件贴一块过来

```json
{"op": "copy", "src": "dig_base", "frame": 0}
{"op": "copy", "src": "idle_hair_n", "frame": 0, "rect": [42, 28, 13, 6], "at": [42, 28]}
{"op": "copy", "src": "dig_tools", "frame": 3, "rect": [51, 33, 15, 7], "at": [30, 15], "flip": "h"}
```

| 字段 | 含义 |
|---|---|
| `src` | `sources` 里的别名，或直接写路径 |
| `frame` | 来源图的第几帧（帧宽取 spec 的 cell.w） |
| `rect` | `[x, y, w, h]`，**帧内**区域；省略 = 整帧 |
| `at` | `[x, y]`，贴到画布的哪个位置；省略 = `[0, 0]` |
| `flip` | 可选，`"h"` / `"v"` / `"hv"` —— 贴之前先翻转这一块（角色转身、左右镜像用） |

> `flip` 翻的是**这一块自己**（以 rect 的宽/高为轴），不是整帧。
> 例：把 x51..65 的工具组件左右翻过来贴到 x30..44，就是"角色转身，工具换到另一侧"。

### `fill` —— 填一个矩形（色块）

```json
{"op": "fill", "rect": [48, 30, 1, 2], "color": "skin"}
```

`rect` 是 `[x, y, w, h]`，左上角坐标 + 宽高。整块覆盖写。

### `clear` —— 把矩形擦成透明

```json
{"op": "clear", "rect": [0, 28, 96, 36]}
```

覆盖写（不是 alpha 混合）——透明叠透明等于没擦，写成混合就擦不掉。

### `remap` —— 整体换色

```json
{"op": "remap", "map": {"#753D3A": "#8B5A3C"}}
{"op": "remap", "map": {"#753D3A": "#8B5A3C"}, "rect": [0, 0, 48, 64]}
```

按 RGB 精确匹配后替换，保留 alpha；`rect` 省略 = 整帧。换发色、换衣服色用它。

### `brush` —— 在 spec 里直接画 ASCII 像素

```json
{"op": "brush", "at": [43, 23], "art": [
    "..###..",
    ".#OOO#.",
    "#OOOOO#"
  ], "legend": {"#": "outline", "O": "skin"}}
```

字符对应颜色见 `legend`（放 op 里或顶层都行）；值为 `null` = 透明；空格和 `.` 跳过。
超出画布的部分自动裁掉。

### `mirror` —— 镜像

```json
{"op": "mirror", "axis": "h"}
{"op": "mirror", "axis": "v", "rect": [0, 0, 48, 64]}
```

`axis`: `h` 左右翻，`v` 上下翻。做朝左/朝右版本就靠它。

---

## 3. 颜色

`color` 可以是：

- `"#E8AD7D"` —— 直接写十六进制
- `"skin"` —— `palette` 里的名字（推荐：改色只动 palette 一处）

调色板名写错时渲染器会报错并列出可用名字。

---

## 4. 一个完整的小例子

两帧、每帧 32×32，把第 0 帧的眼睛涂成肤色，再把第 1 帧左边半边镜像过去：

```jsonc
{
  "name": "demo",
  "root": "..",
  "cell": { "w": 32, "h": 32 },
  "frames": 2,
  "palette": { "skin": "#E8AD7D" },
  "sources": { "src": "art/hero.png" },
  "outputs": { "out": "tmp/demo/hero_out.png" },
  "layers": [
    {
      "name": "main",
      "output": "out",
      "frames": [
        { "frame": 0, "ops": [
            { "op": "copy", "src": "src", "frame": 0 },
            { "op": "fill", "rect": [14, 12, 2, 1], "color": "skin" }
        ] },
        { "frame": 1, "ops": [
            { "op": "copy", "src": "src", "frame": 1 },
            { "op": "fill", "rect": [13, 12, 2, 1], "color": "skin" },
            { "op": "mirror", "axis": "h", "rect": [0, 0, 16, 32] }
        ] }
      ]
    }
  ]
}
```

---

## 5. 常见需求怎么写

| 需求 | 做法 |
|---|---|
| 换发色 | `remap`，`{"map": {"#753D3A": "#8B5A3C"}}` |
| 换衣服色 | `remap`，`{"map": {"#E93245": "#E85D2A"}}` |
| 做朝左/朝右版本 | 整帧 `copy` 之后加 `mirror`，`{"axis": "h"}` |
| 做朝上版本 | 见 `references/measurement-playbook.md` 的"朝向变体" |
| 只取前 8 帧 | `frames` 改 8，删掉多余的 frame 条目 |
| 加一个新道具 | `brush` 直接在 spec 里画 ASCII |
| 换工具（铲子→锄头） | `copy` 别的动作的 tools 层，帧序对应 |
| 保留原图不动 | 只写 `copy`，不做任何 fill/remap |

---

## 6. 排错

渲染器会检查：每层帧数 == `frames`、每张输出尺寸 == `frames × cell.w` × `cell.h`、
算子名合法、调色板名存在、来源文件存在。报错形如：

```
spec 错误：palette 里没有 'hair_dark'，可选: ["navy", "skin"]
spec 错误：找不到来源文件: /abs/path/base.png
校验不通过：
  ✗ base 尺寸 1248×64 != 1248×64
```

渲染出来的图不对（但没报错）时，按这个顺序查：

1. 坐标写错一格 —— `sheet_probe.js diff` 的颜色转移表会显示是哪类像素多了/少了。
2. `copy` 的 `rect` 用的是**帧内坐标**，`at` 用的是画布坐标，两者别混。
3. `clear` 之后忘了贴新内容 —— 擦完就是空的。
4. 帧序对不上 —— `copy` 的 `frame` 是来源图的帧号，不是当前帧号。
