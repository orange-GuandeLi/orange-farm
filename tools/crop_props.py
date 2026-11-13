#!/usr/bin/env python3
"""从 Sunnyside World 16px 图集中裁切装饰物精灵（树 / 灌木 / 石头）。

用法：
    python3 tools/crop_props.py                     # 默认裁全部
    python3 tools/crop_props.py --only pine_a rock_big
    python3 tools/crop_props.py --src <atlas.png> --out <dir>

图集授权：Sunnyside World（可免费商用、可修改；不可转售、不可用于训练 AI）。
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("需要 Pillow：pip install pillow")

DEFAULT_SRC = Path("assets/tileset/spr_tileset_sunnysideworld_16px.png")
DEFAULT_OUT = Path("assets-tmp/props")

# 名称 -> (x, y, w, h)，坐标基于 1024x1024 原图集的像素位置
RECTS: dict[str, tuple[int, int, int, int]] = {
    # 松树
    "pine_a": (833, 61, 14, 35),
    "pine_b": (823, 100, 18, 35),
    # 灌木（带果实）
    "bush_green": (788, 22, 24, 21),
    "bush_red": (788, 54, 24, 21),
    "bush_orange": (788, 86, 24, 21),
    "bush_small": (816, 65, 16, 15),
    # 石头
    "rock_big": (787, 340, 26, 25),
    "rock_mid": (820, 343, 24, 22),
    "rock_small": (855, 349, 18, 16),
    "rock_tiny": (883, 355, 10, 10),
    # 尖顶小屋（绿/橙/红/紫四套配色，纵向每套间隔 128px）
    "house_green": (520, 296, 32, 56),
    "house_orange": (520, 424, 32, 56),
    "house_red": (520, 552, 32, 56),
    "house_purple": (520, 680, 32, 56),
}

# 指定了输出目录的素材直接进正式资源目录；其余进 assets-tmp/props 备料区
DEST: dict[str, str] = {
    "house_green": "assets/game/house",
    "house_orange": "assets/game/house",
    "house_red": "assets/game/house",
    "house_purple": "assets/game/house",
}


def crop_all(src: Path, out: Path, only: list[str] | None) -> list[dict]:
    if not src.is_file():
        sys.exit(f"找不到图集：{src}")

    out.mkdir(parents=True, exist_ok=True)
    atlas = Image.open(src).convert("RGBA")

    names = list(RECTS) if not only else only
    unknown = [n for n in names if n not in RECTS]
    if unknown:
        sys.exit(f"未知名称：{', '.join(unknown)}；可选：{', '.join(RECTS)}")

    manifest: list[dict] = []
    for name in names:
        x, y, w, h = RECTS[name]
        # 越界检查
        if x + w > atlas.width or y + h > atlas.height:
            sys.exit(f"{name} 超出图集范围 {atlas.size}")
        crop = atlas.crop((x, y, x + w, y + h))
        dest = Path(DEST.get(name, out))
        dest.mkdir(parents=True, exist_ok=True)
        path = dest / f"{name}.png"
        crop.save(path)
        manifest.append(
            {
                "name": name,
                "file": path.name,
                "src_rect": [x, y, w, h],
                "size": [w, h],
            }
        )
        print(f"  {path}  {w}x{h}")

    (out / "props_manifest.json").write_text(
        json.dumps(
            {
                "source_atlas": str(src),
                "source_size": [atlas.width, atlas.height],
                "license": "Sunnyside World - 可商用/可修改，不可转售，不可用于训练 AI",
                "props": manifest,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"  {out / 'props_manifest.json'}")
    return manifest


def make_preview(out: Path) -> Path:
    """把所有裁好的精灵并排拼一张预览图，方便肉眼验收。"""
    files = sorted(p for p in out.glob("*.png"))
    if not files:
        sys.exit("没有可预览的 PNG")

    pad = 8
    scale = 3
    imgs = [(p.stem, Image.open(p).convert("RGBA")) for p in files]
    cell_w = max(i.width for _, i in imgs) + pad * 2
    cell_h = max(i.height for _, i in imgs) + pad * 2

    sheet = Image.new("RGBA", (cell_w * len(imgs), cell_h), (40, 40, 48, 255))
    for idx, (_, im) in enumerate(imgs):
        # 底部对齐：精灵的「着地点」在同一条线上
        ox = idx * cell_w + (cell_w - im.width) // 2
        oy = cell_h - pad - im.height
        sheet.alpha_composite(im, (ox, oy))
        # 红色底线 = 地面基准线
        for x in range(ox, ox + im.width):
            sheet.putpixel((x, cell_h - pad - 1), (255, 60, 60, 255))

    sheet = sheet.resize((sheet.width * scale, sheet.height * scale), Image.NEAREST)
    preview = out / "_preview_all.png"
    sheet.save(preview)
    print(f"  {preview}  {sheet.size}")
    return preview


def main() -> None:
    ap = argparse.ArgumentParser(description="裁切 Sunnyside 装饰物精灵")
    ap.add_argument("--src", type=Path, default=DEFAULT_SRC, help="源图集 PNG")
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT, help="输出目录")
    ap.add_argument("--only", nargs="+", default=None, help="只裁指定名称")
    ap.add_argument("--no-preview", action="store_true", help="不生成预览图")
    args = ap.parse_args()

    print(f"源图集：{args.src}")
    print(f"输出目录：{args.out}")
    crop_all(args.src, args.out, args.only)
    if not args.no_preview:
        make_preview(args.out)
    print("完成。")


if __name__ == "__main__":
    main()
