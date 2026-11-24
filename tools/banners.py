"""Writes the blocked and done poses as 120px PNGs for system notifications (nearest-neighbour, 5x).

Run after sprites.py:  python3 tools/banners.py      (needs Pillow)
"""
import os

from PIL import Image

import sprites

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mods", "flock", "banners")
SCALE = 5


def to_image(grid):
    im = Image.new("RGBA", (sprites.SIZE, sprites.SIZE), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c != ".":
                h = sprites.PALETTE[c].lstrip("#")
                im.putpixel((x, y), tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
    return im.resize((sprites.SIZE * SCALE, sprites.SIZE * SCALE), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in sprites.ANIMALS:
        poses = sprites.pose_grids(name)
        variants = {name: poses}
        if name in sprites.ALT_SWAPS:
            variants[f"{name}-alt"] = {k: sprites.swap_colours(v, sprites.ALT_SWAPS[name]) for k, v in poses.items()}
        for ident, grids in variants.items():
            for pose in ("blocked", "done"):
                to_image(grids[f"-{pose}"]).save(os.path.join(OUT, f"{ident}-{pose}.png"))


if __name__ == "__main__":
    main()
