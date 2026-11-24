"""Draws assets/demo.gif: the Agents list in motion, from the real sprites and the layout's real timings.

Not a screen recording: every frame is drawn here. One loop is 36 frames of 200 ms (7.2 s), the common
multiple of the layout's periods: steps 800 ms, dots 1200 ms, alarm 400 ms, nap 1800 ms, confetti 1200 ms.
Run `python3 tools/demo_gif.py` to regenerate.
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import sprites as sp  # noqa: E402

OUT = os.path.join(HERE, "..", "assets", "demo.gif")
W, H = 536, 820          # the 268pt sidebar at 2x
FRAMES, MS = 36, 200

BG = (69, 9, 58)
CARD_BORDER = (143, 79, 128)
CARD_SELECTED = (106, 37, 96)
TEXT = (243, 233, 240)
MUTED = (209, 179, 202)
DIM = (185, 149, 176)
GOLD = (242, 199, 68)
RED = (255, 107, 107)
GREEN = (94, 208, 122)


def font(size, weight=None):
    f = ImageFont.truetype("/System/Library/Fonts/SFNS.ttf", size)
    if weight:
        try:
            f.set_variation_by_name(weight)
        except Exception:
            pass
    return f


def rgb(ch):
    h = sp.PALETTE[ch].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def blit(img, grid, x, y, scale):
    d = ImageDraw.Draw(img)
    for r, row in enumerate(grid):
        for c, ch in enumerate(row):
            if ch in sp.PALETTE:
                d.rectangle((x + c * scale, y + r * scale, x + c * scale + scale - 1, y + r * scale + scale - 1), fill=rgb(ch))


def pose(animal, name, alt=False):
    return sp.pose_grids(animal)[name] if not alt else sp.swap_colours(sp.pose_grids(animal)[name], sp.ALT_SWAPS[animal])


CONFETTI = sp.confetti_grids()
ALARM = sp.alarm_grids()
BELL = sp.bell_grids()
TREE = sp.tree_grids()


def card(img, y, name, word, word_colour, space, line3, sprite, selected=False, extra=None):
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((16, y, W - 16, y + 140), radius=16, fill=CARD_SELECTED if selected else BG, outline=CARD_BORDER, width=2)
    img.paste(sprite, (36, y + 32), sprite)
    d.text((148, y + 30), name, font=font(30, "Bold"), fill=TEXT)
    nx = 148 + d.textlength(name, font=font(30, "Bold")) + 14
    d.text((nx, y + 38), word, font=font(22), fill=word_colour)
    d.text((148, y + 70), space, font=font(26, "Bold"), fill=TEXT)
    d.text((148, y + 102), line3, font=font(23), fill=DIM)
    if extra:
        extra(d, y)


def sprite_image(grid, overlay=None):
    im = Image.new("RGBA", (72, 72), (0, 0, 0, 0))
    blit(im, grid, 0, 0, 3)
    if overlay:
        blit(im, overlay, 0, 0, 3)
    return im


def dots(d, y, frame):
    # Three square dots, one lit at a time, bouncing 1-2-3-2-1 over 1200 ms (6 frames).
    lit = [0, 1, 2, 1][(frame % 6) * 4 // 6] if False else [0, 1, 2, 2, 1, 0][frame % 6]
    for i in range(3):
        x = W - 96 + i * 16
        d.rectangle((x, y + 40, x + 8, y + 48), fill=GOLD if i == lit else (92, 40, 84))


def frame_image(f):
    img = Image.new("RGBA", (W, H), BG + (255,))
    d = ImageDraw.Draw(img)
    d.text((34, 24), "Agents", font=font(23), fill=DIM)
    # The bell rings: two frames every 700 ms is close to 4 frames; use 4.
    bell = BELL["bell-2"] if (f // 4) % 2 else BELL["bell"]
    blit(img, bell, W - 96, 22, 4)
    # The board
    d.rounded_rectangle((16, 76, W - 16, 172), radius=16, outline=CARD_BORDER, width=2, fill=(82, 23, 74))
    blit(img, TREE["tree-5"], 36, 92, 4)
    d.text((112, 88), "21", font=font(32, "Bold"), fill=TEXT)
    d.text((158, 98), "done today · 25m", font=font(23), fill=MUTED)
    d.rounded_rectangle((112, 140, W - 130, 148), radius=4, fill=CARD_BORDER)
    d.rounded_rectangle((112, 140, 112 + 190, 148), radius=4, fill=GREEN)
    d.text((W - 118, 132), "5 to grow", font=font(20), fill=DIM)
    y0 = 192
    step = (f // 4) % 2           # 800 ms
    long_ = (f // 9) % 2          # 1800 ms
    # Working: steps, three dots
    grid = pose("sheep", "-2" if step else "-work")
    card(img, y0, "Clover", "Working", MUTED, "api-server", "Refactor the auth mid…", sprite_image(grid),
         selected=True, extra=lambda dd, yy: dots(dd, yy, f))
    # Needs you
    card(img, y0 + 156, "Pickle", "Needs you", RED, "web-app", "Waiting for your answer…", sprite_image(pose("rabbit", "-blocked")))
    # Done: confetti until you look
    conf = CONFETTI["confetti-2" if (f // 6) % 2 else "confetti"]
    card(img, y0 + 312, "Cocoa", "Done", GREEN, "docs", "Wrote the changelog…", sprite_image(pose("cow", "-done"), conf))
    # Napping then the alarm: show a sleepy fox and a llama whose alarm rings
    nap = pose("fox", "-idle-2" if long_ else "-idle")
    card(img, y0 + 468, "Biscuit", "Napping", MUTED, "notes", "Idle for 3m", sprite_image(nap))
    return img


def main():
    frames = [frame_image(f).convert("RGB") for f in range(FRAMES)]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    pal = [fr.convert("P", palette=Image.ADAPTIVE, colors=64) for fr in frames]
    pal[0].save(OUT, save_all=True, append_images=pal[1:], duration=MS, loop=0, optimize=True, disposal=1)


if __name__ == "__main__":
    main()
