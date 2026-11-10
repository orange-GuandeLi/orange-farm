extends TileMapLayer

@export var tex: Texture2D

const SOIL_TILE := Vector2i(11, 3) # 泥土所在

## 在某格挖出耕地
func till(cell: Vector2i) -> void:
	set_cell(cell, 0, SOIL_TILE)
	_spawn_dust(cell)

## 扬起的尘土
func _spawn_dust(cell: Vector2i) -> void:
	var sf := SpriteFrames.new()
	sf.set_animation_speed("default", 15.0)
	sf.set_animation_loop("default", false)
	for i in range(6):
		var at := AtlasTexture.new()
		at.atlas = tex
		at.region = Rect2(i * 24, 0, 24, 9)
		sf.add_frame("default", at)
	var dust := AnimatedSprite2D.new()
	dust.sprite_frames = sf
	dust.centered = false
	dust.position = Vector2(
		cell.x * GameConfig.TILE_SIZE + 8,
		cell.y * GameConfig.TILE_SIZE + 10
	)
	add_child(dust)
	dust.play("default")
	dust.animation_finished.connect(dust.queue_free)