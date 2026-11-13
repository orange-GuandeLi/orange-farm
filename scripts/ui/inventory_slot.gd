class_name InventorySlot
extends Panel

## 背包格子：显示一个物品的图标和数量。
## 只管显示，不存任何东西 —— 数据全在 Inventory 单例里。

@onready var _icon: TextureRect = $Icon
@onready var _count: Label = $Count

## 这一格现在显示的物品 id，空格是 &""
var _id: StringName = &""


## 刷新这一格。id 为空表示空格
func set_item(id: StringName, count: int) -> void:
	_id = id
	if id == &"" or count <= 0:
		_icon.texture = null
		_count.text = ""
		return
	_icon.texture = ItemDB.icon(id)
	_count.text = str(count)


## 这一格现在放的是什么
func get_item_id() -> StringName:
	return _id
