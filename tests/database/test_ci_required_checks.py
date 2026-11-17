import unittest

from scripts.ci_required_checks import IF_PRESENT, REQUIRED, evaluate, is_head


def run(name, status="completed", conclusion="success", id=1):
    return {"name": name, "status": status, "conclusion": conclusion, "id": id}


def all_green():
    return [run(name, id=index) for index, name in enumerate(REQUIRED, 1)]


class RequiredChecksTests(unittest.TestCase):
    def test_required_checks_are_the_branch_protection_set(self):
        self.assertEqual(set(REQUIRED), {"api", "web", "docker", "database-safety", "validate-inventory"})

    def test_all_green_succeeds(self):
        self.assertEqual(evaluate(all_green()), ("success", []))

    def test_every_single_failure_blocks_deployment(self):
        for name in REQUIRED:
            for conclusion in ("failure", "cancelled", "timed_out", "action_required", "skipped", "neutral"):
                runs = [run(r["name"], conclusion=conclusion if r["name"] == name else "success", id=r["id"]) for r in all_green()]
                state, reasons = evaluate(runs)
                self.assertEqual(state, "failed", f"{name}={conclusion}")
                self.assertTrue(any(name in reason for reason in reasons))

    def test_missing_or_running_checks_are_pending_never_success(self):
        for name in REQUIRED:
            self.assertEqual(evaluate([r for r in all_green() if r["name"] != name])[0], "pending", name)
            running = [run(r["name"], status="in_progress", conclusion=None, id=r["id"]) if r["name"] == name else r for r in all_green()]
            self.assertEqual(evaluate(running)[0], "pending", name)
        self.assertEqual(evaluate([])[0], "pending")

    def test_failure_wins_over_pending(self):
        runs = [r for r in all_green() if r["name"] != "web"] + [run("api", conclusion="failure", id=99)]
        self.assertEqual(evaluate(runs)[0], "failed")

    def test_latest_attempt_supersedes_an_earlier_one(self):
        runs = all_green() + [run("docker", conclusion="failure", id=0)]  # older failed attempt, newer success
        self.assertEqual(evaluate(runs)[0], "success")
        runs = all_green() + [run("docker", conclusion="failure", id=100)]  # re-run that failed
        self.assertEqual(evaluate(runs)[0], "failed")

    def test_path_filtered_bootstrap_may_be_absent_but_must_not_fail(self):
        self.assertEqual(IF_PRESENT, ("fresh-bootstrap",))
        self.assertEqual(evaluate(all_green())[0], "success")
        self.assertEqual(evaluate(all_green() + [run("fresh-bootstrap", conclusion="failure", id=50)])[0], "failed")
        self.assertEqual(evaluate(all_green() + [run("fresh-bootstrap", status="in_progress", conclusion=None, id=50)])[0], "pending")
        self.assertEqual(evaluate(all_green() + [run("fresh-bootstrap", id=50)])[0], "success")

    def test_unrelated_failing_checks_do_not_block(self):
        self.assertEqual(evaluate(all_green() + [run("typecheck", conclusion="failure", id=70)])[0], "success")

    def test_only_the_branch_head_may_deploy(self):
        sha = "a" * 40
        self.assertTrue(is_head(sha, sha))
        self.assertFalse(is_head("b" * 40, sha))
        self.assertFalse(is_head("", sha))


if __name__ == "__main__":
    unittest.main()
