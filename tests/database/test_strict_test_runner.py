import io
import unittest

from scripts.run_database_safety_tests import run_strict


def suite_of(*tests):
    class Cases(unittest.TestCase):
        pass

    suite = unittest.TestSuite()
    for index, (name, body) in enumerate(tests):
        def method(self, body=body):
            body(self)
        method.__name__ = name
        setattr(Cases, name, method)
        suite.addTest(Cases(name))
    return suite


def ok(self):
    self.assertTrue(True)


def skip(self):
    self.skipTest("requires a database")


def fail(self):
    self.fail("boom")


def error(self):
    raise RuntimeError("boom")


class StrictRunnerTests(unittest.TestCase):
    def run_it(self, *tests):
        return run_strict(suite_of(*tests), stream=io.StringIO())

    def test_all_passing_without_skips_succeeds(self):
        code, summary = self.run_it(("test_a", ok), ("test_b", ok))
        self.assertEqual(code, 0, summary)
        self.assertIn("skipped=0", summary)

    def test_passing_test_whose_name_contains_skipped_is_not_a_skip(self):
        code, summary = self.run_it(("test_matching_ledger_row_is_skipped_without_apply", ok))
        self.assertEqual(code, 0, summary)

    def test_actual_skip_fails(self):
        code, summary = self.run_it(("test_a", ok), ("test_needs_database", skip))
        self.assertEqual(code, 1)
        self.assertIn("were skipped", summary)
        self.assertIn("requires a database", summary)

    def test_failure_fails(self):
        code, summary = self.run_it(("test_a", ok), ("test_b", fail))
        self.assertEqual(code, 1)
        self.assertIn("failures=1", summary)

    def test_error_fails(self):
        code, summary = self.run_it(("test_a", ok), ("test_b", error))
        self.assertEqual(code, 1)
        self.assertIn("errors=1", summary)

    def test_empty_run_fails(self):
        code, summary = run_strict(unittest.TestSuite(), stream=io.StringIO())
        self.assertEqual(code, 1)
        self.assertIn("no tests", summary)


if __name__ == "__main__":
    unittest.main()
