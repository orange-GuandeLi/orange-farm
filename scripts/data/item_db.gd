class_name ItemDB
extends RefCounted

## 物品总表：只放静态定义（叫什么、图标在哪、属于哪类）。
## 数量和「背包里有哪些」归 Inventory 管，这里不存任何运行时状态。

## 物品分类
enum Type {
	CROP,       ## 作物收获物
	MATERIAL,   ## 材料
	LIVESTOCK,  ## 畜产
	SEED,       ## 种子
	CONTAINER,  ## 容器
}

## 作物图标取成熟期贴图（阶段 5）
const CROP_ICON_FMT := "res://assets/game/crops/%s_05.png"

## 非作物物品表。作物走 Crops.get_def()，名字不在这里重复抄一遍。
const DEFS := {
	&"wood": {
		"name": "木材",
		"icon": "res://assets/game/crops/wood.png",
		"type": Type.MATERIAL,
		"stack": 999,
	},
	&"stone": {
		"name": "石头",
		"icon": "res://assets/game/crops/rock.png",
		"type": Type.MATERIAL,
		"stack": 999,
	},
	&"egg": {
		"name": "鸡蛋",
		"icon": "res://assets/game/crops/egg.png",
		"type": Type.LIVESTOCK,
		"stack": 999,
	},
	&"milk": {
		"name": "牛奶",
		"icon": "res://assets/game/crops/milk.png",
		"type": Type.LIVESTOCK,
		"stack": 999,
	},
	&"fish": {
		"name": "鱼",
		"icon": "res://assets/game/crops/fish.png",
		"type": Type.LIVESTOCK,
		"stack": 999,
	},
	&"seed_generic": {
		"name": "种子",
		"icon": "res://assets/game/crops/seeds_generic.png",
		"type": Type.SEED,
		"stack": 999,
	},
	&"crate": {
		"name": "板条箱",
		"icon": "res://assets/game/crops/crate_top.png",
		"type": Type.CONTAINER,
		"stack": 99,
	},
}


## 取物品定义；未知 id 返回空字典
static func get_def(id: StringName) -> Dictionary:
	if DEFS.has(id):
		var d: Dictionary = DEFS[id].duplicate()
		d["id"] = id
		return d

	# 作物不在 DEFS 里，名字和成熟天数跟 Crops 表走
	var crop := Crops.get_def(id)
	if crop.is_empty():
		return {}
	return {
		"id": id,
		"name": crop["name"],
		"icon": CROP_ICON_FMT % String(id),
		"type": Type.CROP,
		"stack": 99,
	}


## 这个 id 是不是已知物品
static func has(id: StringName) -> bool:
	return not get_def(id).is_empty()


## 取图标纹理；未知物品返回 null
static func icon(id: StringName) -> Texture2D:
	var d := get_def(id)
	if d.is_empty():
		return null
	return load(d["icon"])


## 全部物品 id（作物 + 其他）
static func all_ids() -> Array[StringName]:
	var ids: Array[StringName] = []
	for c in Crops.DEFS:
		ids.append(c["id"])
	for k in DEFS:
		ids.append(k)
	return ids