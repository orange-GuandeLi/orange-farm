extends CanvasLayer

## 背包面板：Tab 开合，内容全部来自 Inventory 单例。
## 这个脚本只管显示，不存任何东西。

@onready var _slots: Array[InventorySlot] = [
	$Root/Center/Frame/Margin/Grid/Slot0,
	$Root/Center/Frame/Margin/Grid/Slot1,
	$Root/Center/Frame/Margin/Grid/Slot2,
	$Root/Center/Frame/Margin/Grid/Slot3,
	$Root/Center/Frame/Margin/Grid/Slot4,
	$Root/Center/Frame/Margin/Grid/Slot5,
	$Root/Center/Frame/Margin/Grid/Slot6,
	$Root/Center/Frame/Margin/Grid/Slot7,
	$Root/Center/Frame/Margin/Grid/Slot8,
	$Root/Center/Frame/Margin/Grid/Slot9,
	$Root/Center/Frame/Margin/Grid/Slot10,
	$Root/Center/Frame/Margin/Grid/Slot11,
]

var _is_open := false


func _ready() -> void:
	Inventory.add(&"parsnip", 5)
	Inventory.add(&"wood", 12)
	Inventory.add(&"egg", 1)
	Inventory.changed.connect(refresh)
	visible = false
	refresh()


func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("toggle_inventory"):
		toggle()
		get_viewport().set_input_as_handled()


## 开 / 关
func toggle() -> void:
	_is_open = not _is_open
	visible = _is_open
	if _is_open:
		refresh()


## 按 Inventory 里的内容重画 12 个格子
func refresh() -> void:
	var data := Inventory.slots()
	for i in range(_slots.size()):
		var d: Dictionary = data[i]
		_slots[i].set_item(d["id"], d["count"])
