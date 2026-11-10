extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $BodySprite # 身体动画
@onready var hair_sprite: AnimatedSprite2D = $HairSprite # 头发动画
@onready var tool_sprite: AnimatedSprite2D = $ToolSprite # 工具动画
@export var soil: TileMapLayer

var facing := Vector2i.DOWN # 面向那里
const SPEED = 80.0 # 速度
var _busy := false # 是否在播放工具动画
const TILE_SIZE := 16 # 每个格子大小
const FARM_SIZE := Vector2i(40, 26) # 农场大小，用于判断是不是超出农场了
var _target := Vector2i.ZERO # 目标块

func _ready() -> void:
	animation.animation_finished.connect(_on_animation_finished) # 身体动画播放完毕之后通知一个函数

func _physics_process(delta: float) -> void:
	if _busy: # 如果在播工具动画，不响应其他动画
		velocity = Vector2.ZERO
		move_and_slide()
		return

	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down") # 获取到四个方向的走动

	if direction == Vector2.ZERO: # 如果没有任何方向输入，就idle
		_play_anim("idle")
	else: # 如果有方向就播放走路
		_play_anim("walk")

	velocity = direction * SPEED # 速度，矢量，有方向 + 速度

	move_and_slide() # 移动函数

	if direction != Vector2.ZERO:
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
	if facing.x != 0:
		var flip := facing.x < 0
		animation.flip_h = flip
		hair_sprite.flip_h = flip
		tool_sprite.flip_h = flip

	if Input.is_action_just_pressed("use_tool"):
		_start_tool("dig")

func _start_tool(tool: String) -> void:
	_busy = true
	_play_anim("use_" + tool)


	var cell := _target_cell()
	if cell.x < 0 or cell.x >= FARM_SIZE.x or cell.y < 0 or cell.y >= FARM_SIZE.y:
		return
	if FarmData.is_tilled(cell):
		return
	_target = cell

	await get_tree().create_timer(0.45).timeout
	_apply_till(_target)

func _play_anim(base_name: String) -> void:
	animation.play(base_name)
	hair_sprite.play("hair_" + base_name)
	tool_sprite.play("tool_" + base_name)

func _on_animation_finished() -> void:
	if animation.animation.begins_with("use_"):
		_busy = false;

func _player_cell() -> Vector2i:
	return Vector2i(
		int(floor(position.x / TILE_SIZE)),
		int(floor((position.y - 4.0) / TILE_SIZE))
	)

func _target_cell() -> Vector2i:
	var c := _player_cell()
	match facing:
		Vector2i.UP:    return c + Vector2i(0, -1)
		Vector2i.DOWN:  return c + Vector2i(0, 1)
		Vector2i.LEFT:  return c + Vector2i(-1, 0)
		Vector2i.RIGHT: return c + Vector2i(1, 0)
	return Vector2i(-999, -999)

func _apply_till(cell: Vector2i) -> void:
	if not FarmData.till(cell):
		return
	soil.till(cell)
