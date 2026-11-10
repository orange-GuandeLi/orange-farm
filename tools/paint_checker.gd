@tool
extends EditorScript

## 一次性工具：把 Ground 铺成 80×45 的 a/b 棋盘
## 用法：打开 scenes/main.tscn → 脚本编辑器打开本文件 → File → Run → 回场景 Ctrl+S

const TILE_A := Vector2i(1, 1)
const TILE_B := Vector2i(2, 1)
const SOURCE_ID := 0
const W := 80
const H := 45

func _run() -> void:
	var root := get_editor_interface().get_edited_scene_root()
	if root == null or root.name != "Main":
		push_error("请先打开 scenes/main.tscn")
		return

	var ground: TileMapLayer = root.get_node("Ground")
	ground.clear()
	for y in H:
		for x in W:
			var tile := TILE_A if (x + y) % 2 == 0 else TILE_B
			ground.set_cell(Vector2i(x, y), SOURCE_ID, tile)
	print("Ground 已铺成 ", W, "x", H, " 棋盘")
