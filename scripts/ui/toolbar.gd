extends CanvasLayer
## 工具栏：只做两件事——显示当前工具、把点击转发给玩家。
## UI 全部在 main.tscn 的 Toolbar 节点里搭好了，这里只有逻辑。

## 按钮顺序必须和 GameConfig.Tool 的顺序一致（DIG=0 / SEED=1 / WATER=2）
@onready var _buttons: Array[Button] = [
	$CenterContainer/HBoxContainer/Dig,
	$CenterContainer/HBoxContainer/Seed,
	$CenterContainer/HBoxContainer/Water,
]

var _player: Player = null


func _ready() -> void:
	# player.gd 里有 add_to_group("player")，所以不用写死路径
	_player = get_tree().get_first_node_in_group("player") as Player
	if _player != null:
		_player.tool_changed.connect(_on_tool_changed)
		_on_tool_changed(_player.tool)   # 初始状态对齐
	for i in _buttons.size():
		_buttons[i].pressed.connect(_on_button_pressed.bind(i))


## 点按钮 → 换工具（键盘 1/2/3 以后也走 player.set_tool 这一个入口）
func _on_button_pressed(index: int) -> void:
	if _player != null:
		_player.set_tool(index)


## 玩家换了工具 → 按钮跟着高亮
func _on_tool_changed(tool: int) -> void:
	for i in _buttons.size():
		_buttons[i].button_pressed = (i == tool)