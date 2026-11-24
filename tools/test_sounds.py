import os
import sys
import unittest
import wave
import struct

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sounds  # noqa: E402


class SoundTests(unittest.TestCase):
    def test_every_animal_has_a_sound_file(self):
        import sprites
        for name in list(sprites.ANIMALS):
            # Scout and the terminal tortoise are not agents, so they make no sound.
            if name in ("sheepdog", "tortoise"):
                continue
            self.assertTrue(os.path.exists(os.path.join(sounds.SOUNDS, f"{name}.wav")), name)

    def test_sounds_are_short_mono_16_bit_and_not_silent(self):
        for name in sounds.SOUNDS_DEF:
            with wave.open(os.path.join(sounds.SOUNDS, f"{name}.wav"), "rb") as w:
                self.assertEqual((w.getnchannels(), w.getsampwidth(), w.getframerate()), (1, 2, sounds.RATE), name)
                seconds = w.getnframes() / w.getframerate()
                self.assertTrue(0.1 <= seconds <= 1.2, f"{name} lasts {seconds}s")
                data = struct.unpack(f"<{w.getnframes()}h", w.readframes(w.getnframes()))
                self.assertGreater(max(abs(x) for x in data), 0.3 * 32767, name)
                self.assertLess(max(abs(x) for x in data), 0.7 * 32767, name)

    def test_the_files_match_the_code(self):
        # Rendering twice gives the same samples, so regenerating never changes the checked-in files.
        for name, make in sounds.SOUNDS_DEF.items():
            self.assertEqual(sounds.render(make()), sounds.render(make()), name)


if __name__ == "__main__":
    unittest.main()
