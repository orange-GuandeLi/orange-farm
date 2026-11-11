@tool
extends EditorScript
## 重建花和草的摇摆变体，并给 Vegetation 层挂上摇摆脚本。
##
## ★ 这个脚本不撒任何花和草 —— 花和草全部由你手画。
##
## ============================================================
## 【怎么跑】Godot 4.7 的 EditorScript 只有一个入口：
##   1. 在 FileSystem 面板双击本文件 → 进入「脚本编辑器」
##   2. 菜单栏 File → 最下面一项 Run（快捷键 Ctrl+Shift+X）
##   ※ 场景树右键 / Inspector 里都没有 Run，找不到是正常的
## ============================================================
##
## 【什么时候需要重跑】
##   · 改了 veg_lib.gd 里的 SWAY_ORIGIN（风向 / 幅度）或 OFFSET_ORIGIN（格内偏移）
##   · 想把现有格子的 alt id 迁移到新编码
##
## 【变体 id 编码】alt_id = level * 4 + offset   （范围 0..15）
##   level  = 摇摆档 0..3（0 直立，越大被风吹得越歪，方向统一）
##   offset = 格内偏移 0..3
##   alt_id = 0 就是 base tile 本身 → 你手画的植物（默认就是 base tile）
##            会直接被摇摆接管，不用做任何额外操作。

const VegLib = preload("res://scripts/world/veg_lib.gd")
const SWAY_SCRIPT := "res://scripts/world/vegetation_sway.gd"
const VEG_LAYER := "Vegetation"

## 改成 true = 顺便把这一层的植物全清空（想重新手画时用）
const CLEAR_FIRST := false

func _run() -> void:
	var root := EditorInterface.get_edited_scene_root()
	if root == null:
		push_error("没打开场景")
		return
	var layer := root.get_node_or_null(VEG_LAYER) as TileMapLayer
	if layer == null:
		push_error("场景里没有 %s 层" % VEG_LAYER)
		return
	if layer.tile_set == null:
		push_error("%s 没有 tile_set" % VEG_LAYER)
		return

	if CLEAR_FIRST:
		var n := layer.get_used_cells().size()
		for c in layer.get_used_cells():
			layer.erase_cell(c)
		print("清空了 %d 个格子" % n)

	# 重建变体：先记下旧变体 → 删掉 → 按新编码建 → 把格子的 alt id 迁移过来
	var rep: Dictionary = VegLib.rebuild_all(layer.tile_set)
	print("重建变体: 新建 %d 个" % rep["made"])
	var moved := VegLib.migrate_layer(layer, rep["map"])
	print("迁移 alt id: %d 个格子" % moved)

	# 挂摇摆脚本
	var sway := load(SWAY_SCRIPT)
	if sway is GDScript:
		layer.set_script(sway)
		print("已挂上 %s" % SWAY_SCRIPT)
	else:
		push_warning("找不到 %s，请手动挂到 %s 层上" % [SWAY_SCRIPT, VEG_LAYER])

	EditorInterface.save_scene()
	print("已保存。回场景按 F5 运行游戏看摇摆。")
