"""Draws the Servers and Worktrees sections the way the mod draws them, from the ranch's own sprites:
  - onto the empty part of the sidebar in the window screenshots (layouts/Herdr-Ranch.png, assets/preview-dusk.png,
    preview-light.png), once; running it again repaints the same pixels, and
  - as its own picture, assets/servers-worktrees.png, with a running server, a stopped one and four worktrees.

Run:  python3 tools/sections_picture.py          (needs Pillow, macOS fonts)
The names and numbers are made up, like in the other pictures.
"""
import os

from PIL import Image, ImageDraw, ImageFont

import sprites

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SF = "/System/Library/Fonts/SFNS.ttf"

THEMES = {
    "dark": dict(fg=(244, 234, 242), muted=(209, 179, 202), dim=(185, 149, 176), border=(143, 79, 128),
                 gold=(242, 199, 68), on_gold=(51, 6, 43), red=(255, 123, 123), green=(111, 207, 151),
                 violet=(182, 156, 245), accent=(242, 199, 68)),
    "light": dict(fg=(36, 50, 26), muted=(62, 79, 46), dim=(88, 107, 68), border=(143, 165, 106),
                  gold=(47, 111, 47), on_gold=(247, 245, 230), red=(190, 50, 50), green=(40, 130, 70),
                  violet=(110, 80, 200), accent=(47, 111, 47)),
}


def font(size, weight="Regular"):
    f = ImageFont.truetype(SF, max(1, round(size)))
    try:
        f.set_variation_by_name(weight)
    except Exception:  # an older font file: the regular weight is fine
        pass
    return f


def grid_image(grid, scale, colours=None):
    n = len(grid)
    im = Image.new("RGBA", (n, n), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c != ".":
                h = (colours or sprites.PALETTE)[c].lstrip("#")
                im.putpixel((x, y), tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
    return im.resize((round(n * scale), round(n * scale)), Image.NEAREST)


def critter(name, pose, size):
    return grid_image(sprites.pose_grids(name)[pose], size / sprites.SIZE)


def icon(name, size, light=False):
    grid = sprites.ui_icon_grids()[name]
    pal = dict(sprites.PALETTE)
    if name == "ui-x":
        pal["w"] = "#586b44" if light else "#f4eaf2"
    if name == "ui-up":
        pal["o"] = "#f7f5e6" if light else "#33062b"
    return grid_image(grid, size / len(grid), pal)


def tree(n, size):
    grid = sprites.tree_grids()[f"tree-{n}"]
    return grid_image(grid, size / len(grid))


class Pen:
    """Everything is drawn at 1600px-wide coordinates and multiplied by `s`."""

    def __init__(self, img, s, theme):
        self.img, self.s, self.d, self.c = img, s, ImageDraw.Draw(img, "RGBA"), THEMES[theme]
        self.light = theme == "light"

    def text(self, x, y, text, size, colour, weight="Regular"):
        self.d.text((x * self.s, y * self.s), text, font=font(size * self.s, weight), fill=colour)
        return self.d.textlength(text, font=font(size * self.s, weight)) / self.s

    def box(self, x0, y0, x1, y1, r, fill=None, outline=None, width=1):
        s = self.s
        self.d.rounded_rectangle((x0 * s, y0 * s, x1 * s, y1 * s), r * s, fill=fill, outline=outline, width=max(1, round(width * s)))

    def paste(self, im, x, y):
        self.img.paste(im, (round(x * self.s), round(y * self.s)), im)

    def heading(self, x0, x1, y, label, right=None):
        self.text(x0 + 7, y, label, 11, self.c["dim"])
        if right is not None:
            w = self.d.textlength(right, font=font(11 * self.s)) / self.s
            self.text(x1 - 7 - w, y, right, 11, self.c["dim"])

    def server_card(self, x0, x1, y, port, program, where, name, stopped=False):
        c = self.c
        self.box(x0, y, x1, y + 42, 8, outline=c["red"] if stopped else c["border"])
        self.paste(critter(name, "-blocked" if stopped else "", 28 * self.s), x0 + 8, y + 7)
        plate = f":{port}"
        px = x0 + 46
        pw = self.text(px, y + 7, plate, 12, c["red"] if stopped else c["accent"], "Semibold")
        self.text(px + pw + 6, y + 7, "stopped" if stopped else program, 12, c["muted"] if stopped else c["fg"])
        self.text(px, y + 25, where, 10, c["dim"])
        if stopped:
            self.paste(icon("ui-play", 10 * self.s), x1 - 62, y + 17)
            self.text(x1 - 48, y + 15, "Restart", 11, c["gold"])
        else:
            self.paste(icon("ui-x", 10 * self.s, self.light), x1 - 22, y + 16)

    def worktrees(self, x0, x1, y, repo, rows):
        c = self.c
        self.heading(x0, x1, y, "Worktrees")
        self.text(x0 + 7, y + 24, repo, 10.5, c["dim"])
        self.box(x1 - 28, y + 20, x1 - 6, y + 40, 6, fill=(255, 255, 255, 28))
        self.paste(icon("ui-plus", 10 * self.s, self.light), x1 - 22, y + 25)
        yy = y + 44
        for i, (branch, kind, badge, tag) in enumerate(rows):
            line = tuple(c["dim"]) + (170,)
            last = i == len(rows) - 1
            sc = self.s
            vx = round((x0 + 18) * sc)
            self.d.line((vx, round((yy - 2) * sc), vx, round((yy + (12 if last else 26)) * sc)), fill=line, width=max(1, round(sc)))
            self.d.line((vx, round((yy + 12) * sc), round((x0 + 27) * sc), round((yy + 12) * sc)), fill=line, width=max(1, round(sc)))
            self.paste(tree(kind, 16 * self.s), x0 + 30, yy + 4)
            self.text(x0 + 52, yy + 5, branch, 11.5, c["fg"] if tag in ("main", "open") else c["muted"])
            right = x1 - 8
            tw = self.d.textlength(tag, font=font(10 * self.s)) / self.s
            self.text(right - tw, yy + 7, tag, 10, c["accent"] if tag in ("main", "open") else c["dim"])
            if badge:
                text, colour = badge
                bw = self.d.textlength(text, font=font(10 * self.s)) / self.s
                self.text(right - tw - 8 - bw, yy + 7, text, 10, c[colour])
            yy += 26
        return yy


def update_pill(pen, x1, y, text="Update to v0.2.0"):
    """The gold (green in the light theme) Update button as it sits in the status bar, left of CPU."""
    c = pen.c
    w = pen.d.textlength(text, font=font(11 * pen.s, "Semibold")) / pen.s + 32
    x0 = x1 - w
    pen.box(x0, y, x1, y + 17, 5, fill=c["gold"])
    pen.paste(icon("ui-up", 10 * pen.s, pen.light), x0 + 7, y + 3)
    pen.text(x0 + 21, y + 2.5, text, 11, c["on_gold"], "Semibold")


def patch_screenshot(path, theme):
    img = Image.open(path).convert("RGB")
    s = img.size[0] / 1600
    bg = img.getpixel((round(113 * s), round(392 * s)))  # blank sidebar, below where the cards go
    ImageDraw.Draw(img).rectangle((0, round(230 * s), round(226 * s), round(405 * s)), fill=bg)
    pen = Pen(img, s, theme)
    pen.heading(0, 227, 236, "Servers", "2")
    pen.server_card(7, 220, 254, 3000, "node", "api-server · 2h", "pig")
    pen.server_card(7, 220, 300, 5173, "vite", "web-app \u00b7 41m", "cat")
    # the Update button as it looks when a newer release is out, left of CPU in the status bar
    bar = img.getpixel((round(1030 * s), round(996 * s)))
    ImageDraw.Draw(img).rectangle((round(1030 * s), round(985 * s), round(1172 * s), round(1005 * s)), fill=bar)
    update_pill(pen, 1170, 987)
    img.save(path)


def standalone(path, theme="dark", s=2):
    w, h = 228, 372
    bg = (63, 15, 56) if theme == "dark" else (188, 201, 157)
    img = Image.new("RGB", (round(w * s), round(h * s)), bg)
    pen = Pen(img, s, theme)
    pen.heading(0, 227, 10, "Servers", "2")
    pen.server_card(7, 220, 30, 3000, "node", "api-server · 2h", "pig")
    pen.server_card(7, 220, 76, 8123, "", "python -m http.server", "frog", stopped=True)
    pen.worktrees(0, 227, 134, "api-server", [
        ("main", 5, None, "main"),
        ("fix/login-timeout", 3, ("#14 ✓", "green"), "open"),
        ("feat/rate-limit", 1, ("#15 merged", "violet"), "+ open"),
        ("chore/deps", 1, None, "+ open"),
    ])
    img.save(path)


def main():
    patch_screenshot(os.path.join(ROOT, "layouts", "Herdr-Ranch.png"), "dark")
    patch_screenshot(os.path.join(ROOT, "assets", "preview-dusk.png"), "dark")
    patch_screenshot(os.path.join(ROOT, "preview-light.png"), "light")
    os.makedirs(os.path.join(ROOT, "assets"), exist_ok=True)
    standalone(os.path.join(ROOT, "assets", "servers-worktrees.png"))
    # the status bar with the Update button, for the README
    bar = Image.open(os.path.join(ROOT, "layouts", "Herdr-Ranch.png")).convert("RGB")
    bar.crop((560, 972, 1600, 1006)).resize((2080, 68), Image.LANCZOS).save(os.path.join(ROOT, "assets", "update-button.png"))


if __name__ == "__main__":
    main()
