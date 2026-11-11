extends TileMapLayer
## 植被风场 —— 花和草一起随风摇摆。
##
## 原版《Sunnyside World》的 GIF demo 里，草丛会随"风"轻微摇摆。
## 作者当时的做法是运行时程序化驱动（素材包里没有草的动画帧），
## 所以这里也用程序化方案：每株植物按自己的节奏换替代 tile。
##
## ===== 变体 id 编码（由 setup_vegetation.gd 写入）=====
##   alt_id = level * 4 + offset          （范围 0..15）
##     level  = 摇摆档 0..3（0 直立，越大被风吹得越歪）
##     offset = 格内偏移 0..3（这株在格子里的固定偏移）
##   alt_id = 0 就是 base tile 本身，所以手动画的植物（默认就是
##   base tile）也能直接被接管。
##   四档的 texture_origin 全部往右 → 风向统一，像同一阵风扫过。
##
## ===== 摇摆模型 =====
##   每株有独立相位（不同步）+ 独立振幅（有的完全不动），
##   再叠一层全局阵风强弱 gust → 一阵强一阵弱。
##
## 用法：挂在 Vegetation 层上（setup_vegetation.gd 会自动挂）。
##
## ※ 编辑器里不动（没有 @tool），要按 F5 运行游戏才看得到。

const VegLib = preload("res://scripts/world/veg_lib.gd")

## 一株植物完成「歪下去 → 回正」需要多少秒。越小风越大。
@export_range(0.2, 4.0, 0.05) var sway_period: float = 1.2

## 完全不动的比例。0.2 = 五分之一的植物纹丝不动。
@export_range(0.0, 0.9, 0.05) var still_ratio: float = 0.2

## 随机种子。留空 = 每次运行分布都不一样。
@export var random_seed: int = 0

var _cells: Array[Vector2i] = []
var _phases := PackedFloat32Array()
var _amps := PackedInt32Array()
var _levels := PackedInt32Array()
var _offsets := PackedInt32Array()
var _time := 0.0

func _ready() -> void:
	await get_tree().process_frame
	refresh()

## 重新收集格子并重算相位/振幅。外部改动过格子后调用。
func refresh() -> void:
	_cells.clear()
	for c in get_used_cells():
		_cells.append(c)
	var sd := random_seed if random_seed != 0 else int(Time.get_ticks_usec())
	var data: Dictionary = VegLib.make_sway_data(_cells, sd, still_ratio)
	_phases = data["phases"]
	_amps = data["amps"]
	_levels.resize(_cells.size())
	_offsets.resize(_cells.size())
	for i in range(_cells.size()):
		_levels[i] = -1
		# 每株的格内偏移保持不变（存在 alt_id 的低位里）
		_offsets[i] = VegLib.variant_offset(get_cell_alternative_tile(_cells[i]))
	set_process(true)

func _process(delta: float) -> void:
	_time += delta
	if _cells.is_empty():
		return
	var gust: float = VegLib.gust_at(_time)
	for i in range(_cells.size()):
		var t: float = fposmod(_time / sway_period + _phases[i], 1.0)
		var lvl: int = VegLib.sway_level(_phases[i], _amps[i], t, gust)
		if lvl != _levels[i]:
			_levels[i] = lvl
			var cell: Vector2i = _cells[i]
			set_cell(cell, get_cell_source_id(cell), get_cell_atlas_coords(cell),
					VegLib.variant_id(lvl, _offsets[i]))
