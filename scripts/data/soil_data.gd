class_name SoilData
extends Resource

## 地块主状态
enum State {
	UNTILLED,   ## 未开垦（普通地面）
	TILLED,     ## 已锄好，空地
	SEEDED,     ## 已播种
	GROWING,    ## 生长中
	MATURE,     ## 可收获
}

@export var state: State = State.UNTILLED

## 浇水标记（与生长阶段正交 —— 星露谷里"第3天生长中 + 已浇水"是同时成立的）
@export var watered := false

## 连续浇了几天水
@export var watered_days := 0

## 种的是什么（M2b 接作物）
@export var crop_id: StringName = &""

## 已经长了几天的作物
@export var growth_days := 0