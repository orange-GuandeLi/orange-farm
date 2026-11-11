extends TileMapLayer

## 泥土四态各占一个 atlas source，source_id 与状态序号一一对应
const SRC_DRY := 0
const SRC_WET := 1
const SRC_SEEDED := 2
const SRC_GROWING := 3

## 在某格挖出耕地
func till(cell: Vector2i) -> void:
	set_cell(cell, SRC_DRY, Vector2i(0, 0))
