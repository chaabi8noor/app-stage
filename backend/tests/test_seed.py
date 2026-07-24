import unittest

from app.main import is_enabled


class SeedConfigurationTests(unittest.TestCase):
    def test_only_explicit_truthy_values_enable_the_seed(self):
        for value in ("1", "true", "TRUE", "yes", "on"):
            with self.subTest(value=value):
                self.assertTrue(is_enabled(value))

    def test_falsey_values_do_not_enable_the_seed(self):
        for value in (None, "", "0", "false", "no", "off"):
            with self.subTest(value=value):
                self.assertFalse(is_enabled(value))


if __name__ == "__main__":
    unittest.main()
