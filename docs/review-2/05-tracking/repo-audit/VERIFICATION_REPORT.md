# Review 2 verification report

| Directory | Command | Result | Evidence |
|---|---|---|---|
| Education API | `npm test` | PASSED | 27 suites, 188 tests; expected sanitized failure logs from negative-path tests |
| Education API | `npm run build` | PASSED | TypeScript |
| Education API | `npx prisma validate --schema prisma/schema.prisma` | PASSED | schema valid; dummy local URL |
| web | `npm test`; `npm run lint`; `npm run build` | PASSED | 14 files/59 tests; lint 0 errors/12 pre-existing warnings; Vite chunk-size warning |
| runtime | `python -m unittest discover -s tests -v` | PASSED | 13 tests; fake runtime |
| CHECKIK | `PYTHONPATH=. .venv/bin/python -m pytest -q tests/test_wf03_command_adapter.py` | PASSED | 7 tests; fake follower |
| root | `python -m compileall -q services/ai-integration/src edge/raspberry-pi-agent/src` | PASSED | syntax only; no package tests exist |
| mobile | `npm run typecheck`; `npx expo install --check` | PASSED WITH WARNING | no test script; Expo used offline bundled map |
| root | `docker compose config --quiet`; `git diff --check` | PASSED | config/whitespace |

No command contacts live Supabase, AWS or hardware.
