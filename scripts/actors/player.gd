extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $BodySprite # 身体动画
@onready var hair_sprite: AnimatedSprite2D = $HairSprite # 头发动画
@onready var tool_sprite: AnimatedSprite2D = $ToolSprite # 工具动画
@export var soil: TileMapLayer
@export var select_box: SelectBox # 目标格高亮框

var facing := Vector2i.DOWN # 面向那里
const SPEED = 60.0 # 速度
## 工具动作里"入土"那一刻占总时长的比例（use_dig 的落地帧 f9 在 0.69 处，取 0.7）
const TOOL_IMPACT_RATIO := 0.7
var _busy := false # 是否在播放工具动画

func _ready() -> void:
	animation.animation_finished.connect(_on_animation_finished)
	# 俯视角：不要重力/地面逻辑，move_and_slide 才是 2D 自由移动
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING

func _physics_process(_delta: float) -> void:
	_update_select_box() # 先更新高亮框（播动画期间也要跟着动）

	if _busy: # 工具动画期间锁移动
		velocity = Vector2.ZERO
		return

	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")
	if direction != Vector2.ZERO:
		_update_facing(direction)

	velocity = direction * SPEED
	move_and_slide()

	_play_anim("walk" if velocity.length() > 1.0 else "idle")

	if Input.is_action_just_pressed("use_tool"):
		_start_tool("dig")

## 节点位置（脚底）-> 脚下所在的格
##   脚底 y 落在 [r*16, (r+1)*16) 就是第 r 行
func _cell_of(p: Vector2) -> Vector2i:
	return Vector2i(
		floori(p.x / GameConfig.TILE_SIZE),
		floori((p.y - 1.0) / GameConfig.TILE_SIZE)
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
	var anim := _play_anim("use_" + tool)
	if anim == &"":
		# 没有这个工具动画：别把玩家锁死，也不改地块
		_busy = false
		return

	# 等锄头落地再改地块：时长从动画本身算，改帧数/速度时不用再动这里
	await get_tree().create_timer(_anim_duration(animation, anim) * TOOL_IMPACT_RATIO).timeout
	_apply_till(cell)

## 三层一起播；返回身体层实际播放的动画名（回退链解析后的结果）
func _play_anim(base_name: String) -> StringName:
	var suffix := _dir_suffix()
	var body_anim := _play_one(animation, base_name, suffix)
	_play_one(hair_sprite, "hair_" + base_name, suffix)
	_play_one(tool_sprite, "tool_" + base_name, suffix)
	return body_anim

## 播一个动作的方向版本：
##   1. 有带方向的版本就直接播
##   2. 没做这个方向 -> 借东(_e)顶替，朝西(_w)时再镜像一次
##   3. 方向无关的动作(锄地等) -> 播不带后缀的
func _play_one(sp: AnimatedSprite2D, anim_name: String, suffix: String) -> StringName:
	var dir_anim := StringName(anim_name + suffix)
	if sp.sprite_frames.has_animation(dir_anim):
		sp.play(dir_anim)
		sp.flip_h = false
		return dir_anim
	var east_anim := StringName(anim_name + "_e")
	if sp.sprite_frames.has_animation(east_anim):
		sp.play(east_anim)
		sp.flip_h = suffix == "_w"
		return east_anim
	var plain_anim := StringName(anim_name)
	if sp.sprite_frames.has_animation(plain_anim):
		sp.play(plain_anim)
		sp.flip_h = suffix == "_w"
		return plain_anim
	return &""

## 一个动画播一遍要多久（秒）；动画不存在或速度非正时返回 0
func _anim_duration(sp: AnimatedSprite2D, anim: StringName) -> float:
	if sp.sprite_frames == null or anim == &"":
		return 0.0
	var frames := sp.sprite_frames.get_frame_count(anim)
	var fps := sp.sprite_frames.get_animation_speed(anim)
	if frames <= 0 or fps <= 0.0 or sp.speed_scale <= 0.0:
		return 0.0
	return float(frames) / fps / sp.speed_scale

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
	return _cell_of(position)

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
