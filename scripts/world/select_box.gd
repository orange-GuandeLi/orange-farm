extends Node2D
class_name SelectBox

## 角贴图的尺寸（selectbox_*.png 是 8x9）
const CORNER_SIZE := Vector2i(8, 9)

## 脉冲幅度，0.2 = 放大到 1.2 倍
@export var pulse_amount := 0.2


func _ready() -> void:
	_play_pulse()


## 把框移到某个格子；cells 指定覆盖几格（默认 1 格）
## 例：move_to(cell, Vector2i(3, 3)) 就是框 3x3
func move_to(cell: Vector2i, cells: Vector2i = Vector2i.ONE) -> void:
	var size_px := Vector2(cells) * GameConfig.TILE_SIZE

	# 原点放在矩形中心 —— 脉冲缩放才不会歪
	position = Vector2(cell) * GameConfig.TILE_SIZE + size_px * 0.5

	# 四个角贴在矩形的四角
	# （Sprite2D 的 Centered 要取消勾选，position = 贴图左上角）
	var half := size_px * 0.5
	$TL.position = -half
	$TR.position = Vector2(half.x - CORNER_SIZE.x, -half.y)
	$BL.position = Vector2(-half.x, half.y - CORNER_SIZE.y)
	$BR.position = half - Vector2(CORNER_SIZE)

	show()


## 隐藏选中框
func hide_box() -> void:
	hide()


## 脉冲动画：弹大 -> 收回，无限循环
func _play_pulse() -> void:
	var tw := create_tween().set_loops()
	# 快速弹大，带一点回弹
	tw.tween_property(self, "scale", Vector2.ONE * (1.0 + pulse_amount), 0.12) \
		.set_trans(Tween.TRANS_BACK).set_ease(Tween.EASE_OUT)
	# 慢速收回
	tw.tween_property(self, "scale", Vector2.ONE, 0.25) \
		.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)