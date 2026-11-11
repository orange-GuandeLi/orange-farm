extends RefCounted
## 植被变体建设 + 风场计算（花和草共用）。
##
## ===== 现状 =====
##   主 TileSet 有两个 source：
##     source 0 = spr_tileset_sunnysideworld_16px.png（地面 + 13 种花）
##     source 1 = spr_grass_v01.png（2 丛草）
##   Vegetation 层里花和草在同一个格子只能放一个 tile → 天然不重叠。
##
## ===== 替代 tile（变体）id 编码 =====
##   alt_id = level * 4 + offset          （范围 0..15）
##     level  = 摇摆档 0..3（0 直立，越大被风吹得越歪，方向统一）
##     offset = 格内偏移 0..3（这株在格子里的固定偏移）
##   ※ alt_id = 0 就是 base tile 本身（不需要额外创建），
##     它的 texture_origin 也会被设成 level0/offset0 的值，
##     所以手动画的植物（默认就是 base tile）也能直接被摇摆接管。
##   花和草用同一套编码 → 风场脚本不用区分物种。
##
## ===== Godot 4.7 API 备忘（实测）=====
##   · is_alternative_tile_valid() 不存在，别用
##   · get_next_alternative_tile_id() 返回「最小空闲 id」，不是 max+1
##   · get_tile_data(coords, 不存在的 id) → 报错并返回 null
##   · remove_alternative_tile(coords, id) → id 不存在或 id==0 会报错
##   · create_alternative_tile(coords, id) → id 被占返回 -1；id 0 永远失败

const FLOWER_SOURCE_ID := 0
const GRASS_SOURCE_ID := 1

## 13 种花（16px 主图集 atlas 坐标）
const FLOWERS: Array[Vector2i] = [
	Vector2i(31, 1), Vector2i(32, 1), Vector2i(33, 1), Vector2i(34, 1),
	Vector2i(31, 2), Vector2i(32, 2), Vector2i(33, 2), Vector2i(34, 2),
	Vector2i(31, 3), Vector2i(32, 3), Vector2i(33, 3), Vector2i(34, 3),
	Vector2i(35, 3),
]

## 草贴图里的 2 丛
const GRASS_TILES: Array[Vector2i] = [Vector2i(0, 0), Vector2i(1, 0)]

const LEVELS := 4
const OFFSETS := 4

## 摇摆档 0..3 → texture_origin。
## Godot 里 texture_origin 正值往左上推、负值往右下推，
## 所以「往右倒」要用负值。四档全部往右 → 风向统一，像同一阵风扫过。
## 想换风向：去掉负号 = 往左倒；改数字 = 改幅度。
const SWAY_ORIGIN: Array[Vector2i] = [
	Vector2i(0, 0),     # level 0  直立
	Vector2i(-1, 0),    # level 1  往右 1px
	Vector2i(-2, 0),    # level 2  往右 2px
	Vector2i(-3, 1),    # level 3  往右 3px、往上 1px
]

## 4 档格内偏移 → texture_origin（负值 = 往右下偏）。
## 第 0 档是 (0,0)，这样手动画的植物（base tile）保持格子正中心。
const OFFSET_ORIGIN: Array[Vector2i] = [
	Vector2i(0, 0),
	Vector2i(-8, 0),
	Vector2i(0, -8),
	Vector2i(-8, -8),
]

# ---------------------------------------------------------------- 编码换算

static func variant_id(level: int, offset: int) -> int:
	return clampi(level * OFFSETS + offset, 0, LEVELS * OFFSETS - 1)

static func variant_level(alt_id: int) -> int:
	return clampi(int(alt_id) / OFFSETS, 0, LEVELS - 1)

static func variant_offset(alt_id: int) -> int:
	return clampi(int(alt_id) % OFFSETS, 0, OFFSETS - 1)

static func variant_origin(level: int, offset: int) -> Vector2i:
	return SWAY_ORIGIN[level] + OFFSET_ORIGIN[offset]

# ---------------------------------------------------------------- 变体建设

## 给某个图集 source 里的指定 tile 重建全部摇摆变体。
## 返回 { 旧id→新id 的映射, 新建数量 }。
##
## 旧变体先被清掉再按新编码重建，所以格子里存的旧 alt id 会失效；
## 用返回的映射表把格子的 alt id 迁移到新编码，位置跳变最小。
static func rebuild_variants(src: TileSetAtlasSource, coords: Vector2i) -> Dictionary:
	var result := {"map": {}, "made": 0}
	if src == null:
		return result

	# 1) 记下每个旧变体的 origin，后面用来算最接近的新档位
	#    探测不存在的 id 会触发引擎 ERROR，这里临时静音
	var old_ids: Array[int] = []
	var old_origins := {}
	var alt_count := src.get_alternative_tiles_count(coords) - 1
	if alt_count > 0:
		var prev_quiet := Engine.print_error_messages
		Engine.print_error_messages = false
		for id in range(1, 512):
			var td := src.get_tile_data(coords, id)
			if td != null:
				old_ids.append(id)
				old_origins[id] = td.texture_origin
			if old_ids.size() >= alt_count:
				break
		Engine.print_error_messages = prev_quiet

	# 2) 删掉所有旧变体（base tile 0 不能删）
	for id in old_ids:
		src.remove_alternative_tile(coords, id)

	# 3) base tile 的 origin 也要设好，否则 level0/offset0 和手画的植物对不上
	var base_td := src.get_tile_data(coords, 0)
	if base_td != null:
		base_td.texture_origin = variant_origin(0, 0)

	# 4) 建新变体 id 1..15
	for level in range(LEVELS):
		for off in range(OFFSETS):
			var aid := variant_id(level, off)
			if aid == 0:
				continue  # 0 是 base tile
			if src.create_alternative_tile(coords, aid) < 0:
				continue
			var td := src.get_tile_data(coords, aid)
			if td != null:
				td.texture_origin = variant_origin(level, off)
				result["made"] = int(result["made"]) + 1

	# 5) 旧 id → 新 id：找 origin 最接近的新档位，跳变最小
	var map := {}
	for old_id in old_ids:
		var o: Vector2i = old_origins[old_id]
		var best := 0
		var best_d := 1 << 30
		for level in range(LEVELS):
			for off in range(OFFSETS):
				var nid := variant_id(level, off)
				var d := (variant_origin(level, off) - o).length_squared()
				if d < best_d:
					best_d = d
					best = nid
		map[old_id] = best
	result["map"] = map
	return result

## 把一个 TileSet 里「所有花 + 所有草」的变体都重建好。
## 返回 { "map": {source_id: {atlas: {旧id: 新id}}}, "made": 总数 }
static func rebuild_all(ts: TileSet) -> Dictionary:
	var out := {"map": {}, "made": 0}
	if ts == null:
		return out
	for i in range(ts.get_source_count()):
		var sid: int = ts.get_source_id(i)
		var src := ts.get_source(sid) as TileSetAtlasSource
		if src == null:
			continue
		var coords_list: Array[Vector2i] = []
		if sid == FLOWER_SOURCE_ID:
			coords_list = FLOWERS.duplicate()
		elif sid == GRASS_SOURCE_ID:
			coords_list = GRASS_TILES.duplicate()
		else:
			continue
		var src_map := {}
		for c in coords_list:
			if src.get_tile_data(c, 0) == null:
				continue  # 这个 tile 在图集里不存在
			var r := rebuild_variants(src, c)
			src_map[c] = r["map"]
			out["made"] = int(out["made"]) + int(r["made"])
		out["map"][sid] = src_map
	return out

## 把 layer 里所有格子的 alt id 按映射表迁移到新编码。
## 返回迁移了多少格。
static func migrate_layer(layer: TileMapLayer, map: Dictionary) -> int:
	var moved := 0
	if layer == null:
		return moved
	for cell in layer.get_used_cells():
		var sid: int = layer.get_cell_source_id(cell)
		var atlas: Vector2i = layer.get_cell_atlas_coords(cell)
		var alt: int = layer.get_cell_alternative_tile(cell)
		if not map.has(sid):
			continue
		var src_map: Dictionary = map[sid]
		if not src_map.has(atlas):
			continue
		var cell_map: Dictionary = src_map[atlas]
		var new_alt: int = alt
		if alt != 0 and cell_map.has(alt):
			new_alt = cell_map[alt]
		if new_alt != alt:
			layer.set_cell(cell, sid, atlas, new_alt)
			moved += 1
	return moved

# ---------------------------------------------------------------- 风场

## 给一批格子生成分布：相位（错开摆动）+ 振幅（0 = 永不动）
static func make_sway_data(cells: Array[Vector2i], seed: int,
		still_ratio: float) -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = seed
	var phases := PackedFloat32Array()
	var amps := PackedInt32Array()
	for cell in cells:
		# x 系数最大 → 阵风波前大致从左往右推；再叠随机扰动打散
		phases.append(fposmod(float(cell.x) * 0.031 + float(cell.y) * 0.017 + rng.randf(), 1.0))
		var r := rng.randf()
		var amp := 0
		if r >= still_ratio:
			amp = 1 + int((r - still_ratio) / maxf(0.001, 1.0 - still_ratio) * 3.0)
		amps.append(amp)
	return {"phases": phases, "amps": amps}

## 某一株在时刻 t 的摇摆档
##   env 是 0→1→0 的阵风包络；gust 是整体风力（0.85~1.1）
static func sway_level(phase: float, amp: int, t: float, gust: float) -> int:
	if amp <= 0:
		return 0
	var env: float = pow(maxf(0.0, sin(PI * t)), 0.6)
	return clampi(int(round(float(amp) * env * gust)), 0, LEVELS - 1)

## 整体风力：一阵强一阵弱，范围 0.85 ~ 1.1
static func gust_at(time: float) -> float:
	return 0.975 + 0.125 * sin(time * 0.37)
