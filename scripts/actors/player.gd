extends CharacterBody2D

@onready var animation: AnimatedSprite2D = $AnimatedSprite2D
var facing := 1

const SPEED = 80.0

func _physics_process(delta: float) -> void:
	# Get the input direction and handle the movement/deceleration.
	# As good practice, you should replace UI actions with custom gameplay actions.
	var direction := Input.get_vector("move_left", "move_right", "move_up", "move_down")

	if direction == Vector2.ZERO:
		animation.play("idle")
	else:
		animation.play("walk")

	velocity = direction * SPEED

	move_and_slide()

	if direction.x < 0:
		facing = -1
	elif direction.x > 0:
		facing = 1

	animation.flip_h = facing < 0
