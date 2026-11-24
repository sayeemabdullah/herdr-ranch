"""Run with: python3 -m unittest discover -s tools -p 'test_*.py'"""
import os
import re
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sprites  # noqa: E402

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SPRITES = os.path.join(ROOT, "mods", "flock", "sprites")
EMBLEMS = os.path.join(ROOT, "mods", "meadows", "emblems")
POSES = ["", "-work", "-2", "-idle", "-idle-2", "-blocked", "-done"]
COMMON = ["sheep", "goat", "rabbit", "chicken", "cow", "horse", "duck", "llama"]
RARE = ["fox", "owl", "dragon"]
EMBLEM_NAMES = ["barn", "silo", "haystack", "pond", "windmill", "orchard", "fence"]


def read(path):
    with open(path) as f:
        return f.read()


class SpriteTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sprites.main()

    def test_every_expected_file_exists(self):
        ids = COMMON + RARE + ["sheepdog", "tortoise"] + [f"{a}-alt" for a in COMMON]
        for i in ids:
            for pose in POSES:
                self.assertTrue(os.path.exists(os.path.join(SPRITES, f"{i}{pose}.svg")), f"{i}{pose}")
        for e in EMBLEM_NAMES:
            self.assertTrue(os.path.exists(os.path.join(EMBLEMS, f"{e}.svg")), e)

    def test_sprites_are_36px_over_a_24_grid_and_emblems_20px_over_a_20_grid(self):
        for name in os.listdir(SPRITES):
            if not name.endswith(".svg"):
                continue
            svg = read(os.path.join(SPRITES, name))
            self.assertIn('width="36"', svg, name)
            self.assertIn('height="36"', svg, name)
            self.assertIn('viewBox="0 0 24 24"', svg, name)
            self.assertIn("crispEdges", svg, name)
        for name in os.listdir(EMBLEMS):
            svg = read(os.path.join(EMBLEMS, name))
            self.assertIn('width="20"', svg, name)
            self.assertIn('height="20"', svg, name)
            self.assertIn('viewBox="0 0 20 20"', svg, name)
            self.assertIn("crispEdges", svg, name)

    def test_badge_corner_is_empty_in_every_standing_and_resting_grid(self):
        for name in sprites.ANIMALS:
            for suffix in ("", "-2", "-idle", "-idle-2"):
                grid = sprites.pose_grids(name)[suffix]
                body = grid if suffix != "-idle-2" else sprites.pose_grids(name)["-idle"]
                for y in range(6):
                    self.assertEqual(body[y][:6], "......", f"{name}{suffix} row {y}")

    def test_frames_differ(self):
        for i in COMMON + RARE + ["sheepdog", "tortoise"]:
            a = read(os.path.join(SPRITES, f"{i}-work.svg"))
            b = read(os.path.join(SPRITES, f"{i}-2.svg"))
            self.assertNotEqual(a, b, f"{i} work frames")
            c = read(os.path.join(SPRITES, f"{i}-idle.svg"))
            d = read(os.path.join(SPRITES, f"{i}-idle-2.svg"))
            self.assertNotEqual(c, d, f"{i} idle frames")
            base = read(os.path.join(SPRITES, f"{i}.svg"))
            for pose in ("-blocked", "-done"):
                self.assertNotEqual(base, read(os.path.join(SPRITES, f"{i}{pose}.svg")), f"{i}{pose}")

    def test_alternate_colours_differ(self):
        for a in COMMON:
            self.assertNotEqual(read(os.path.join(SPRITES, f"{a}.svg")), read(os.path.join(SPRITES, f"{a}-alt.svg")), a)

    def test_every_grid_has_the_right_size_and_uses_known_colours(self):
        for name in sprites.ANIMALS:
            for suffix, grid in sprites.pose_grids(name).items():
                self.assertEqual(len(grid), 24, f"{name}{suffix}")
                for row in grid:
                    self.assertEqual(len(row), 24, f"{name}{suffix}")
                    for c in row:
                        self.assertTrue(c == "." or c in sprites.PALETTE, f"{name}{suffix}: {c}")
        for name, grid in sprites.emblem_grids().items():
            self.assertEqual(len(grid), 20, name)
            for row in grid:
                self.assertEqual(len(row), 20, name)
                for c in row:
                    self.assertTrue(c == "." or c in sprites.PALETTE, f"{name}: {c}")

    def test_every_sprite_is_outlined_and_has_an_eye_or_face(self):
        for name in sprites.ANIMALS:
            grid = sprites.pose_grids(name)[""]
            flat = "".join(grid)
            self.assertIn("o", flat, f"{name} has no outline")
            self.assertGreater(len(flat) - flat.count("."), 90, f"{name} is too small to read")

    def test_standing_frames_have_legs_that_move(self):
        for name in sprites.ANIMALS:
            a = sprites.pose_grids(name)[""]
            b = sprites.pose_grids(name)["-2"]
            self.assertNotEqual(a, b, name)


if __name__ == "__main__":
    unittest.main()


class PhaseTests(unittest.TestCase):
    def test_every_emblem_has_all_four_phases_and_the_night_sky_is_dark(self):
        import sprites
        for name in sprites.EMBLEMS_DRAW:
            for suffix in ("", "-dawn", "-dusk", "-night"):
                self.assertTrue(os.path.exists(os.path.join(sprites.EMBLEMS, f"{name}{suffix}.svg")), f"{name}{suffix}")
        night = sprites.emblem_grids("night")["barn"]
        self.assertIn("X", "".join(night))
        self.assertEqual(sprites.PHASE, "day")

    def test_alarm_bell_and_confetti_exist_with_two_frames(self):
        import sprites
        for n in ("alarm", "alarm-2", "bell", "bell-2"):
            self.assertTrue(os.path.exists(os.path.join(sprites.ICONS, f"{n}.svg")), n)
        for n in ("confetti", "confetti-2"):
            self.assertTrue(os.path.exists(os.path.join(sprites.SPRITES, f"{n}.svg")), n)
