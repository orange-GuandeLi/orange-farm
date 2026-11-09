# 40×26 改造复验报告（FARM_SIZE_REVIEW）

> 复验对象：`scenes/main.tscn`（用户改完后保存，`format=4`）
> 方法：① 无头脚本加载真实场景读属性 + 跑物理 ② **真实渲染**（Metal 4.0 Forward+）截图像素采样
> 结论：**主体全对，3 处待修，其中 1 处是硬 bug（Y 排序被压制）**

---

## 1. 验收结果总表

| 检查项 | 期望 | 实测 | 结果 |
|---|---|---|---|
| `FenceTop` | pos (336,0) size 684×16 | pos (336,0) size 684×16 | ✅ |
| `FenceBottom` | pos (336,440) size 684×16 | pos (336,440) size 684×16 | ✅ |
| `FenceLeft` | pos (2,220) size 16×456 | pos (2,220) size 16×456 | ✅ |
| `FenceRight` | pos (670,220) size 16×456 | pos (670,220) size 16×456 | ✅ |
| 玩家脚底可活动 x | [16, 656] | [16.0, 656.0] = 40.00 格 | ✅ |
| 玩家脚底可活动 y | [16, 432] | [16.0, 432.0] = 26.00 格 | ✅ |
| 玩家出生点 | (336, 224) | (336, 224) | ✅ |
| `Camera2D` limit | 0 / 0 / 672 / 448 | 0 / 0 / 672 / 448 | ✅ |
| Camera 平滑 | 关 | `position_smoothing_enabled = false` | ✅ |
| Camera 锚点 | Drag Center | `anchor_mode = 1` | ✅ |
| `Entities.y_sort_enabled` | true | true | ✅ |
| `Decor` 父节点 | Entities | Entities | ✅ |
| `Ground` 铺贴 | 42×28 格 | **42×27 格（cy 到 26）** | ❌ 少 1 行 |
| `Decor.z_index` | 0 | **-1** | ❌ 压制 Y 排序 |
| `TileSet` source[1] | 已修 | region 16×16 / 贴图 320×576 | ❌ 仍是坏的 |

---

## 2. 问题一：Ground 少铺 1 行 → 底部露黑边（截图已证实）

**现象**：真实渲染 `/tmp/shot_bottomright.png` —— 玩家走到农场右下角时，
屏幕底部出现一条 **16px 宽的深蓝色横条**（截图里是 64px，因为窗口 1280×720 = 视口 ×4）。

**原因**：
```
Ground 实际覆盖  world y ∈ [0, 432]   （cy 0..26，27 行）
Camera limit_bottom = 448  →  镜头最低时视野 y ∈ [268, 448]
                            ^^^^^^^^^^^^^^^^^^^^^^^^
地面只到 432 →  y ∈ [432, 448] 这 16px 没有地面 → 露背景色
```
像素采样确认：黑条上沿在屏幕 y=656 → 视口 y=164 → 世界 y = 268+164 = **432**，
正好是地面边缘。

**其它三条边干净**（`/tmp/shot_topleft.png`）：左边 limit_left=0 ↔ 地面 x 从 0 起；
上边 limit_top=0 ↔ 地面 y 从 0 起；右边 limit_right=672 ↔ 地面 x 到 672 止。四边对齐。

**修法（二选一，推荐 A）**：

- **A. 给 Ground 再补 1 行**（`cy` 铺到 27）。
  这多出来的 16px（世界 y ∈ [432,448]）**正是 `FenceBottom` 所在的那一条**，
  将来你要在这条边界上摆可见的木栅栏 / 篱笆装饰，这行就是它的位置。推荐这个。
- **B. 把 `Camera2D.limit_bottom` 改成 432**。地面不用动，但底部永远看不到 y>432 的区域，
  将来放底部围栏会露在外面。

---

## 3. 问题二：`Decor.z_index = -1` 压制了 Y 排序（硬 bug，实测证实）

### 3.1 结论
在开了 `y_sort_enabled` 的父节点下，**子节点自己的 `z_index` 优先级高于 Y 排序**。
`Decor.z_index = -1` 会让所有装饰 tile 落到 z 层级 -1，
而 `Player.z_index = 0` 在层级 0 —— **渲染时 z 层级 -1 的整批先画，层级 0 后画**，
所以**玩家永远在所有装饰前面**，树永远挡不住人。

### 3.2 源码依据

`servers/rendering/renderer_canvas_cull.cpp`：
```cpp
// _collect_ysort_children(): 把子节点全部拍平进一个数组
child_items[i]->ysort_parent_abs_z_index = p_z;   // p_z = 父节点的绝对 z
// 然后 _cull_canvas_item() 里：
int parent_z = p_z;
if (ci->z_relative) {
    p_z = CLAMP(p_z + ci->z_index, ...);           // ← 子节点自己的 z_index 在这里加进来
}
```
→ 拍平后按 Y 排序，但**分桶用的 z 是「父绝对 z + 子节点自己的 z_index」**。
桶不同 → 后画的整桶盖住先画的整桶 → **z 赢过 Y**。

`servers/rendering/renderer_canvas_cull.h:117`（`ItemYSort` 比较器）：只比 Y 和 `ysort_index`，
**完全没有 z 的参与** —— z 在分桶那一步就已经决定了胜负。

`scene/2d/tile_map_layer.cpp:362`：TileMapLayer 内部给每个 tile 行生成独立 CanvasItem，
`rs->canvas_item_set_z_index(ci, tile_z_index)`（TileData 的 z_index，默认 0）
+ `rs->canvas_item_set_z_as_relative_to_parent(ci, true)`
→ 所以 tile 的绝对 z = **Decor 的 z_index + 0**。Decor 是 -1 → tile 就在 -1。

### 3.3 实测（真实渲染 + 像素采样）

用真实 `TileMapLayer`（自建 16×16 红色 tileset）放在 `y_sort_enabled` 的父节点下，
tile 在 world y[80,96]（排序 Y=80），玩家标记在 y=70（排序 Y=70）。**Y 排序生效时 tile 应该在前面**。

```
Decor.z_index = -1  → 重叠区像素 = (0,0,1) 蓝色(玩家)在上面 ⇒ z_index 压制了 Y 排序
Decor.z_index =  0  → 重叠区像素 = (1,0,0) 红色(tile)在上面 ⇒ Y 排序生效
```

对照组（普通 `ColorRect`）结论一致：
```
RED(y=150, z=-1) vs BLUE(y=100, z=0)   重叠区 = 蓝色 → z 赢
RED(y=150, z=0)  vs BLUE(y=100, z=0)   重叠区 = 红色 → Y 赢
```

### 3.4 修法
**把 `Decor` 的 `z_index` 从 -1 改成 0。**

改完之后的层次关系（都落在 Main 的 z 层级 0，按绘制顺序）：
```
Ground  (Main 直接子节点，z=0)      → 最先画（树序最前）→ 地面
Soil    (Main 直接子节点，z=0)      → 地面之上
Entities (y_sort=true)
   ├ Decor (TileMapLayer, z=0, y_sort=true)  → 逐 tile 行参与 Y 排序
   └ Player (z=0)                             → 跟 Decor 的 tile 比 Y 决定前后
```
`Ground`/`Soil` 在 `Entities` **外面**，靠 Main 的树序天然排在前面，不需要 `z_index` 负值。

### 3.5 附带提醒：树 tile 要设 `y_sort_origin`
`tile_map_layer.cpp:552`：
```cpp
canvas_items_position = Vector2(0, map_to_local(coords).y + tile_y_sort_origin + y_sort_origin);
```
默认 `TileData.y_sort_origin = 0` → **tile 按格子的顶边排序**。
一棵 32px 的树占满一格，树脚在格底，但排序点却在格顶 → 玩家站在树下方时不会��树挡住。

**铺树时要把该 tile 的 `Y Sort Origin` 设成树的高度**（16px tile → 16，32px tile → 32），
排序点才落在树脚上。这是 TileSet 里每个 tile 的独立属性，在 TileSet 编辑器选中 tile 就能改。

---

## 4. 问题三：`TileSet` 的 `source[1]` 还是坏的（还没修）

```
source[0]  TileSetAtlasSource  1740 tiles  region 16×16  贴图 1024×1024  ✅
source[1]  TileSetAtlasSource    48 tiles  region 16×16  贴图  320×576   ❌
```
`source[1]` 用的是 32px 森林贴图（`spr_tileset_sunnysideworld_forest_32px.png`，320×576 = 10×18 个 32px 格），
但 `texture_region_size` 是 `16×16` → **每棵 32×32 的树被切成 4 块 16×16 的碎砖**。

现在 `Decor` 还是 0 格，所以肉眼看不出来，等你铺树就会发现每棵树是四块拼不回去的碎片。

**修法**：
- **A**：从 TileSet 里删掉 `source[1]`，Decor 先用主图集里的灌木 / 小树 / 木栅栏
  （主图集第 32–40 列 × 第 0–4 行，见 `/tmp/tiles16_zoom.png`）。
- **B**：单独建一个 32px 的 `TileSet`（`tile_size = 32×32`，`texture_region_size = 32×32`）
  专门给 Decor 用，`Decor.tile_set` 指向它。

---

## 5. 本轮用到的验证脚本（可复用）

| 脚本 | 作用 |
|---|---|
| `/tmp/verify_main.gd` | 无头加载真实场景，读墙/Ground/Decor/TileSet 属性 + 跑物理测可活动范围 + 读 Camera 夹紧 |
| `/tmp/shoot_farm.gd` | **真实渲染**截图（不能加 `--headless`，否则没有像素），存 `/tmp/shot_*.png` |
| `/tmp/tilemaplayer_zsort.gd` | 用真实 TileMapLayer 验证 `z_index` vs Y 排序优先级 |
| `/tmp/measure_one.gd` | 通用：给定 W×H 按公式摆墙 → 跑物理 → 输出脚底可达范围 |

**真实渲染的正确姿势**（macOS）：
```bash
cd /Users/orange/my/godot/farm
/Applications/Godot.app/Contents/MacOS/Godot --path . --script /tmp/xxx.gd > /tmp/out.txt 2>&1 &
sleep 25; cat /tmp/out.txt; pkill -f "xxx.gd"
```
截图坐标换算：窗口 1280×720 / 视口 320×180 = **缩放 ×4**，
所以「世界坐标 → 屏幕坐标」是 `(wx*4, wy*4)`。

---

## 6. 待办（按优先级）

1. **Ground 补 1 行**（cy 铺到 27）→ 消掉底部黑边
2. **`Decor.z_index` 改成 0** → 恢复 Y 排序
3. **`source[1]` 二选一修掉** → 铺树前必须处理
4. 铺树时给树 tile 设 `y_sort_origin` = 树高
5. 然后进入 M2a：地块状态字典 + 锄地交互
