class_name Crops
extends RefCounted

## 作物总表：11 种 × 6 个生长阶段。
## 贴图路径按约定拼出来，不建 .tres —— 66 个纹理引用手写太累。

## 成熟所需天数（你来定，先填个大概值）
const DEFS := [
	{"id": &"parsnip",    "name": "欧防风", "days": 4},
	{"id": &"potato",     "name": "土豆",   "days": 6},
	{"id": &"kale",       "name": "羽衣甘蓝", "days": 6},
	{"id": &"radish",     "name": "萝卜",   "days": 6},
	{"id": &"beetroot",   "name": "甜菜",   "days": 7},
	{"id": &"carrot",     "name": "胡萝卜", "days": 7},
	{"id": &"cabbage",    "name": "卷心菜", "days": 11},
	{"id": &"cauliflower","name": "花椰菜", "days": 12},
	{"id": &"pumpkin",    "name": "南瓜",   "days": 13},
	{"id": &"sunflower",  "name": "向日葵", "days": 13},
	{"id": &"wheat",      "name": "小麦",   "days": 4},
]

const STAGE_COUNT := 6


static func get_def(crop_id: StringName) -> Dictionary:
	for d in DEFS:
		if d["id"] == crop_id:
			return d
	return {}


## 取某个作物的某个生长阶段的贴图
static func texture(crop_id: StringName, stage: int) -> Texture2D:
	var s: int = clampi(stage, 0, STAGE_COUNT - 1)
	return load("res://assets/game/crops/%s_%02d.png" % [crop_id, s])


## 生长天数 → 阶段号（0..5）。growth_days 达到 days 就满级（=5）
static func stage_of(crop_id: StringName, growth_days: int) -> int:
	var d := get_def(crop_id)
	if d.is_empty():
		return 0
	return clampi(int(float(growth_days) * STAGE_COUNT / float(d["days"])), 0, STAGE_COUNT - 1)


## 是否成熟
static func is_mature(crop_id: StringName, growth_days: int) -> bool:
	var d := get_def(crop_id)
	if d.is_empty():
		return false
	return growth_days >= int(d["days"])
