"""Run with: python3 -m unittest discover -s tools -p 'test_*.py'"""
import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import banners  # noqa: E402
import sprites  # noqa: E402
from PIL import Image  # noqa: E402

BANNERS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "mods", "flock", "banners")


class BannerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        sprites.main()
        banners.main()

    def test_one_blocked_and_one_done_banner_per_character_and_variant(self):
        ids = list(sprites.ANIMALS) + [f"{a}-alt" for a in sprites.ALT_SWAPS]
        for i in ids:
            for pose in ("blocked", "done"):
                self.assertTrue(os.path.exists(os.path.join(BANNERS, f"{i}-{pose}.png")), f"{i}-{pose}")
        self.assertEqual(len(os.listdir(BANNERS)), len(ids) * 2)

    def test_banners_are_120px_with_transparent_corner_and_hard_5px_blocks(self):
        im = Image.open(os.path.join(BANNERS, "sheep-done.png")).convert("RGBA")
        self.assertEqual(im.size, (120, 120))
        self.assertEqual(im.getpixel((119, 119))[3], 0)
        for by in range(0, 120, 5):
            for bx in range(0, 120, 5):
                block = {im.getpixel((x, y)) for x in range(bx, bx + 5) for y in range(by, by + 5)}
                self.assertEqual(len(block), 1, f"block {bx},{by} is not one flat colour")


if __name__ == "__main__":
    unittest.main()
