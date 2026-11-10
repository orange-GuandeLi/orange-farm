extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $BodySprite # 身体动画
@onready var hair_sprite: AnimatedSprite2D = $HairSprite # 头发动画
@onready var tool_sprite: AnimatedSprite2D = $ToolSprite # 工具动画
@export var soil: TileMapLayer
@export var select_box: SelectBox # 目标格高亮框

var facing := Vector2i.DOWN # 面向那里
const SPEED = 40.0 # 速度
var _busy := false # 是否在播放工具动画
var _target := Vector2i.ZERO # 目标块

# === 吸附（逐格移动）===
# 农夫当前所在的格。永远是精确的一格，不会骑在格线上
var _cell := Vector2i.ZERO
# 这一步：起点格 -> 终点格
var _from := Vector2i.ZERO
var _to := Vector2i.ZERO
# 这一步的进度 0~1，1 = 已经站到 _to 上
var _t := 1.0

func _ready() -> void:
	animation.animation_finished.connect(_on_animation_finished) # 身体动画播放完毕之后通知一个函数
	# 起点也对齐到格子，省得在场景里手改坐标
	_cell = _cell_of(position)
	_from = _cell
	_to = _cell
	_t = 1.0
	position = _cell_center(_cell)

func _physics_process(delta: float) -> void:
	_update_select_box() # 先更新高亮框（播动画期间也要跟着动）

	if _busy: # 如果在播工具动画，不响应其他动画
		_advance_step(delta)
		return

	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down") # 获取到四个方向的走动

	if direction != Vector2.ZERO:
		_update_facing(direction)

	# 站在格子上 -> 看输入决定走哪一格
	if _t >= 1.0 and direction != Vector2.ZERO:
		var step := _step_dir(direction)
		if _can_enter(_cell + step):
			_from = _cell
			_to = _cell + step
			_t = 0.0

	_advance_step(delta)

	if _t < 1.0: # 正在走这一步 -> 走路动画
		_play_anim("walk")
	else: # 站住了 -> idle
		_play_anim("idle")

	if Input.is_action_just_pressed("use_tool"):
		_start_tool("dig")

## 推进正在走的这一步（走到格子中心就停）
func _advance_step(delta: float) -> void:
	if _t >= 1.0:
		position = _cell_center(_cell)
		return
	_t = minf(1.0, _t + SPEED * delta / GameConfig.TILE_SIZE)
	position = _cell_center(_from).lerp(_cell_center(_to), _t)
	if _t >= 1.0:
		_cell = _to

## 走一格往哪走（主轴优先）
func _step_dir(direction: Vector2) -> Vector2i:
	if absf(direction.x) > absf(direction.y):
		return Vector2i.LEFT if direction.x < 0.0 else Vector2i.RIGHT
	return Vector2i.UP if direction.y < 0.0 else Vector2i.DOWN

## 这一格能不能站进去（问物理引擎有没有墙）
func _can_enter(cell: Vector2i) -> bool:
	var space := get_world_2d().direct_space_state
	var q := PhysicsShapeQueryParameters2D.new()
	q.shape = $CollisionShape2D.shape
	q.transform = Transform2D(0.0, _cell_center(cell) + $CollisionShape2D.position)
	q.collision_mask = 1
	var ignore: Array[RID] = [get_rid()]
	q.exclude = ignore
	return space.intersect_shape(q, 1).is_empty()

## 一个格子对应的节点位置
##   x = 16*列 + 8  -> 身体中心落在格子正中间
##   y = 16*(行+1)  -> 脚底线贴着这一行的底边
func _cell_center(c: Vector2i) -> Vector2:
	return Vector2(
		c.x * GameConfig.TILE_SIZE + GameConfig.TILE_SIZE * 0.5,
		(c.y + 1) * GameConfig.TILE_SIZE
	)

## 节点位置 -> 农夫当前所在格
##   横：身体中心所在的列
##   纵：身体中心所在的行
func _cell_of(p: Vector2) -> Vector2i:
	return Vector2i(
		floori(p.x / GameConfig.TILE_SIZE),
		floori((p.y - 8.0) / GameConfig.TILE_SIZE)
	)

func _update_facing(direction: Vector2) -> void:
	if Input.is_action_just_pressed("move_up"):     facing = Vector2i.UP
	elif Input.is_action_just_pressed("move_down"): facing = Vector2i.DOWN
	elif Input.is_action_just_pressed("move_left"): facing = Vector2i.LEFT
	elif Input.is_action_just_pressed("move_right"):facing = Vector2i.RIGHT
	else:
		# 兜底：没有新按键（长按/只松开一个）→ 取主轴
		if absf(direction.x) > absf(direction.y):
			facing = Vector2i.LEFT if direction.x < 0.0 else Vector2i.RIGHT
		else:
			facing = Vector2i.UP if direction.y < 0.0 else Vector2i.DOWN
	# 翻不翻由 _play_one 按方向决定，这里不碰 flip_h

func _start_tool(tool: String) -> void:
	var cell := _target_cell()
	if cell.x < 0 or cell.x >= GameConfig.FARM_SIZE.x or cell.y < 0 or cell.y >= GameConfig.FARM_SIZE.y:
		return
	if FarmData.is_tilled(cell):
		return

	_busy = true
	_play_anim("use_" + tool)
	_target = cell

	await get_tree().create_timer(0.45).timeout
	_apply_till(_target)

func _play_anim(base_name: String) -> void:
	var suffix := _dir_suffix()
	_play_one(animation, base_name, suffix)
	_play_one(hair_sprite, "hair_" + base_name, suffix)
	_play_one(tool_sprite, "tool_" + base_name, suffix)

## 播一个动作的方向版本：
##   1. 有带方向的版本就直接播
##   2. 没做这个方向 -> 借东(_e)顶替，朝西(_w)时再镜像一次
##   3. 方向无关的动作(锄地等) -> 播不带后缀的
func _play_one(sp: AnimatedSprite2D, anim_name: String, suffix: String) -> void:
	if sp.sprite_frames.has_animation(anim_name + suffix):
		sp.play(anim_name + suffix)
		sp.flip_h = false
		return
	if sp.sprite_frames.has_animation(anim_name + "_e"):
		sp.play(anim_name + "_e")
		sp.flip_h = suffix == "_w"
		return
	if sp.sprite_frames.has_animation(anim_name):
		sp.play(anim_name)
		sp.flip_h = suffix == "_w"

## 方向后缀：南 s=朝下 北 n=朝上 东 e=朝右 西 w=朝左
func _dir_suffix() -> String:
	match facing:
		Vector2i.UP: return "_n"
		Vector2i.LEFT: return "_w"
		Vector2i.RIGHT: return "_e"
	return "_s"

func _on_animation_finished() -> void:
	if animation.animation.begins_with("use_"):
		_busy = false

## 农夫当前所在的格
func _player_cell() -> Vector2i:
	return _cell

func _target_cell() -> Vector2i:
	var c := _player_cell()
	match facing:
		Vector2i.UP:    return c + Vector2i(0, -1)
		Vector2i.DOWN:  return c + Vector2i(0, 1)
		Vector2i.LEFT:  return c + Vector2i(-1, 0)
		Vector2i.RIGHT: return c + Vector2i(1, 0)
	return Vector2i(-999, -999)

## 更新目标格高亮框：能锄才显示，锄过的和越界的都藏起来
func _update_select_box() -> void:
	if select_box == null:
		return
	var cell := _target_cell()
	var can_dig: bool = cell.x >= 0 and cell.x < GameConfig.FARM_SIZE.x \
		and cell.y >= 0 and cell.y < GameConfig.FARM_SIZE.y \
		and not FarmData.is_tilled(cell)
	if can_dig:
		select_box.move_to(cell)
	else:
		select_box.hide_box()

func _apply_till(cell: Vector2i) -> void:
	if not FarmData.till(cell):
		return
	soil.till(cell)
