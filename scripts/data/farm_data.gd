extends Node

## 格子坐标 -> 地块状态
## 没开垦的格子不存（省内存），get_tile 返回 null 即代表未开垦
var tiles: Dictionary[Vector2i, SoilData] = {}


## 取某格状态；未开垦返回 null
func get_tile(cell: Vector2i) -> SoilData:
	return tiles.get(cell)


## 该格是否已开垦
func is_tilled(cell: Vector2i) -> bool:
	return tiles.has(cell)


## 锄地。成功返回 true；已经锄过返回 false
func till(cell: Vector2i) -> bool:
	if tiles.has(cell):
		return false
	var d := SoilData.new()
	d.state = SoilData.State.TILLED
	tiles[cell] = d
	return true