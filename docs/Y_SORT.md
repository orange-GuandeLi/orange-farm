# Y 排序（y_sort_enabled）详解

> 一句话：**按"脚下位置"决定谁挡谁。**
> 屏幕上下方 = 远近。站在下面（Y 更大）的物体画在前面。

---

## 一、为什么需要它

俯视视角（2D top-down）游戏里，角色和场景物件（树、栅栏、石头、箱子）都会**在屏幕上重叠**。

谁该挡住谁？答案是"**离镜头近的那个挡远的**" —— 也就是**脚下 Y 更大（更靠屏幕下方）的那个画在前面**。

如果不用 Y 排序，Godot 只能按**节点在场景树里的顺序**画，一层压一层，永远不变：

- 树在场景树里排在 Player 后面 → 树永远在玩家前面
- 玩家走到树后面（上方）时，玩家还是完整可见 —— **穿模感**

Y 排序就是解决这个的。

---

## 二、规则（源码依据）

`Godot 4.7.2 servers/rendering/renderer_canvas_cull.h:117`

```cpp
struct ItemYSort {
	_FORCE_INLINE_ bool operator()(const Item *p_left, const Item *p_right) const {
		const real_t left_y  = p_left->ysort_xform.columns[2].y;   // ← 节点的全局原点 Y
		const real_t right_y = p_right->ysort_xform.columns[2].y;
		if (Math::is_equal_approx(left_y, right_y)) {
			return p_left->ysort_index < p_right->ysort_index;      // ← Y 相同按节点树序
		}
		return left_y < right_y;                                     // ← Y 小的先画（= 在后面）
	}
};
```

拆成四条：

1. **排序键 = 节点的全局原点 Y**（`transform` 的平移分量），**不是贴图的视觉中心**
2. **Y 小的先画** → Y 小的在**后面**；Y 大的在**前面**
3. **Y 相同时按节点树序**（`ysort_index` = 在父节点下的子节点顺序）
4. Y 排序**只影响绘制顺序，不影响物理**

---

## 三、怎么开

`y_sort_enabled` 是 **CanvasItem** 的属性，所以 `Node2D` / `TileMapLayer` / `Control` 都有。

```
Entities (Node2D)
├── Player
├── Tree
└── Rock
```

在 **Entities 节点的 Inspector → Layout 分类**里勾上 **Y Sort Enabled**。

**规则**（源码 `renderer_canvas_cull.cpp:110-165`）：

> 排序列表 = 开了 `y_sort_enabled` 的容器的**直接** CanvasItem 子节点 **+ 容器自己**。
> **只有子节点自己也开了 `y_sort_enabled`，才会递归收集它的子孙。**

所以：
- `Entities` 开了 → Player / Tree / Rock 互相排序 ✅
- 如果 Player 里面还有 Sprite2D，**Sprite2D 不会单独参与排序**，
  它跟随 Player 绘制（位于 Player 的位置）—— 该行为符合预期

---

## 四、⭐ 原点该放哪（最容易错的地方）

因为排序键是**原点 Y**，节点的原点位置直接决定排序时机。

| 对象 | 原点应该在哪 |
|---|---|
| 角色 | **脚底** |
| 树 | **树干根部**（不是树冠中心！） |
| 栅栏 | **底边**（贴地线） |
| 石头 / 箱子 | **底边** |

**当前 Player 设置正确**：实测可见脚底在节点空间 y = +1，碰撞盒下沿在 y = 0，
基本就是脚底。**不用改。**

**反面例子**：树如果用 `Sprite2D` 默认的 `centered = true`，原点就在树冠中心，
那么树冠下半部分还在玩家上面时，树就已经"沉到"玩家后面了 —— 视觉上会提前消失。

修法两种：
- `centered = false` + `offset` 把图钉在原点上方
- 或者建一个 `Node2D` 当锚点放在树根，`Sprite2D` 当它的子节点

---

## 五、在本项目中

```
Main (Node2D)
├── Ground (Polygon2D)      z=-2   ← 背景，不参与排序
├── Soil (TileMapLayer)     z=-1   ← 背景，不参与排序
├── Boundary (StaticBody2D)        ← 隐形，不参与排序
└── Entities (Node2D)      y_sort_enabled = true, z=0
    ├── Player
    └── (以后的树 / 石头 / NPC)
```

- **背景层必须在 `Entities` 外面** —— 否则整片地面会被按格子拆开排序，纯浪费
- **`Boundary` 也在外面** —— 它隐形，没有视觉要排
- **`z_index` 管"层与层"**，`y_sort` 管"层内谁挡谁"，两套机制不冲突

---

## 六、常见误解

| 误解 | 事实 |
|---|---|
| y_sort 会改变物理 | ❌ 只影响绘制顺序，碰撞完全不受影响 |
| 开了就自动生效 | ❌ 要给**父容器**开，子节点才参与；子节点自己的 `y_sort_enabled` 只影响它的子孙 |
| TileMapLayer 也能用 | ✅ 它是 CanvasItem，有这个属性。但地块一般不需要排序 |
| 排序看的是贴图中心 | ❌ 看的是**节点原点** |
| 开了 y_sort 后 z_index 就没用 | ❌ z_index 管层间，y_sort 管层内 |
