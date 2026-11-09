#!/usr/bin/env python3
"""
hat_layer.py —— 角色图层合成 / 帽子装备工具

素材包的真实结构（实测确认）：
    base_*      完整角色（身体 + 光头 + 脸）        高 16 行
    <x>hair_*   只有头发的图层（不含脸、不含身体）  高 8–14 行
    tools_*     只有手 + 工具的图层                持械动作才有内容

    完整角色 = base + hair + tools  （三层 alpha 叠加，同坐标系同帧节奏）

因此帽子 = 第四层。本工具负责：
    ref      输出"参考帧"（base+hair 合成好、带坐标标注），美术直接在这张图上画帽子
    anchor   扫描每个动作每一帧的脸部锚点（决定帽子怎么跟随）
    bake     把 base + hair + hat + tools 合成成最终 strip
    preview  生成左右对照图，肉眼验收

命令示例：
  # 1) 参考帧：美术画帽子的画布
  python3 tools/hat_layer.py ref --dir assets/Characters/Human \
      --hair bowlhair --out /tmp/ref_bowlhair.png

  # 2) 锚点表
  python3 tools/hat_layer.py anchor --dir assets/Characters/Human \
      --variant base --out assets/data/human_face_anchors.json

  # 3) 合成（帽子 PNG 必须是 96x64）
  python3 tools/hat_layer.py bake --dir assets/Characters/Human \
      --hair bowlhair --tools --hat /tmp/hat.png \
      --anchors assets/data/human_face_anchors.json \
      --out-dir assets/Characters/Human_baked --actions IDLE WALKING AXE

  # 4) 预览
  python3 tools/hat_layer.py preview --dir assets/Characters/Human \
      --hair bowlhair --hat /tmp/hat.png \
      --anchors assets/data/human_face_anchors.json \
      --out /tmp/preview.png --actions IDLE AXE
"""

import argparse
import json
import os
import sys
from collections import deque

from PIL import Image, ImageDraw

FRAME_W, FRAME_H = 96, 64

# 肤色阈值：实测 20 动作 × 全部帧，每帧恰好 1 个连通域
SKIN = dict(r_min=195, g_min=145, b_min=100, b_max=210)


# ---------------------------------------------------------------- 像素工具

def skin_mask(img):
    px = img.load()
    w, h = img.size
    m = [[0] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 0 and r >= SKIN["r_min"] and g >= SKIN["g_min"] and SKIN["b_min"] < b < SKIN["b_max"]:
                m[y][x] = 1
    return m


def components(mask, w, h, min_size=6):
    seen = [[0] * w for _ in range(h)]
    out = []
    for y in range(h):
        for x in range(w):
            if mask[y][x] and not seen[y][x]:
                q = deque([(x, y)])
                seen[y][x] = 1
                pts = []
                while q:
                    cx, cy = q.popleft()
                    pts.append((cx, cy))
                    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                        nx, ny = cx + dx, cy + dy
                        if 0 <= nx < w and 0 <= ny < h and mask[ny][nx] and not seen[ny][nx]:
                            seen[ny][nx] = 1
                            q.append((nx, ny))
                xs = [p[0] for p in pts]
                ys = [p[1] for p in pts]
                out.append({
                    "n": len(pts),
                    "x0": min(xs), "y0": min(ys),
                    "x1": max(xs), "y1": max(ys),
                    "cx": sum(xs) / len(xs),
                })
    return out


def find_face(img):
    """脸部左上角 (x, y)；找不到返回 None。"""
    w, h = img.size
    comps = [c for c in components(skin_mask(img), w, h) if c["n"] >= 6]
    if not comps:
        return None
    best = min(comps, key=lambda c: (c["y0"], abs(c["cx"] - 48)))
    return (best["x0"], best["y0"])


def bbox(img):
    px = img.load()
    w, h = img.size
    pts = [(x, y) for y in range(h) for x in range(w) if px[x, y][3] > 0]
    if not pts:
        return None
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), min(ys), max(xs), max(ys))


# ---------------------------------------------------------------- 素材扫描

def list_strips(char_dir, variant):
    """{动作名: png 路径}"""
    out = {}
    if not os.path.isdir(char_dir):
        return out
    for action in sorted(os.listdir(char_dir)):
        d = os.path.join(char_dir, action)
        if not os.path.isdir(d):
            continue
        for f in sorted(os.listdir(d)):
            if f.startswith(variant + "_") and f.endswith(".png"):
                out[action] = os.path.join(d, f)
                break
    return out


def frame_count(png_path):
    return Image.open(png_path).width // FRAME_W


def load_frame(path, i):
    im = Image.open(path).convert("RGBA")
    return im.crop((i * FRAME_W, 0, i * FRAME_W + FRAME_W, FRAME_H))


def find_strip(char_dir, action, variant):
    for f in sorted(os.listdir(os.path.join(char_dir, action))):
        if f.startswith(variant + "_") and f.endswith(".png"):
            return os.path.join(char_dir, action, f)
    return None


def face_at(faces, i):
    """第 i 帧的脸部位置；检测失败时回退到最近的可用帧。"""
    if faces[i]:
        return tuple(faces[i])
    for step in range(1, len(faces)):
        if i - step >= 0 and faces[i - step]:
            return tuple(faces[i - step])
        if i + step < len(faces) and faces[i + step]:
            return tuple(faces[i + step])
    return None


def shift(img, dx, dy):
    if dx == 0 and dy == 0:
        return img.copy()
    return img.transform(img.size, Image.AFFINE, (1, 0, -dx, 0, 1, -dy),
                         resample=Image.NEAREST)


# ---------------------------------------------------------------- ref

def cmd_ref(args):
    """输出参考帧：base + hair 合成 + 坐标标注，美术在这上面画帽子。"""
    p = find_strip(args.dir, "IDLE", "base")
    if p is None:
        sys.exit("[!] 找不到 IDLE/base")
    composed = load_frame(p, 0)
    if args.hair:
        hp = find_strip(args.dir, "IDLE", args.hair)
        if hp:
            composed = Image.alpha_composite(composed, load_frame(hp, 0))
        else:
            sys.exit(f"[!] 找不到 IDLE/{args.hair}")

    Z = args.zoom
    big = composed.resize((FRAME_W * Z, FRAME_H * Z), Image.NEAREST)
    canvas = Image.new("RGBA", (FRAME_W * Z, FRAME_H * Z), (45, 45, 55, 255))
    canvas.paste(big, (0, 0), big)
    d = ImageDraw.Draw(canvas)
    for x in range(0, FRAME_W + 1, 8):
        d.line([(x * Z, 0), (x * Z, FRAME_H * Z)], fill=(70, 70, 85, 255))
    for y in range(0, FRAME_H + 1, 8):
        d.line([(0, y * Z), (FRAME_W * Z, y * Z)], fill=(70, 70, 85, 255))
    for x in range(0, FRAME_W + 1, 4):
        d.line([(x * Z, 0), (x * Z, 12)], fill=(120, 120, 140, 255))
        d.line([(0, x * Z), (12, x * Z)], fill=(120, 120, 140, 255))
    d.text((2, 2), "参考帧 96x64  grid=8", fill=(255, 255, 0, 255))
    canvas.save(args.out)
    print(f"[OK] 参考帧已写入 {args.out}  (放大 {Z}x)")
    print("     美术在这张图上直接画帽子，导出成 96x64 透明 PNG")


# ---------------------------------------------------------------- anchor

def cmd_anchor(args):
    strips = list_strips(args.dir, args.variant)
    if not strips:
        sys.exit(f"[!] 在 {args.dir} 下找不到变体 '{args.variant}'")
    result = {}
    ref = None
    for action, path in strips.items():
        im = Image.open(path).convert("RGBA")
        n = frame_count(path)
        faces = []
        for i in range(n):
            fr = im.crop((i * FRAME_W, 0, i * FRAME_W + FRAME_W, FRAME_H))
            faces.append(find_face(fr))
        missing = [i for i, f in enumerate(faces) if f is None]
        result[action] = faces
        if action == "IDLE":
            ref = faces[0]
        xs = [f[0] for f in faces if f]
        ys = [f[1] for f in faces if f]
        flag = "  [!! 有帧检不到，将回退]" if missing else ""
        print(f"  {action:11s} {n:2d}帧  脸x∈[{min(xs)},{max(xs)}] y∈[{min(ys)},{max(ys)}]"
              f"  位移最大({max(xs)-min(xs)},{max(ys)-min(ys)}){flag}")

    out = {
        "frame_size": [FRAME_W, FRAME_H],
        "reference_face": list(ref) if ref else [44, 24],
        "variant": args.variant,
        "actions": result,
    }
    os.makedirs(os.path.dirname(os.path.abspath(args.out)), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fp:
        json.dump(out, fp, ensure_ascii=False, indent=1)
    print(f"[OK] 锚点已写入 {args.out}  (参考帧脸部 {ref})")


# ---------------------------------------------------------------- bake

def compose_frame(char_dir, action, i, hair, use_tools, hat, ref, faces):
    """合成一帧：base → hair → hat(按脸部位移) → tools"""
    bp = find_strip(char_dir, action, "base")
    if bp is None:
        return None
    img = load_frame(bp, i)
    if hair:
        hp = find_strip(char_dir, action, hair)
        if hp:
            img = Image.alpha_composite(img, load_frame(hp, i))
    if hat is not None:
        face = face_at(faces, i)
        if face is not None:
            img = Image.alpha_composite(img, shift(hat, face[0] - ref[0], face[1] - ref[1]))
    if use_tools:
        tp = find_strip(char_dir, action, "tools")
        if tp:
            img = Image.alpha_composite(img, load_frame(tp, i))
    return img


def cmd_bake(args):
    with open(args.anchors, encoding="utf-8") as fp:
        anchors = json.load(fp)
    ref = tuple(anchors["reference_face"])

    hat = None
    if args.hat:
        hat = Image.open(args.hat).convert("RGBA")
        if hat.size != (FRAME_W, FRAME_H):
            sys.exit(f"[!] 帽子图必须是 {FRAME_W}x{FRAME_H}（当前 {hat.size[0]}x{hat.size[1]}）")

    strips = list_strips(args.dir, "base")
    os.makedirs(args.out_dir, exist_ok=True)
    wanted = args.actions or sorted(strips.keys())
    report = []

    for action in wanted:
        bp = find_strip(args.dir, action, "base")
        if bp is None:
            continue
        faces = anchors["actions"].get(action) or []
        im = Image.open(bp).convert("RGBA")
        n = frame_count(bp)
        for i in range(n):
            fr = compose_frame(args.dir, action, i, args.hair, args.tools, hat, ref, faces)
            if fr is not None:
                im.paste(fr, (i * FRAME_W, 0))
        out_path = os.path.join(args.out_dir, os.path.basename(bp))
        im.save(out_path)
        report.append((action, out_path, n))

    print(f"[OK] 已合成 {len(report)} 个动作 → {args.out_dir}")
    for action, p, n in report:
        print(f"       {action:11s} {n:2d}帧 → {p}")


# ---------------------------------------------------------------- preview

def cmd_preview(args):
    """左右对照：左=base+hair，右=加上帽子。每个动作一行。"""
    with open(args.anchors, encoding="utf-8") as fp:
        anchors = json.load(fp)
    ref = tuple(anchors["reference_face"])
    hat = Image.open(args.hat).convert("RGBA") if args.hat else None
    Z = args.zoom
    cw, ch = FRAME_W * Z, FRAME_H * Z
    GAP, LABEL = 10, 70

    rows = []
    for action in args.actions:
        bp = find_strip(args.dir, action, "base")
        n = frame_count(bp)
        faces = anchors["actions"].get(action) or []
        cells = []
        for i in range(n):
            left = compose_frame(args.dir, action, i, args.hair, args.tools, None, ref, faces)
            right = compose_frame(args.dir, action, i, args.hair, args.tools, hat, ref, faces)
            cells.append((left, right))
        rows.append((action, cells))

    max_frames = max(len(c) for _, c in rows)
    canvas = Image.new("RGBA", (LABEL + max_frames * (cw * 2 + GAP), len(rows) * ch), (45, 45, 55, 255))
    d = ImageDraw.Draw(canvas)
    y = 0
    for action, cells in rows:
        d.text((6, y + ch // 2), action, fill=(255, 255, 0, 255))
        for i, (left, right) in enumerate(cells):
            x = LABEL + i * (cw * 2 + GAP)
            for k, cell in enumerate((left, right)):
                if cell is None:
                    continue
                big = cell.resize((cw, ch), Image.NEAREST)
                canvas.paste(big, (x + k * cw, y), big)
        y += ch
    canvas.save(args.out)
    print(f"[OK] 预览已写入 {args.out}  ({canvas.size[0]}x{canvas.size[1]})")


# ---------------------------------------------------------------- CLI

def main():
    ap = argparse.ArgumentParser(description="角色图层合成 / 帽子装备工具")
    sub = ap.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("ref", help="输出参考帧（美术画帽子的画布）")
    p.add_argument("--dir", required=True)
    p.add_argument("--hair", default=None)
    p.add_argument("--out", required=True)
    p.add_argument("--zoom", type=int, default=8)
    p.set_defaults(func=cmd_ref)

    p = sub.add_parser("anchor", help="扫描每帧脸部锚点")
    p.add_argument("--dir", required=True)
    p.add_argument("--variant", default="base")
    p.add_argument("--out", required=True)
    p.set_defaults(func=cmd_anchor)

    p = sub.add_parser("bake", help="合成 base+hair+hat+tools")
    p.add_argument("--dir", required=True)
    p.add_argument("--hair", default=None)
    p.add_argument("--tools", action="store_true", help="叠加工具层")
    p.add_argument("--hat", default=None)
    p.add_argument("--anchors", required=True)
    p.add_argument("--out-dir", required=True)
    p.add_argument("--actions", nargs="*")
    p.set_defaults(func=cmd_bake)

    p = sub.add_parser("preview", help="左右对照预览")
    p.add_argument("--dir", required=True)
    p.add_argument("--hair", default=None)
    p.add_argument("--tools", action="store_true")
    p.add_argument("--hat", default=None)
    p.add_argument("--anchors", required=True)
    p.add_argument("--out", required=True)
    p.add_argument("--actions", nargs="+", required=True)
    p.add_argument("--zoom", type=int, default=6)
    p.set_defaults(func=cmd_preview)

    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
