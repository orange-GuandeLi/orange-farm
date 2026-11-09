extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $BodySprite
@onready var hair_sprite: AnimatedSprite2D = $HairSprite
@onready var tool_sprite: AnimatedSprite2D = $ToolSprite

var facing := Vector2i.DOWN
const SPEED = 80.0

func _play_anim(base_name: String) -> void:
	animation.play(base_name)
	hair_sprite.play("hair_" + base_name)
	tool_sprite.play("tool_" + base_name)

func _physics_process(delta: float) -> void:
	# Get the input direction and handle the movement/deceleration.
	# As good practice, you should replace UI actions with custom gameplay actions.
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	if direction == Vector2.ZERO:
		_play_anim("idle")
	else:
		_play_anim("walk")

	velocity = direction * SPEED

	move_and_slide()

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
