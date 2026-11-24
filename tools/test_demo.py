import os
import sys
import unittest

from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import demo_gif  # noqa: E402


class DemoGifTests(unittest.TestCase):
    def test_the_gif_exists_loops_forever_and_stays_small(self):
        self.assertTrue(os.path.exists(demo_gif.OUT))
        self.assertLess(os.path.getsize(demo_gif.OUT), 500 * 1024)
        im = Image.open(demo_gif.OUT)
        self.assertEqual(im.format, "GIF")
        self.assertEqual(im.size, (demo_gif.W, demo_gif.H))
        self.assertEqual(im.info.get("loop"), 0)
        self.assertGreater(im.n_frames, 20)

    def test_a_loop_is_the_common_multiple_of_the_layouts_periods(self):
        loop_ms = demo_gif.FRAMES * demo_gif.MS
        for period in (800, 1200, 400, 1800):
            self.assertEqual(loop_ms % period, 0, period)


if __name__ == "__main__":
    unittest.main()
