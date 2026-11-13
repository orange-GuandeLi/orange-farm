extends Node

## 背包：只存「有哪些物品、各多少个」。
## 物品本身的定义（名字 / 图标 / 堆叠上限）在 ItemDB 里，这里不重复。
##
## 12 格模型：每格放一种物品，同种堆成一堆，所以
## 「格子数」= 物品的种类数，不是物品的总个数。
##
## 这个脚本不写 class_name —— 它注册成 Autoload 后，
## 全局直接用 Inventory.xxx 调用（跟 FarmData 一个路子）。
## 实测：Godot 4.7 里无 class_name 的 Autoload 依然是强类型的，
## var n := Inventory.add(...) 能正常推断出 int。

## 背包内容变了就发这个，UI 靠它刷新
signal changed()
## 加了东西
signal item_added(id: StringName, count: int)
## 拿走东西
signal item_removed(id: StringName, count: int)

## 背包格子数
const CAPACITY := 12

## 固定槽位表：长度恒为 CAPACITY，空格子用 &"" 占位。
## 物品进出只改内容不改位置，所以「用完再拿回来」会回到原来的格子。
var _slots: Array[StringName] = []

## 数量表：item_id -> 数量
var _items: Dictionary[StringName, int] = {}


func _init() -> void:
	_slots.resize(CAPACITY)
	_slots.fill(&"")


## 占了几个格子
func used_slots() -> int:
	return _items.size()


## 还剩几个空格子
func free_slots() -> int:
	return CAPACITY - _items.size()


## 格子用满了
func is_full() -> bool:
	return _items.size() >= CAPACITY


## 某个物品有多少个
func count(id: StringName) -> int:
	return _items.get(id, 0)


## 是否有至少 n 个
func has(id: StringName, n: int = 1) -> bool:
	return count(id) >= n


## 放东西进去。返回实际放进去的数量（放不下会比 n 少）
func add(id: StringName, n: int = 1) -> int:
	if n <= 0 or not ItemDB.has(id):
		return 0
	var limit := int(ItemDB.get_def(id).get("stack", 99))

	if _items.has(id):
		# 已经有这一堆，只能往上堆。同一种物品只占一格，堆满了剩下的就丢掉
		var cur := int(_items[id])
		var put: int = mini(limit - cur, n)
		if put > 0:
			_items[id] = cur + put
			changed.emit()
			item_added.emit(id, put)
		return put

	# 新物品：先找第一个空格子
	var slot := _find_free_slot()
	if slot < 0:
		return 0
	var put: int = mini(limit, n)
	_items[id] = put
	_slots[slot] = id
	changed.emit()
	item_added.emit(id, put)
	return put


## 拿走东西。数量不够返回 false（一个都不拿）
func remove(id: StringName, n: int = 1) -> bool:
	if n <= 0 or not _items.has(id):
		return false
	var cur := int(_items[id])
	if cur < n:
		return false
	if cur == n:
		_items.erase(id)
		# 腾出槽位，但保留位置：下次放回来还是这一格
		var slot := _slots.find(id)
		if slot >= 0:
			_slots[slot] = &""
	else:
		_items[id] = cur - n
	changed.emit()
	item_removed.emit(id, n)
	return true


## 清空背包
func clear() -> void:
	if _items.is_empty():
		return
	_items.clear()
	_slots.fill(&"")
	changed.emit()


## 按槽位顺序给出每一格的内容，给 UI 直接渲染
## 返回 [{ "id": StringName, "count": int }, ...]，长度恒为 CAPACITY
func slots() -> Array:
	var out: Array = []
	for id in _slots:
		out.append({"id": id, "count": count(id)})
	return out


## 存盘
func to_dict() -> Dictionary:
	return {
		"slots": _slots.duplicate(),
		"items": _items.duplicate(),
	}


## 读档
func from_dict(data: Dictionary) -> void:
	_items.clear()
	_slots.fill(&"")
	var raw_items: Dictionary = data.get("items", {})
	var raw_slots: Array = data.get("slots", [])
	var n_slots: int = mini(raw_slots.size(), CAPACITY)
	for i in range(n_slots):
		var sid := StringName(raw_slots[i])
		if sid == &"":
			continue
		var n := int(raw_items.get(sid, 0))
		if n > 0 and ItemDB.has(sid):
			_items[sid] = n
			_slots[i] = sid
	changed.emit()


## 找第一个空格子；满了返回 -1
func _find_free_slot() -> int:
	for i in range(CAPACITY):
		if _slots[i] == &"":
			return i
	return -1