"""Draws preview.png, the gallery picture: pixel title, what it is, three feature callouts,
the real window and the animals on a fence. Everything is drawn in code from the ranch's own sprites.

Run:  python3 tools/preview_banner.py [window-screenshot.png]      (needs Pillow)
The screenshot defaults to layouts/Herdr-Ranch.png.
"""
import os
import random
import sys

from PIL import Image, ImageDraw, ImageFilter, ImageFont

import sprites

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
W, H = 1600, 1000
GOLD, CREAM, PLUM, DEEP = (242, 199, 68), (250, 240, 222), (69, 9, 58), (42, 6, 38)
FONT = "/System/Library/Fonts/Avenir Next.ttc"
HEAVY, BOLD, MED = 8, 0, 5

# 5x7 letters for the pixel title
GLYPHS = {
    "H": ["X...X", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
    "E": ["XXXXX", "X....", "X....", "XXXX.", "X....", "X....", "XXXXX"],
    "R": ["XXXX.", "X...X", "X...X", "XXXX.", "X.X..", "X..X.", "X...X"],
    "D": ["XXXX.", "X...X", "X...X", "X...X", "X...X", "X...X", "XXXX."],
    "A": [".XXX.", "X...X", "X...X", "XXXXX", "X...X", "X...X", "X...X"],
    "N": ["X...X", "XX..X", "X.X.X", "X..XX", "X...X", "X...X", "X...X"],
    "C": [".XXXX", "X....", "X....", "X....", "X....", "X....", ".XXXX"],
}


def font(size, idx=HEAVY):
    return ImageFont.truetype(FONT, size, index=idx)


def sprite(name, pose, scale):
    grid = sprites.pose_grids(name)[pose]
    im = Image.new("RGBA", (sprites.SIZE, sprites.SIZE), (0, 0, 0, 0))
    for y, row in enumerate(grid):
        for x, c in enumerate(row):
            if c != ".":
                h = sprites.PALETTE[c].lstrip("#")
                im.putpixel((x, y), tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,))
    return im.resize((sprites.SIZE * scale, sprites.SIZE * scale), Image.NEAREST)


def background():
    bg = Image.new("RGB", (W, H))
    px = bg.load()
    for y in range(H):
        t = y / H
        for x in range(W):
            # plum sky fading into a dark meadow, with a warm glow behind the title
            c = [DEEP[i] + (PLUM[i] - DEEP[i]) * (1 - abs(t - 0.35) * 1.4) for i in range(3)]
            px[x, y] = tuple(max(0, min(255, int(v))) for v in c)
    glow = Image.new("RGB", (W, H), (0, 0, 0))
    ImageDraw.Draw(glow).ellipse((300, -260, 1300, 360), fill=(120, 40, 70))
    glow = glow.filter(ImageFilter.GaussianBlur(160))
    bg = Image.blend(bg, Image.eval(glow, lambda v: v), 0).convert("RGB")
    from PIL import ImageChops
    bg = ImageChops.add(bg, glow)
    d = ImageDraw.Draw(bg)
    rnd = random.Random(7)
    for _ in range(90):  # pixel stars
        x, y, s = rnd.randrange(W), rnd.randrange(0, 300), rnd.choice((2, 2, 4))
        d.rectangle((x, y, x + s - 1, y + s - 1), fill=rnd.choice(((255, 236, 170), (220, 190, 240), (255, 255, 255))))
    return bg


def pixel_text(d, text, x, y, px, fill, shadow):
    """Draws text in the 5x7 glyphs; returns the width. A hard offset shadow gives the arcade look."""
    cx = x
    for ch in text:
        if ch == " ":
            cx += px * 4
            continue
        for gy, row in enumerate(GLYPHS[ch]):
            for gx, v in enumerate(row):
                if v == "X":
                    X, Y = cx + gx * px, y + gy * px
                    d.rectangle((X + px // 2, Y + px // 2, X + px + px // 2 - 1, Y + px + px // 2 - 1), fill=shadow)
        for gy, row in enumerate(GLYPHS[ch]):
            for gx, v in enumerate(row):
                if v == "X":
                    X, Y = cx + gx * px, y + gy * px
                    d.rectangle((X, Y, X + px - 1, Y + px - 1), fill=fill)
        cx += px * 6
    return cx - x - px


def pixel_width(text, px):
    return sum(px * 4 if c == " " else px * 6 for c in text) - px


def rounded_window(shot, size):
    shot = shot.resize(size, Image.LANCZOS).convert("RGBA")
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), 18, fill=255)
    shot.putalpha(mask)
    return shot


def main(shot_path=None):
    shot = Image.open(shot_path or os.path.join(ROOT, "layouts", "Herdr-Ranch.png")).convert("RGB")
    img = background()
    d = ImageDraw.Draw(img)

    # title
    px = 11
    a, b = "HERDR", "RANCH"
    total = pixel_width(a, px) + px * 5 + pixel_width(b, px)
    x = (W - total) // 2
    pixel_text(d, a, x, 40, px, CREAM, (20, 2, 18))
    pixel_text(d, b, x + pixel_width(a, px) + px * 5, 40, px, GOLD, (20, 2, 18))
    for dx, name in ((-1, "sheep"), (1, "cow")):  # a little crowd either side of the title
        s = sprite(name, "-2", 6)
        img.paste(s, (x - 190 if dx < 0 else x + total + 46, 52), s)

    # tagline pill
    tag = "Every coding agent is a tiny pixel animal."
    f = font(34, BOLD)
    tw = d.textlength(tag, font=f)
    px0, py0 = (W - tw) // 2 - 36, 150
    d.rounded_rectangle((px0, py0, px0 + tw + 72, py0 + 62), 31, fill=(30, 4, 28), outline=GOLD, width=3)
    d.text((px0 + 36, py0 + 10), tag, font=f, fill=CREAM)
    f2 = font(24, MED)
    sub = "A herdr layout   ·   random animal + name   ·   nap · alarm · confetti"
    d.text(((W - d.textlength(sub, font=f2)) / 2, 226), sub, font=f2, fill=(214, 170, 200))

    # the real window, with a shadow and a gold edge
    wx, wy, ww = 780, 290, 760
    crop = shot.crop((0, 0, 1130, 640))
    wh = int(ww * crop.height / crop.width)
    win = rounded_window(crop, (ww, wh))
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).rounded_rectangle((wx + 8, wy + 16, wx + ww + 8, wy + wh + 16), 18, fill=(0, 0, 0, 170))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img.paste(shadow, (0, 0), shadow)
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((wx - 3, wy - 3, wx + ww + 2, wy + wh + 2), 20, outline=GOLD, width=3)
    img.paste(win, (wx, wy), win)
    d = ImageDraw.Draw(img)

    # callouts: (heading, body, new?)
    items = [
        ("Every agent is an animal", "A random pixel animal and name each. Three rare ones.", False),
        ("They live their day", "Nap, ring the alarm, throw confetti when done. A tree grows.", False),
        ("Chat with a parrot", "A side panel that reads your agents' git and code.", True),
        ("Servers and worktrees", "A critter per dev server; branches as trees with PR and CI.", False),
        ("Hand off with Memory share", "Send an agent's recent screen to another. You read it first.", False),
        ("Scout reviews your PRs", "A sheepdog gets its own Reviewer section.", False),
    ]
    fh, fb, ftag = font(29, HEAVY), font(20, MED), font(15, HEAVY)
    y = 290
    for i, (head, body, fresh) in enumerate(items, 1):
        d.ellipse((60, y, 106, y + 46), fill=GOLD)
        n = str(i)
        d.text((83 - d.textlength(n, font=fh) / 2, y + 3), n, font=fh, fill=DEEP)
        d.text((124, y - 2), head, font=fh, fill=GOLD if fresh else CREAM)
        if fresh:
            hw = d.textlength(head, font=fh)
            d.rounded_rectangle((124 + hw + 12, y + 4, 124 + hw + 62, y + 26), 11, fill=GOLD)
            d.text((124 + hw + 22, y + 6), "NEW", font=ftag, fill=DEEP)
        words, line, ly = body.split(), "", y + 36
        lines = 1
        for wd in words:
            t = (line + " " + wd).strip()
            if d.textlength(t, font=fb) > 635:
                d.text((124, ly), line, font=fb, fill=(226, 190, 214))
                line, ly, lines = wd, ly + 26, lines + 1
            else:
                line = t
        d.text((124, ly), line, font=fb, fill=(226, 190, 214))
        y += 76 if lines == 1 else 102
    ft = font(18, BOLD)
    for k, line in enumerate((
        "Also: two per row  \u00b7  filter by state  \u00b7  needs-you bell  \u00b7  find",
        "what a task changed  \u00b7  honest spend  \u00b7  sounds  \u00b7  day and night emblems  \u00b7  CPU/RAM/disk  \u00b7  2 themes",
    )):
        d.text((60, 752 + k * 24), line, font=ft, fill=GOLD)
    # the Update button itself, as it looks in the status bar
    label = "Update to v0.6.0"
    fu = font(17, BOLD)
    pw = d.textlength(label, font=fu) + 44
    d.rounded_rectangle((600, 750, 600 + pw, 778), 8, fill=GOLD)
    arrow = sprites.ui_icon_grids()["ui-up"]
    for ay, row in enumerate(arrow):
        for ax, ch in enumerate(row):
            if ch != ".":
                d.rectangle((612 + ax * 2, 757 + ay * 2, 612 + ax * 2 + 1, 757 + ay * 2 + 1), fill=DEEP)
    d.text((636, 752), label, font=fu, fill=DEEP)

    # fence and the herd
    fy = 926
    for fx in range(0, W, 64):
        d.rectangle((fx + 20, fy - 40, fx + 34, fy + 55), fill=(122, 78, 44))
        d.rectangle((fx + 20, fy - 40, fx + 34, fy - 34), fill=(166, 112, 66))
    d.rectangle((0, fy - 22, W, fy - 10), fill=(143, 94, 54))
    d.rectangle((0, fy + 8, W, fy + 20), fill=(143, 94, 54))
    herd = ["sheep", "goat", "rabbit", "chicken", "cow", "horse", "duck", "llama", "fox", "owl", "dragon", "sheepdog"]
    step = (W - 120) // len(herd)
    for i, name in enumerate(herd):
        s = sprite(name, "-2" if i % 2 else "", 5)
        img.paste(s, (60 + i * step + (step - 120) // 2, fy - 126), s)
    d = ImageDraw.Draw(img)

    foot = "herdr layout   ·   github.com/sayeemabdullah/herdr-ranch"
    ff = font(24, BOLD)
    d.rectangle((0, 962, W, H), fill=(30, 4, 28))
    d.text(((W - d.textlength(foot, font=ff)) / 2, 966), foot, font=ff, fill=GOLD)

    out = os.environ.get("RANCH_BANNER_OUT") or os.path.join(ROOT, "preview.png")
    img.save(out)
    return out


if __name__ == "__main__":
    print(main(sys.argv[1] if len(sys.argv) > 1 else None))
