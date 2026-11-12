extends Node2D
## 作物层：每个种了的地块挂一个 Sprite2D，生长 = 换 texture。
##
## 挂到 Entities 下面，跟着 Y 排序 → 玩家能走到高作物后面。

const CELL := 16


## 种一格
func plant(cell: Vector2i, crop_id: StringName) -> Sprite2D:
	var spr := Sprite2D.new()
	spr.centered = false
	# position 固定在格子底边中点（Y 排序靠它，成长时不能变）
	spr.position = Vector2(cell.x * CELL + CELL * 0.5, cell.y * CELL + CELL)
	_apply_texture(spr, crop_id, 0)
	spr.set_meta("cell", cell)
	spr.set_meta("crop_id", crop_id)
	add_child(spr)
	return spr


## 换到某个生长阶段（offset 要跟着贴图尺寸重算）
func set_stage(spr: Sprite2D, stage: int) -> void:
	var crop_id: StringName = spr.get_meta("crop_id")
	_apply_texture(spr, crop_id, stage)


## 收获：拿回产物，拆掉节点
func harvest(cell: Vector2i) -> Dictionary:
	var spr := _find(cell)
	if spr == null:
		return {}
	var crop_id: StringName = spr.get_meta("crop_id")
	var d := Crops.get_def(crop_id)
	spr.queue_free()
	return d


func _find(cell: Vector2i) -> Sprite2D:
	for c in get_children():
		if c is Sprite2D and c.get_meta("cell", Vector2i(-999, -999)) == cell:
			return c
	return null


func _apply_texture(spr: Sprite2D, crop_id: StringName, stage: int) -> void:
	var tex := Crops.texture(crop_id, stage)
	spr.texture = tex
	# 底部居中对准格子底边（centered=false 时 offset 是贴图左上角的额外偏移）
	spr.offset = Vector2(-tex.get_width() * 0.5, -tex.get_height())
