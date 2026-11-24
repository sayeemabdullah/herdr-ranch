"""Draws every ranch sprite and emblem and writes them as SVGs.

Animals are drawn from shapes (ellipses, rectangles, polygons) on a 24x24 canvas as front-facing
chibi figures (a big head over a small body, like the Middle-earth cast), then outlined and shaded
automatically, so every animal shares one look and every pose is a real redraw (the feet step, the
body bobs, eyes close and the body lowers when resting). Emblems are drawn the same way on a 20x20 canvas.

Edit the drawing functions here, never the SVG files, then run:  python3 tools/sprites.py
Writes into the repo next to this script, never into a live Herdr home.

Sprites declare width/height 36 over a 24x24 viewBox (herdr rasterizes an SVG at its declared size);
emblems declare 20 over 20, a 1:1 pixel grid. The top-left 6x6 of every standing and resting animal is
kept empty: badges and the sleeping "z" are drawn there.
"""
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SPRITES = os.path.join(HERE, "..", "mods", "flock", "sprites")
ICONS = os.path.join(os.path.dirname(SPRITES), "icons")
EMBLEMS = os.path.join(HERE, "..", "mods", "meadows", "emblems")
SIZE = 24
DISPLAY = 36
EMBLEM = 20

PALETTE = {
    "o": "#2a1f2d", "e": "#1b1320", "H": "#ffffff", "K": "#241c2a",
    "W": "#f6f3ec", "w": "#d8d3c7", "x": "#b8b1a8", "G": "#8c8590", "g": "#5f5865",
    "C": "#ecd9ae", "c": "#cdb07a", "T": "#c9a66b", "t": "#a5824a",
    "B": "#a46a3a", "b": "#6c4121", "n": "#46290f",
    "Y": "#f5cb45", "y": "#d9a21b", "O": "#ee8630", "Q": "#c5621b",
    "R": "#d94a4a", "r": "#a82e2e", "P": "#f4a6b6", "p": "#d97b92",
    "U": "#4fa8e0", "u": "#2f78b5", "M": "#46a35a", "m": "#2f7a43", "Z": "#a89bc4",
    "L": "#f8a95d", "l": "#f6ead0", "k": "#c28a58", "A": "#fbe27f",
    "V": "#8b63e6", "v": "#5a3aa8", "J": "#ece0ff", "j": "#c4b0ec", "N": "#2ec4b6", "F": "#ff6fa5",
    "f": "#c93a7d", "I": "#a6e35e", "D": "#6b7fb0", "d": "#47598a", "S": "#8fd8ff", "s": "#d6f0ff",
    "X": "#1f2557", "q": "#3b4090", "h": "#f4e9a8",
}

# Colour swaps for a second animal of the same kind.
ALT_SWAPS = {
    "sheep": {"W": "P", "w": "p", "N": "F", "j": "f"},
    "goat": {"C": "G", "c": "g", "l": "W", "O": "U", "Q": "u"},
    "rabbit": {"J": "x", "j": "G", "U": "R", "u": "r"},
    "chicken": {"W": "B", "w": "T", "N": "R", "L": "O"},
    "cow": {"W": "T", "w": "t", "R": "U", "r": "u"},
    "horse": {"B": "G", "b": "g", "T": "x", "k": "x", "y": "R", "U": "M"},
    "duck": {"Y": "W", "y": "w", "A": "W", "U": "R", "u": "r"},
    "llama": {"C": "W", "c": "w", "T": "C", "l": "W", "F": "U", "N": "R"},
}

BLOCKED_BADGE = [".RRRR.", "RRWWRR", "RRWWRR", "RRRRRR", "RRWWRR", ".RRRR."]
DONE_BADGE = [".YYYY.", "YYYYYY", "YYYYWY", "YWYWYY", "YYWYYY", ".YYYY."]
SLEEP_Z = ["ZZZZZ", "...Z.", "..Z..", ".Z...", "ZZZZZ"]


class Canvas:
    """A square pixel canvas of colour keys. `dy` shifts everything drawn without abs_=True."""

    def __init__(self, n=SIZE):
        self.n = n
        self.g = [["."] * n for _ in range(n)]
        self.dy = 0
        self.ox = 0
        self.lie = False
        self.closed = False
        self.details = []

    def put(self, x, y, ch, abs_=False):
        y += 0 if abs_ else self.dy
        x += 0 if abs_ else self.ox
        if 0 <= x < self.n and 0 <= y < self.n:
            self.g[y][x] = ch

    def rect(self, x0, y0, x1, y1, ch, abs_=False):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                self.put(x, y, ch, abs_)

    def ell(self, cx, cy, rx, ry, ch, abs_=False):
        cy += 0 if abs_ else self.dy
        cx += 0 if abs_ else self.ox
        for y in range(self.n):
            for x in range(self.n):
                if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1.0:
                    self.g[y][x] = ch

    def poly(self, pts, ch, abs_=False):
        off = 0 if abs_ else self.dy
        offx = 0 if abs_ else self.ox
        pts = [(x + offx, y + off) for x, y in pts]
        for y in range(self.n):
            for x in range(self.n):
                px, py, inside = x + 0.5, y + 0.5, False
                for i in range(len(pts)):
                    (x1, y1), (x2, y2) = pts[i], pts[(i + 1) % len(pts)]
                    if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
                        inside = not inside
                if inside:
                    self.g[y][x] = ch

    def line(self, x0, y0, x1, y1, ch, abs_=False):
        """A one-pixel line (Bresenham)."""
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        err = dx + dy
        while True:
            self.put(x0, y0, ch, abs_)
            if x0 == x1 and y0 == y1:
                break
            e2 = 2 * err
            if e2 >= dy:
                err += dy
                x0 += sx
            if e2 <= dx:
                err += dx
                y0 += sy

    def light(self, base, light):
        """Lightens the top edge of every `base` area (draw before outline)."""
        tops = [(x, y) for y in range(self.n) for x in range(self.n)
                if self.g[y][x] == base and (y == 0 or self.g[y - 1][x] == ".")]
        for x, y in tops:
            self.g[y][x] = light

    def clear(self, x0, y0, x1, y1):
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < self.n and 0 <= y < self.n:
                    self.g[y][x] = "."

    def shade(self, base, shade):
        """Colours the bottom edge of every `base` area with `shade` (draw before outline)."""
        below_empty = [(x, y) for y in range(self.n) for x in range(self.n)
                       if self.g[y][x] == base and (y + 1 >= self.n or self.g[y + 1][x] == ".")]
        for x, y in below_empty:
            self.g[y][x] = shade

    def edge(self, x0, y0, x1, y1, base, shade):
        """Like shade, but only inside a window."""
        for y in range(y0, y1 + 1):
            for x in range(x0, x1 + 1):
                if 0 <= x < self.n and 0 <= y < self.n and self.g[y][x] == base and \
                        (y + 1 >= self.n or self.g[y + 1][x] != base):
                    self.g[y][x] = shade

    def eye(self, x, y):
        """An open eye, or a closed one (a short line) while resting. Drawn after the outline."""
        y += self.dy
        self.details.append(("closed" if self.closed else "open", int(x + 0.5), int(y + 0.5)))

    def dot(self, x, y, ch):
        self.details.append(("dot", int(x + 0.5), int(y + self.dy + 0.5), ch))

    def finish(self, outline="o"):
        add = []
        for y in range(self.n):
            for x in range(self.n):
                if self.g[y][x] != ".":
                    continue
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < self.n and 0 <= ny < self.n and self.g[ny][nx] != ".":
                        add.append((x, y))
                        break
        for x, y in add:
            self.g[y][x] = outline
        for d in self.details:
            if d[0] == "open" and 0 <= d[2] < self.n:
                self.g[d[2]][d[1]] = "e"
                if d[2] + 1 < self.n and self.g[d[2] + 1][d[1]] != ".":
                    self.g[d[2] + 1][d[1]] = "e"
            elif d[0] == "closed" and 0 <= d[2] < self.n:
                for dx in (-1, 0):
                    if 0 <= d[1] + dx < self.n:
                        self.g[d[2]][d[1] + dx] = "o"
            elif d[0] == "dot" and 0 <= d[2] < self.n and 0 <= d[1] < self.n:
                self.g[d[2]][d[1]] = d[3]
        return ["".join(r) for r in self.g]


def band(c, y, x0, x1, ch):
    """Paints a row only where the animal already is, so scarves follow its outline."""
    for x in range(x0, x1 + 1):
        yy, xx = y + c.dy, x + c.ox
        if 0 <= yy < c.n and 0 <= xx < c.n and c.g[yy][xx] != ".":
            c.g[yy][xx] = ch


def scarf(c, y, x0, x1, col, dark):
    band(c, y, x0, x1, col)
    band(c, y + 1, x0 + 1, x1 - 1, col)
    band(c, y + 2, x0 + 3, x1 - 3, dark)


def legs(c, set1, set2, ph, col, hoof, top=15, bottom=21, w=2):
    """Four legs as two diagonal pairs; the pair not on the ground is one pixel shorter."""
    if c.lie:
        return
    for i, xs in enumerate((set1, set2)):
        end = bottom if ph == i else bottom - 1
        for x in xs:
            c.rect(x, top, x + w - 1, end, col, abs_=True)
            c.rect(x, end, x + w - 1, end, hoof, abs_=True)


# ---------------------------------------------------------------- animals (all face right)

# Front-facing chibi figures: a big head over a small body, centred on x=12, like the Middle-earth cast.
# The head starts below row 3 and keeps clear of the top-left 6x6 corner.

def feet(c, ph, col, hoof=None, dx=3.6, y=22, rx=2.1, ry=1.3):
    """Two feet; one is raised a pixel on the other step."""
    if c.lie:
        return
    for i, x in enumerate((12 - dx, 12 + dx)):
        c.ell(x, y - (1 if ph == i else 0), rx, ry, hoof or col, abs_=True)


def eyes(c, y, dx=3, x=12):
    c.eye(x - dx, y)
    c.eye(x + dx, y)


def sheep(c, ph):
    feet(c, ph, "g")
    c.ell(12, 17.8, 8, 5, "W")
    c.ell(7.2, 15.5, 3, 3, "W")
    c.ell(16.8, 15.5, 3, 3, "W")
    c.ell(12, 6.8, 5, 3, "W")
    c.ell(9.2, 8, 2.4, 2.2, "W")
    c.ell(14.8, 8, 2.4, 2.2, "W")
    c.shade("W", "w")
    c.ell(12, 11, 4.4, 5.2, "g")
    c.ell(6.6, 11.2, 1.8, 1.2, "g")
    c.ell(17.4, 11.2, 1.8, 1.2, "g")
    scarf(c, 16, 7, 16, "N", "j")
    c.rect(14, 3, 15, 4, "F")
    c.dot(14, 3, "Y")
    c.dot(12, 13, "p")
    c.dot(11, 14, "g")
    c.dot(12, 14, "p")
    c.dot(13, 14, "g")
    if c.closed:
        c.eye(10, 10)
        c.eye(15, 10)
    else:
        c.dot(10, 10, "W")
        c.dot(14, 10, "W")


def goat(c, ph):
    feet(c, ph, "T", "b")
    c.ell(12, 18.3, 5, 3.7, "C")
    c.ell(12, 9.8, 6.2, 6.1, "C")
    c.ell(12, 14, 3.6, 2.8, "l")
    c.ell(5.6, 9.6, 2.3, 1.3, "c")
    c.ell(18.4, 9.6, 2.3, 1.3, "c")
    c.shade("C", "c")
    c.poly([(8, 5.5), (7.5, 2), (9.5, 3), (10, 5.5)], "y")
    c.poly([(16, 5.5), (16.5, 2), (14.5, 3), (14, 5.5)], "y")
    c.poly([(8, 16), (16, 16), (12, 20.5)], "O")
    c.line(8, 16, 16, 16, "Q")
    c.rect(11, 17, 12, 19, "W")
    c.dot(11, 13, "p")
    c.dot(12, 13, "p")
    eyes(c, 9.5, 3.6)


def rabbit(c, ph):
    feet(c, ph, "J", "j", dx=3.4)
    c.ell(12, 18.3, 5, 3.7, "J")
    c.ell(12, 11.5, 6.8, 5.4, "J")
    c.ell(9, 4.6, 1.9, 4.4, "J")
    c.ell(15, 4.6, 1.9, 4.4, "J")
    c.rect(9, 2, 9, 7, "P")
    c.rect(15, 2, 15, 7, "P")
    c.shade("J", "j")
    c.rect(8, 17, 10, 18, "U")
    c.rect(14, 17, 16, 18, "U")
    c.rect(11, 17, 12, 18, "u")
    c.dot(9, 17, "S")
    c.dot(15, 17, "S")
    c.ell(7.4, 13.2, 1.5, 1, "P")
    c.ell(16.6, 13.2, 1.5, 1, "P")
    c.dot(12, 12.6, "P")
    c.dot(11, 14, "o")
    c.dot(13, 14, "o")
    c.dot(12, 13.6, "o")
    eyes(c, 10.8, 3.2)


def chicken(c, ph):
    if not c.lie:
        for i, x in enumerate((9, 15)):
            c.rect(x, 20 - (1 if ph == i else 0), x, 21, "Y", abs_=True)
            c.rect(x - 1, 21, x + 1, 21, "Y", abs_=True)
    c.ell(12, 13.6, 7.2, 8, "W")
    c.ell(5.8, 15.6, 1.7, 3.2, "L")
    c.ell(18.2, 15.6, 1.7, 3.2, "L")
    c.shade("W", "w")
    c.ell(12, 5.6, 2.2, 1.7, "R")
    c.rect(9, 5, 10, 6, "R")
    c.rect(14, 5, 15, 6, "R")
    c.rect(11, 11, 12, 12, "O")
    c.rect(11, 13, 12, 14, "R")
    scarf(c, 15, 6, 17, "N", "j")
    eyes(c, 9.6, 3.2)


def cow(c, ph):
    feet(c, ph, "K", "K")
    c.ell(12, 18.3, 5.6, 3.7, "W")
    c.ell(9.5, 18.6, 2, 1.6, "K")
    c.ell(12, 10.2, 7, 6.1, "W")
    c.ell(5.4, 8.4, 2.2, 1.4, "w")
    c.ell(18.6, 8.4, 2.2, 1.4, "w")
    c.shade("W", "w")
    c.ell(8.6, 7.4, 2.5, 2.2, "K")
    c.ell(16.2, 11.4, 2.1, 2.3, "K")
    c.ell(12, 13.7, 4.7, 3, "P")
    c.rect(7, 3, 8, 4, "Y")
    c.rect(16, 3, 17, 4, "Y")
    c.dot(10, 13, "p")
    c.dot(13, 13, "p")
    c.dot(10, 14, "p")
    c.dot(13, 14, "p")
    band(c, 17, 7, 16, "R")
    band(c, 18, 7, 16, "r")
    c.rect(11, 18, 12, 19, "Y")
    eyes(c, 9.6, 3.4)


def horse(c, ph):
    feet(c, ph, "B", "n")
    c.ell(12, 18.4, 5.2, 3.6, "B")
    c.rect(8, 3, 9, 5, "B")
    c.rect(15, 3, 16, 5, "B")
    c.ell(7.4, 10.5, 1.5, 5.6, "y")
    c.ell(16.6, 10.5, 1.5, 5.6, "y")
    c.ell(12, 10, 5.4, 7, "B")
    c.rect(10, 3, 13, 6, "y")
    c.ell(12, 15.2, 3.6, 2.6, "T")
    c.shade("B", "b")
    c.light("B", "k")
    c.rect(11, 6, 12, 11, "W")
    c.rect(9, 13, 14, 13, "U")
    c.dot(10, 15, "n")
    c.dot(13, 15, "n")
    eyes(c, 9.6, 3.3)


def duck(c, ph):
    if not c.lie:
        for i, x in enumerate((8.6, 15.4)):
            c.ell(x, 22 - (1 if ph == i else 0), 2.7, 1.1, "O", abs_=True)
    c.ell(12, 18.2, 6.2, 3.8, "Y")
    c.ell(6.6, 18, 2, 3, "y")
    c.ell(17.4, 18, 2, 3, "y")
    c.ell(12, 9.6, 6.6, 5.9, "Y")
    c.rect(11, 3, 12, 4, "Y")
    c.shade("Y", "y")
    c.light("Y", "A")
    c.ell(12, 13.4, 4.2, 2.1, "O")
    c.dot(10, 13, "Q")
    c.dot(13, 13, "Q")
    c.poly([(8, 16), (16, 16), (12, 20.5)], "U")
    c.line(8, 16, 16, 16, "u")
    c.dot(10, 17, "W")
    c.dot(13, 17, "W")
    eyes(c, 9, 3.4)


def llama(c, ph):
    feet(c, ph, "T", "t", dx=3.2, rx=1.7)
    c.ell(12, 18.8, 6, 3.4, "C")
    c.ell(8, 18.2, 2.4, 2, "C")
    c.ell(16, 18.2, 2.4, 2, "C")
    c.ell(12, 14.5, 3.4, 3, "C")
    c.ell(12, 8.8, 5, 5.5, "C")
    c.ell(12, 4.6, 3.6, 2.4, "C")
    c.ell(8.6, 3.2, 1.1, 2.6, "C")
    c.ell(15.4, 3.2, 1.1, 2.6, "C")
    c.shade("C", "c")
    c.light("C", "l")
    c.ell(12, 12.2, 2.9, 2.2, "T")
    c.dot(11, 12, "n")
    c.dot(13, 12, "n")
    for y, col in ((16, "F"), (17, "Y"), (18, "N"), (19, "F"), (20, "Y"), (21, "N")):
        band(c, y, 6, 17, col)
    eyes(c, 8.6, 3.2)


def fox(c, ph):
    feet(c, ph, "g", "K", dx=3.2)
    c.ell(19.6, 19, 3.2, 2, "O")
    c.ell(21.5, 19.4, 1.5, 1.4, "W")
    c.ell(12, 18.5, 4.8, 3.6, "O")
    c.ell(12, 18.7, 2.6, 3, "W")
    c.poly([(7.3, 9), (8, 2.5), (11.2, 6.5)], "O")
    c.poly([(16.7, 9), (16, 2.5), (12.8, 6.5)], "O")
    c.ell(12, 11, 7, 5, "O")
    c.ell(8.4, 13.6, 3.5, 2.4, "W")
    c.ell(15.6, 13.6, 3.5, 2.4, "W")
    c.ell(12, 14.6, 3, 2.1, "W")
    c.shade("O", "Q")
    c.light("O", "L")
    c.poly([(8.4, 7.4), (8.4, 4), (10, 6)], "K")
    c.poly([(15.6, 7.4), (15.6, 4), (14, 6)], "K")
    c.rect(11, 13, 12, 13, "K")
    eyes(c, 10, 3.2)


def owl(c, ph):
    wing = 1 if ph else 0
    if not c.lie:
        c.rect(9, 20, 10, 21, "O", abs_=True)
        c.rect(14, 20, 15, 21, "O", abs_=True)
    c.rect(7, 4, 8, 6, "v")
    c.rect(16, 4, 17, 6, "v")
    c.ell(7 - wing, 15, 2.2, 5, "v")
    c.ell(17 + wing, 15, 2.2, 5, "v")
    c.ell(12, 14.5, 5.8, 6.5, "V")
    c.ell(12, 9, 6, 5, "V")
    c.ell(12, 16.5, 3.6, 4.5, "C")
    c.shade("B", "v")
    c.ell(9.3, 9.5, 2.9, 2.8, "C")
    c.ell(14.7, 9.5, 2.9, 2.8, "C")
    c.ell(9.3, 9.5, 1.8, 1.8, "Y")
    c.ell(14.7, 9.5, 1.8, 1.8, "Y")
    c.rect(11, 11, 12, 12, "O")
    for x in (10, 12, 14):
        c.dot(x, 16, "T")
    for x in (11, 13):
        c.dot(x, 18, "T")
    if c.closed:
        c.rect(8, 9, 10, 9, "o")
        c.rect(14, 9, 16, 9, "o")
        c.rect(8, 10, 10, 10, "C")
        c.rect(14, 10, 16, 10, "C")
        c.rect(8, 9, 10, 9, "o")
        c.rect(14, 9, 16, 9, "o")
    else:
        c.dot(9, 9, "e")
        c.dot(10, 9, "e")
        c.dot(14, 9, "e")
        c.dot(15, 9, "e")


def dragon(c, ph):
    f = 0 if ph == 0 else 2
    feet(c, ph, "m", "o", dx=3.2)
    c.poly([(7, 17), (2, 12 + f), (3, 19)], "R")
    c.poly([(17, 17), (22, 12 + f), (21, 19)], "R")
    c.line(7, 17, 3, 13 + f, "r")
    c.line(17, 17, 21, 13 + f, "r")
    c.poly([(17, 20), (22, 21), (21, 22.5)], "m")
    c.dot(22, 21, "R")
    c.ell(12, 18.5, 5, 3.6, "M")
    c.ell(12, 19, 3, 2.8, "C")
    c.ell(12, 9.6, 6.8, 5.8, "M")
    c.ell(12, 13.2, 3.8, 2.4, "C")
    c.shade("Y", "m")
    c.light("Y", "I")
    c.poly([(8, 6), (7, 2.5), (10, 5)], "O")
    c.poly([(16, 6), (17, 2.5), (14, 5)], "O")
    c.rect(11, 3, 12, 4, "R")
    c.dot(11, 13, "r")
    c.dot(12, 13, "r")
    eyes(c, 9.2, 3.3)


def sheepdog(c, ph):
    feet(c, ph, "W", "W", dx=3.2)
    c.ell(19.6 + (1 if ph else 0), 18.8, 2.4, 1.4, "D")
    c.ell(12, 18.8, 5, 3.2, "D")
    c.shade("D", "d")
    c.ell(12, 10.2, 6.6, 6, "D")
    c.ell(7.4, 9, 1.7, 3, "d")
    c.ell(16.6, 9, 1.7, 3, "d")
    c.rect(11, 5, 12, 11, "W")
    c.ell(12, 14, 3.4, 2.7, "W")
    c.poly([(8, 15.6), (16, 15.6), (12, 20.5)], "R")
    c.dot(9, 8, "T")
    c.dot(15, 8, "T")
    c.dot(12, 20, "Y")
    c.rect(11, 13, 12, 13, "o")
    if c.closed:
        eyes(c, 9.6, 3.3)
    else:
        for x in (9, 15):
            c.dot(x, 10, "W")
            c.dot(x, 11, "W")


# ---------------------------------------------------------------- barnyard critters (one per running server)

def pig(c, ph):
    feet(c, ph, "p", "p")
    c.ell(12, 18.2, 6.0, 3.8, "P")
    c.ell(12, 10, 7.0, 6.0, "P")
    c.poly([(6.5, 6), (9.5, 4), (10, 8)], "p")
    c.poly([(17.5, 6), (14.5, 4), (14, 8)], "p")
    c.shade("P", "p")
    c.light("P", "L")
    c.ell(12, 13, 3.6, 2.4, "p")
    c.dot(10.6, 13, "e")
    c.dot(13.4, 13, "e")
    eyes(c, 9, 3.6)
    c.dot(6.6, 11.5, "F")
    c.dot(17.4, 11.5, "F")


def cat(c, ph):
    feet(c, ph, "O", "Q")
    c.ell(12, 18.2, 5.8, 3.8, "O")
    c.ell(12, 10, 6.8, 5.8, "O")
    c.poly([(6.2, 7), (7.6, 2.4), (10.8, 5.4)], "O")
    c.poly([(17.8, 7), (16.4, 2.4), (13.2, 5.4)], "O")
    c.poly([(7.4, 6), (8, 4), (9.4, 5.6)], "P")
    c.poly([(16.6, 6), (16, 4), (14.6, 5.6)], "P")
    c.shade("O", "Q")
    c.light("O", "L")
    c.rect(11, 5, 12, 6, "Q")
    c.rect(8, 6, 8, 7, "Q")
    c.rect(15, 6, 15, 7, "Q")
    c.ell(12, 13.2, 3.2, 2.2, "l")
    c.dot(11.4, 12.4, "p")
    c.dot(12.6, 12.4, "p")
    eyes(c, 9, 3.4)
    c.dot(5.6, 13, "W")
    c.dot(18.4, 13, "W")


def frog(c, ph):
    feet(c, ph, "m", "m", dx=4.4)
    c.ell(12, 18.2, 6.2, 3.8, "M")
    c.ell(12, 12, 7.4, 5.4, "M")
    c.ell(9.4, 6.6, 2.7, 2.8, "M")
    c.ell(14.6, 6.6, 2.7, 2.8, "M")
    c.shade("M", "m")
    c.light("M", "I")
    c.ell(12, 18, 3.8, 2.4, "l")
    c.rect(9, 14, 15, 14, "m")
    c.dot(9.4, 6.4, "W")
    c.dot(14.6, 6.4, "W")
    c.eye(9.4, 7)
    c.eye(14.6, 7)
    c.dot(10, 12, "m")
    c.dot(14, 12, "m")


def hedgehog(c, ph):
    feet(c, ph, "c", "c")
    c.ell(12, 14.4, 7.6, 7.0, "b")
    c.poly([(5.6, 11), (7.6, 5.4), (9, 9)], "b")
    c.poly([(8, 8), (10, 2.4), (12, 7)], "b")
    c.poly([(12, 7), (14, 2.4), (16, 8)], "b")
    c.poly([(15, 9), (17, 5), (19, 11)], "b")
    c.shade("b", "n")
    c.light("b", "B")
    c.ell(12, 15, 5.2, 4.6, "C")
    c.ell(12, 16.6, 2.8, 2.2, "c")
    c.dot(12, 15.4, "e")
    eyes(c, 13, 2.6)
    c.dot(12, 6, "B")


CRITTERS = {"pig": pig, "cat": cat, "frog": frog, "hedgehog": hedgehog}


ANIMALS = {
    "sheep": sheep, "goat": goat, "rabbit": rabbit, "chicken": chicken, "cow": cow, "horse": horse,
    "duck": duck, "llama": llama, "fox": fox, "owl": owl, "dragon": dragon, "sheepdog": sheepdog,
}


def draw(name, ph=0, bob=False, lie=False, closed=False, lift=0):
    c = Canvas()
    c.lie = lie
    c.closed = closed
    c.dy = (2 - lift) if lie else (1 if bob else 0)
    {**ANIMALS, **CRITTERS}[name](c, ph)
    return c.finish()


def paint(g, art, x0=0, y0=0):
    out = [list(r) for r in g]
    for dy, line in enumerate(art):
        for dx, ch in enumerate(line):
            if ch != ".":
                out[y0 + dy][x0 + dx] = ch
    return ["".join(r) for r in out]


def pose_grids(name):
    """All seven poses of an animal, each a real redraw."""
    stand = draw(name)
    resting = draw(name, lie=True, closed=True)
    return {
        "": stand,
        "-work": stand,
        "-2": draw(name, ph=1, bob=True),
        "-idle": resting,
        "-idle-2": paint(draw(name, lie=True, closed=True, lift=1), SLEEP_Z),
        "-blocked": paint(stand, BLOCKED_BADGE),
        "-done": paint(stand, DONE_BADGE),
    }


def swap_colours(g, swaps):
    return ["".join(swaps.get(ch, ch) for ch in row) for row in g]


# ---------------------------------------------------------------- emblems (20x20)

PHASES = ("dawn", "day", "dusk", "night")
PHASE = "day"
# Sky colours (top, lower) for the phases that change them; day keeps what each emblem asks for.
SKY = {"dawn": ("P", "L"), "dusk": ("V", "L"), "night": ("X", "q")}
STARS = ((4, 2), (9, 1), (13, 4), (6, 6), (16, 7), (2, 8))


def _inside(x, y):
    if y >= 10:
        return 0 <= x <= 19 and y <= 19
    return (x + 0.5 - 10) ** 2 + (y + 0.5 - 10) ** 2 <= 100


def tile(c, top, low, ground, ground_shade, sun=None, cloud=None):
    """An arched badge like the Middle-earth emblems: a gold frame, a two-tone sky, grass at the
    bottom. Icons are then drawn in a 14x14 box offset by 3 pixels each way."""
    if PHASE in SKY:
        top, low = SKY[PHASE]
    for y in range(20):
        for x in range(20):
            if not _inside(x, y):
                continue
            edge = not all(_inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge:
                c.g[y][x] = "y" if (y >= 17 or x >= 15) else "Y"
            elif y >= 17:
                c.g[y][x] = ground_shade
            elif y >= 15:
                c.g[y][x] = ground
            else:
                c.g[y][x] = top if y < 8 else low
    for x in range(1, 19):
        if c.g[15][x] == ground:
            c.g[15][x] = "I" if ground == "M" else c.g[15][x]
    if PHASE == "night":
        for x, y in STARS:
            if c.g[y][x] in ("X", "q"):
                c.g[y][x] = "h"
        mx, my = (sun or (14, 3))[:2]
        c.rect(mx, my, mx + 2, my + 2, "W", abs_=True)
        c.rect(mx + 1, my, mx + 2, my + 1, "X", abs_=True)
    elif sun:
        c.rect(sun[0], sun[1], sun[0] + 2, sun[1] + 2, "Y", abs_=True)
        c.rect(sun[0] + 1, sun[1] + 1, sun[0] + 1, sun[1] + 1, "A", abs_=True)
    if cloud and PHASE != "night":
        c.rect(cloud[0], cloud[1], cloud[0] + 3, cloud[1], "W", abs_=True)
        c.rect(cloud[0] + 1, cloud[1] - 1, cloud[0] + 2, cloud[1] - 1, "W", abs_=True)
    c.dy = 3
    c.ox = 3


def barn(c):
    tile(c, "S", "s", "M", "m", sun=(14, 3), cloud=(3, 4))
    c.rect(1, 6, 12, 12, "R")
    c.poly([(0, 7), (6.5, 1), (13, 7)], "g")
    c.poly([(1.5, 7), (6.5, 2.5), (11.5, 7)], "R")
    c.rect(5, 8, 8, 12, "W")
    c.rect(6, 9, 7, 12, "r")
    c.rect(6, 4, 7, 5, "K")
    c.rect(0, 12, 13, 13, "M")


def silo(c):
    tile(c, "L", "A", "M", "m", sun=(3, 8))
    c.rect(3, 3, 10, 12, "w")
    c.rect(8, 3, 10, 12, "x")
    c.ell(6.5, 3.5, 4.2, 3, "R")
    c.clear(0 + 3, 7, 19, 7) if False else None
    c.rect(3, 4, 10, 12, "w")
    c.rect(8, 4, 10, 12, "x")
    for y in (6, 9):
        c.rect(3, y, 10, y, "G")
    c.rect(5, 10, 8, 12, "K")
    c.rect(0, 13, 13, 13, "M")


def haystack(c):
    tile(c, "S", "s", "I", "M", sun=(14, 3), cloud=(4, 4))
    c.ell(6.5, 8.6, 6.4, 4.6, "Y")
    c.clear(0, 12, 19, 13) if False else None
    c.rect(0, 12, 13, 13, "M")
    for x, y in ((3, 6), (6, 5), (8, 8), (4, 9), (9, 10)):
        c.rect(x, y, x + 2, y, "y")
    c.shade("Y", "y")


def pond(c):
    tile(c, "S", "s", "M", "m", cloud=(10, 4))
    c.ell(6.5, 9, 6.6, 4.2, "T")
    c.ell(6.5, 9, 5.6, 3.3, "U")
    c.ell(6.5, 9.7, 4.6, 2, "u")
    c.ell(6.5, 9, 5, 2.8, "U")
    c.put(4, 8, "W")
    c.put(5, 9, "W")
    c.ell(9, 10, 1.7, 1, "m")
    c.put(9, 9, "P")
    c.rect(1, 2, 1, 6, "m")
    c.rect(2, 1, 2, 6, "T")


def windmill(c):
    tile(c, "U", "S", "I", "M", sun=(15, 3))
    c.rect(6, 0, 6, 9, "b")
    c.rect(0, 5, 13, 5, "b")
    c.rect(7, 0, 9, 3, "W")
    c.rect(10, 6, 13, 8, "W")
    c.rect(0, 2, 3, 4, "W")
    c.poly([(3.5, 13), (9.5, 13), (8.5, 6), (4.5, 6)], "T")
    c.poly([(8, 6), (8.5, 6), (9.5, 13), (8.5, 13)], "t")
    c.poly([(4, 6), (6.5, 3), (9, 6)], "R")
    c.rect(5, 10, 7, 13, "K")


def orchard(c):
    tile(c, "P", "l", "M", "m", sun=(14, 3))
    c.rect(5, 8, 7, 12, "b")
    c.rect(6, 8, 7, 12, "B")
    c.ell(6.5, 5, 5.4, 4.5, "M")
    c.shade("M", "m")
    for x, y in ((3, 4), (8, 2), (9, 6), (5, 7)):
        c.put(x, y, "R")
        c.put(x + 1, y, "R")
    c.rect(0, 12, 13, 13, "M")


def fence(c):
    tile(c, "Z", "P", "M", "m", sun=(14, 4))
    for x in (1, 6, 11):
        c.rect(x, 3, x + 1, 12, "T")
        c.rect(x + 1, 3, x + 1, 12, "t")
        c.put(x, 2, "T")
    c.rect(0, 5, 13, 6, "B")
    c.rect(0, 9, 13, 10, "B")
    c.rect(0, 6, 13, 6, "b")
    c.rect(0, 10, 13, 10, "b")


EMBLEMS_DRAW = {"barn": barn, "silo": silo, "haystack": haystack, "pond": pond, "windmill": windmill,
                "orchard": orchard, "fence": fence}


def emblem_grids(phase="day"):
    global PHASE
    PHASE = phase
    out = {}
    for name, fn in EMBLEMS_DRAW.items():
        c = Canvas(EMBLEM)
        fn(c)
        out[name] = c.finish()
    PHASE = "day"
    return out


# ---------------------------------------------------------------- alarm clock and confetti

def alarm_grids():
    """A pixel alarm clock, 14x14: still, and ringing (the little marks at its sides)."""
    def clock(ring):
        c = Canvas(14)
        c.ell(7, 8, 4.8, 4.8, "R")
        c.ell(3, 3.6, 1.7, 1.5, "Y")
        c.ell(11, 3.6, 1.7, 1.5, "Y")
        c.ell(7, 8, 3.4, 3.4, "W")
        c.rect(3, 12, 4, 13, "y")
        c.rect(10, 12, 11, 13, "y")
        c.shade("R", "r")
        g = c.finish()
        g = [list(r) for r in g]
        for y in range(6, 9):
            g[y][7] = "o"
        g[8][8] = "o"
        g[8][9] = "o"
        if ring:
            for x, y in ((0, 5), (1, 7), (13, 5), (12, 7), (0, 8), (13, 8)):
                g[y][x] = "A"
        return ["".join(r) for r in g]
    return {"alarm": clock(False), "alarm-2": clock(True)}


def bell_grids():
    """A pixel bell for the needs-you button, two frames (the second swung, with ring marks)."""
    def bell(ring):
        c = Canvas(14)
        c.ell(7, 6.6, 4.4, 4.2, "Y")
        c.rect(2, 8, 11, 10, "Y")
        c.rect(1, 10, 12, 10, "y")
        c.ell(7, 12, 1.5, 1.2, "y")
        c.rect(6, 1, 7, 2, "y")
        c.light("Y", "A")
        g = [list(r) for r in c.finish()]
        if ring:
            for x, y in ((0, 4), (13, 4), (0, 7), (13, 7)):
                g[y][x] = "R"
        return ["".join(r) for r in g]
    return {"bell": bell(False), "bell-2": bell(True)}


# Apple-tree stages for the ranch board: grows as tasks finish today (1, 4, 8, 13, 19, 26, then blossom at 30).
TREE_AT = (1, 4, 8, 13, 19, 26, 30)


def tree_grids():
    """The ranch tree, 14x14: eight stages, each also drooping (someone has waited on you for a while)."""
    apples = [(5, 4), (9, 5), (7, 7), (4, 7), (10, 8), (6, 3)]
    radius = [0, 1.6, 2.6, 3.6, 4.4, 5.2, 5.8, 5.8]
    out = {}
    for stage in range(8):
        for droop in (False, True):
            c = Canvas(14)
            c.rect(0, 12, 13, 13, "M", abs_=True)
            c.rect(0, 12, 13, 12, "I", abs_=True)
            if stage == 0:
                c.rect(4, 10, 9, 11, "b", abs_=True)
                c.rect(6, 7, 7, 10, "m", abs_=True)
                c.ell(4.8, 7, 1.6, 1.1, "M", abs_=True)
                c.ell(9.2, 6.4, 1.6, 1.1, "I", abs_=True)
            else:
                c.rect(6, 8 if stage > 2 else 9, 7, 11, "b", abs_=True)
                c.rect(7, 8 if stage > 2 else 9, 7, 11, "B", abs_=True)
                crown, dark = ("T", "t") if droop else ("M", "m")
                c.ell(7, 6 if stage > 2 else 7, radius[stage], radius[stage] * 0.85, crown, abs_=True)
                c.shade(crown, dark)
            g = [list(r) for r in c.finish()]
            n_apples = 0 if stage < 4 else (stage - 3) * 2
            for i, (x, y) in enumerate(apples[:n_apples]):
                if g[y][x] != ".":
                    g[y][x] = "y" if droop and i % 2 else "R"
            if droop and stage >= 2:
                for x, y in ((3, 11), (10, 11)):
                    g[y][x] = "y"
            if stage == 7 and not droop:
                for x, y in ((4, 3), (9, 3), (6, 5), (8, 6), (3, 6), (10, 5)):
                    if g[y][x] != ".":
                        g[y][x] = "P"
            out[f"tree-{stage}{'-droop' if droop else ''}"] = ["".join(r) for r in g]
    return out


CONFETTI_COLOURS = "RYUMFOZ"


def confetti_grids():
    """Two frames of falling confetti on a transparent 24x24, laid over a done animal."""
    import random
    frames = []
    for seed in (7, 19):
        rnd = random.Random(seed)
        g = [["."] * SIZE for _ in range(SIZE)]
        for _ in range(16):
            x, y = rnd.randrange(0, SIZE), rnd.randrange(0, SIZE)
            if x < 6 and y < 6:
                continue
            col = rnd.choice(CONFETTI_COLOURS)
            g[y][x] = col
            if rnd.random() < 0.45 and x + 1 < SIZE:
                g[y][x + 1] = col
        frames.append(["".join(r) for r in g])
    return {"confetti": frames[0], "confetti-2": frames[1]}


# ---------------------------------------------------------------- output

def ui_icon_grids():
    """Small pixel buttons for the Servers and Worktrees sections: stop (x), new (+), run again (play), update (up arrow)."""
    x = ["ww.....ww", ".ww...ww.", "..ww.ww..", "...www...", "....w....", "...www...", "..ww.ww..", ".ww...ww.", "ww.....ww"]
    plus = ["....ww....", "....ww....", "....ww....", "....ww....", "wwwwwwwwww", "wwwwwwwwww", "....ww....", "....ww....", "....ww....", "....ww...."]
    play = ["M....", "MM...", "MMM..", "MMMM.", "MMMMM", "MMMM.", "MMM..", "MM...", "M...."]
    play = ["..." + r + "." for r in play]
    up = ["....o....", "...ooo...", "..ooooo..", ".ooooooo.", "ooooooooo", "...ooo...", "...ooo...", "...ooo...", "...ooo..."]
    return {"ui-x": x, "ui-plus": plus, "ui-play": play, "ui-up": up}


def render(g, display):
    n = len(g)
    rects = []
    for y, row in enumerate(g):
        for x, ch in enumerate(row):
            if ch != ".":
                rects.append(f'<rect x="{x}" y="{y}" width="1" height="1" fill="{PALETTE[ch]}"/>')
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{display}" height="{display}" '
            f'viewBox="0 0 {n} {n}" shape-rendering="crispEdges">' + "".join(rects) + "</svg>\n")


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w") as f:
        f.write(text)


def main():
    for name in ANIMALS:
        poses = pose_grids(name)
        for suffix, grid in poses.items():
            write(os.path.join(SPRITES, f"{name}{suffix}.svg"), render(grid, DISPLAY))
        if name in ALT_SWAPS:
            for suffix, grid in poses.items():
                write(os.path.join(SPRITES, f"{name}-alt{suffix}.svg"),
                      render(swap_colours(grid, ALT_SWAPS[name]), DISPLAY))
    for name in CRITTERS:
        for suffix, grid in pose_grids(name).items():
            write(os.path.join(SPRITES, f"{name}{suffix}.svg"), render(grid, DISPLAY))
    for phase in PHASES:
        for name, grid in emblem_grids(phase).items():
            suffix = "" if phase == "day" else f"-{phase}"
            write(os.path.join(EMBLEMS, f"{name}{suffix}.svg"), render(grid, EMBLEM))
    for name, grid in {**alarm_grids(), **bell_grids(), **tree_grids(), **ui_icon_grids()}.items():
        write(os.path.join(ICONS, f"{name}.svg"), render(grid, 14))
    for name, grid in confetti_grids().items():
        write(os.path.join(SPRITES, f"{name}.svg"), render(grid, DISPLAY))


if __name__ == "__main__":
    main()
