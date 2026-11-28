# Production test data manifest (2026-11-27)

Identifiers only. **No passwords, tokens or keys appear here.** Credential files are in `~/.vista-acceptance/20261127-phaseA/` (dir 0700, files 0600), outside Git.

| Object | Identifier |
|---|---|
| E2E organization (school code `E2E1901`) | `597cd591-ba63-4a27-af5d-12fede921fad` |
| Isolation organization B (`E2E1901B`) | `689d24cd-dbed-446c-b025-279aad557fe4` |
| Classroom "VISTA Advanced Simulation Class" | `9c09e27d-a4d6-425d-824e-5474cb206e68` |
| Classroom "Robotics Acceptance" | `8ae93146-e368-4db6-bc9a-cf78b91e4a41` |
| Advanced course | `eff5ec2e-da86-4c8d-8ff5-920e09d98271` |
| Classroom assignment (WF02/WF03) | `b148af29-378a-41e6-bc28-64e29bdb8eee` |
| Robot `VISTA-WF01-DEMO-ROBOT-01` (SO-101) | `f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| AWS IoT Thing / client id | `vista-demo-f1c066c4-b5f2-45c4-b933-f034f3824dd9` |
| Safety profile `student-blockly-demo` | `2909efba-926e-42b2-97e8-044020910789` |
| Student `VTEST112701` | user `feedb291-4c39-4273-ad2e-6852dab0d3e0`, membership `38ce1b18-a900-45ab-bdae-0bfd7021f0ca` (enrolled in the Advanced class; Blockly safety profile assigned with owner approval) |
| Student `VTEST112702`–`VTEST112709` | imported, password-change-required, unused (credentials in `import/credentials.json`, protected) |
| Student `VTEST112710` | **owner-reserved — do not touch** |
| Student `E2ES01` | `f9eb7496-9369-449f-9b9f-9368122fa410` — **do not touch** |
| System Admin (E2E) | user `174006bb…` (password reset with owner approval) |
| System Admin (main) `admin@vista.demo` | user `8919ae68…` (password set by the owner) |
| Instructor (E2E) | user `f20b9ba3…` (password reset with owner approval) |

## Acceptance artifacts created today
| Artifact | Value |
|---|---|
| WF03 attempt #2 (VTEST112701) | attempt `2cb290c1-3a9e-4688-a0a8-a2db1a726887`, experiment `ad2826a9-4724-461f-b619-31414ad0a483`, submission `ae2d4743-b65b-4740-997f-50b93f719d6d` |
| Earlier attempt (run before the Twin fix) | attempt `14623daa…`, experiment `f0b0a52f…`, submission `d260aa70…` |

## Reversal / cleanup
- Safety profile: `provision-robot-entitlement --clear-blockly-student feedb291-… --confirm`.
- Lab Session: End Lab Session in the instructor UI (done; robot `Available`).
- Acceptance students may be deactivated from `/admin/students` after the defense; no deletion of audit rows.

## Approval request — additional Production test content (NOT created; owner approval required)
Purpose: close the LMS/Course Builder/Question Bank/Quiz/Gradebook Production cases that were blocked because the E2E class has no quiz or authored content. Scope: the existing E2E organization `597cd591-…` and class `9c09e27d-…` only; synthetic text; no real student data; no grades for real students (only `VTEST112701`, already used for acceptance).
| # | Object | Exact content | Cleanup |
|---|---|---|---|
| 1 | Course (organization-owned) | "E2E Acceptance Course 20261127", 1 module, 1 lesson with 1 reading activity | archive after acceptance |
| 2 | Media | one 50 KB PNG uploaded through Learning Media | delete via UI |
| 3 | Question Bank | import `docs/education/Question_Bank_Template.xlsx` variant with 4 questions: 2 single-choice (weights 1, 2), 1 multiple-choice (weight 2), 1 multiple-choice with a partial-credit trap; mapping + validation preview exercised, one deliberately invalid row | questions retired |
| 4 | Quiz / mini-quiz | module-end mini-quiz of the 4 questions, pass threshold 60 %, weights visible before submit, feedback text per question | unpublish |
| 5 | Offering + delivery | offering for the course, delivered to class `9c09e27d-…` | deactivate offering |
| 6 | Attempts | `VTEST112701` takes the quiz three times: all-correct (pass), partial multiple-choice (partial/zero per rule), below threshold (fail) | none (attempt rows remain) |
| 7 | Gradebook/analytics | instructor opens gradebook and learner-progress for the class | none |
Acceptance evidence recorded in `PRODUCTION_TEST_CASE_MATRIX.md` rows LMS-01, QUIZ-01..03, ASSIGN-01 and the Course Builder/Question Bank/Excel rows. Estimated effort: 45 minutes with the existing browser automation. **Do not execute until the owner says "approved: Production test content".**
