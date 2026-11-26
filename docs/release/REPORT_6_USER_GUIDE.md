# VISTA — User Guide (Report 6)

Version: release candidate of 2026-11-26 (`develop` `7ac0d58`). Audience: school administrators, instructors, students and Desktop users.
Every step below was checked against the implemented screens and the automated acceptance runs listed in [FINAL_SYSTEM_ACCEPTANCE_REPORT.md](FINAL_SYSTEM_ACCEPTANCE_REPORT.md). Where something is **not available or not verified**, this guide says so. Screenshots are in `docs/acceptance/screenshots/`.

> **What "simulation" means in VISTA.** Blockly runs, the Digital Twin and the local Robot Lab runs shown in this guide are **simulations or a mock runtime**. They never move a physical robot, and every result screen labels itself accordingly. Physical SO-101 operation is **not** part of this release.

## 1. Signing in

Open the VISTA web app and choose **Sign in**. There is no public self-registration.

| Who | How |
|---|---|
| Instructors, School Administrators, System Administrators | **Email** tab: email and password. Use **Forgot password** to reset. |
| Students | **Student** tab: **School code**, **Student code** and the password or code your school gave you (setup code or recovery code). |

Notes
- The student *temporary password* with forced first-login change is implemented but **disabled by default and not released to Production** (it needs a database migration the owner has not approved). Use the setup/recovery code your school provides. See `docs/operations/student-temp-password.md`.
- Sessions expire; if the app says you were signed out, sign in again. Account details are under **Account**.

## 2. School Administrator

Navigation: **School overview**, **Teachers & students**, **Classrooms**, **Import users**, **Roles & permissions**, **School profile**; and **Courses**, **Offerings**, **Quizzes**, **Course catalogue**, **Robot Control & Practice**.

| Task | Steps |
|---|---|
| Check or rename the school | School profile → edit name → **Save name** |
| Add or deactivate an instructor | Teachers & students → **Add instructor**; use **Deactivate** / **Reactivate** on a person |
| Create users in bulk | Import users (CSV); review the result list |
| Create a classroom | Classrooms → **Create classroom**; open it to see **Classroom details**, add members (**Add member**) |
| **Allocate a robot to a classroom** (WF-01) | Classroom details → **Allocate robot** → pick an eligible robot. A robot already allocated elsewhere is refused with a clear message; a robot of another organization is never offered |
| Review roles | Roles & permissions (read-only matrix of school roles) |
| Course and lesson management | Courses → **Create Course** / **Create Draft**; add modules (**Add module**), lessons and activities (**Quick Add Reading**, **Quick Add Quiz**, **+ Add Paragraph**); **Save Draft**, then an **Instructor publishes** (a School Administrator can author courses but cannot publish — this is intentional) |

Data from other schools is never visible to you; a link to another school's classroom shows "not found".
Reference screenshots: `school-admin-overview.png`, `school-admin-people.png`, `school-admin-profile.png`, `school-admin-roles.png`.

## 3. Instructor

Navigation: **Overview**, **My Classes**, **Course builder**, **Assignments**, **Blockly challenges**, **Quizzes**, **Submissions**.

### 3.1 Course and lesson management
Course builder → open or create a course → tab **Outline & Editor**: add modules, lessons, learning sections and activities; **Save Draft**; **Review & Publish** → **Publish Course**. Published courses are visible to enrolled students; published content is versioned (**Save version**) so earlier student work is not rewritten.

### 3.2 Question Bank import (Excel/CSV)
Course builder → lesson → **Quizzes** tab → **Questions** → **Import questions**. Full column list and rules: [QUESTION_BANK_IMPORT_GUIDE.md](../education/QUESTION_BANK_IMPORT_GUIDE.md). In short:
1. Download the template (**XLSX** or **CSV**) and fill it. Types: single choice, multiple choice, true/false. Difficulty `easy`/`medium`/`hard` gives default points **1 / 2 / 3**; an explicit `points` value is kept.
2. Upload it. **Nothing is saved yet.** The preview marks each row valid, invalid or duplicate, shows points, topic and mapping, and explains each row error. **Download error report (CSV)** exports the problems.
3. Choose a Learning Outcome for rows that have none, tick **I reviewed this preview…**, and import.
4. Questions are imported as **drafts** unless you tick *Publish immediately*. **Current limitation (Production E2E D05):** the web app has no screen to publish a draft question, and the quiz builder lists only published questions, so tick *Publish immediately* for questions you intend to use in a quiz right away.
Limits: 1 MB, 500 rows, `.csv`/`.xlsx` only; formulas are never evaluated; re-importing the same file reports duplicates instead of creating copies; rows succeed or fail independently; other schools' instructors and students are refused.
The English demonstration course files are in `docs/education/pilot/en-demo-course/`; their explanations are **generated drafts awaiting instructor review** (`PENDING_REVIEW`) — review them before publishing.

### 3.3 Quizzes
Quizzes → **Create quiz draft** → add questions from the bank; each question's **points are shown and editable here** (defaults come from difficulty) → **Save quiz as draft** → **Publish**. Grading is automatic and all-or-nothing per question (no partial credit). Editing a question later never changes an attempt a student already made (questions are versioned).

### 3.4 Assignments (WF-02)
Assignments → new assignment → choose course/lesson/class, instructions, **Add criterion** for a rubric (**Save rubric**), schedule (**Save schedule**) → **Publish to students**. Assignments are separate from module navigation: students find them under **Assignments**.

### 3.5 Review, grade and give feedback (WF-04)
Submissions (or My Classes → class → submission): read the work, open the evidence (**Download evidence** for experiment telemetry), enter scores per criterion, comments → **Save assessment** → **Release grade & feedback**. **Reopen grading** and **Withdraw release** correct a released grade; every correction is audited. The student sees the feedback only after you release it.
Model metadata appears on the evidence screen when a model was attached; it is empty otherwise. External AI assessment is not part of this release.
Screenshots: `journey-instructor-grading.png`, `wf03/wf03-instructor-evidence-review.png`.

## 4. Student

Navigation: **Dashboard**, **Courses**, **My Learning**, **Course Catalog**, **Learning Path**, **Assignments**; plus **Programming Studio** and **Robot Control & Practice** where enabled.

### 4.1 Learn
My Learning → course → lesson → activities (readings, demonstrations, quizzes). Progress is saved. A module's mini-quiz is at the end of the module.

### 4.2 Mini-quiz, automatic grading and results
Open the quiz: **points per question and the total are shown before you start**. Answer, then **Submit quiz**. You get a weighted score, **Passed** / **Not passed yet**, and a result screen (use **Start a new attempt** to retake). The result dashboard shows:
- Weighted score (points earned / possible) and question accuracy, shown separately.
- Performance rating: 90%+ Excellent, 80%+ Good, 70%+ Satisfactory, 50%+ Needs Improvement, below 50% Needs Review. The rating is informational; **PASS/FAIL follows the quiz's pass threshold**.
- Correct, incorrect and unanswered counts; breakdown by question type and difficulty; by topic and learning objective where the questions carry that data.
- **Suggested review**: up to five recommendations, ranked by points lost, each with a priority and a **Review Lesson** link to a lesson you are enrolled in. When there is too little data the screen says **Insufficient Evidence** instead of guessing. Recommendations are rule-based; no external AI is used.
Screenshots: `quiz-dashboard/quiz-result-pass.png`, `quiz-result-fail.png`. Not verified: dark mode (the app has none) and a dedicated phone-width check of the dashboard.

### 4.3 Blockly programming
Assignment or Practice → **Practice workspace**: build the program from the allowed blocks (blocks outside the lesson's toolbox are refused and never deleted silently). The workspace autosaves (*Saved to VISTA*).
- **Validate** checks your blocks.
- **Save version** creates an immutable version; **Run simulation** (enabled after a saved, unmodified version) runs it in the browser simulation and shows **Simulation Passed** or what failed.
- **Run & evaluate** evaluates the mission as often as you like; **Submit assignment** is the separate, final step. After your instructor grades it you see the released result and can **Save reflection**.
Screenshot: `journey-student-grade.png`.

### 4.4 Robot Lab and Digital Twin (simulation)
Open the lesson's **Physical Experiment** activity. You can start only if your classroom has an allocated robot, you are entitled, and the symbolic (Blockly) step has passed; otherwise the screen explains what is missing.
1. Read **Explicit Simulation Confirmation Checklist**, tick all three confirmations (local fake follower only; no physical robot connected; you authorize this local run).
2. **Confirm & Run Local Simulation**. Status goes RUNNING → SUCCEEDED (or a clear failure: runtime unavailable, timeout, rejected program, duplicate run refused).
3. The **Digital Twin viewer** shows the six joints from the run, labelled `SIMULATION`; it shows a stale state if telemetry stops and reconnects by itself.
4. Evidence: a telemetry file (`sourceMode: SIMULATION`) is stored for the run. Download it from the result screen; it is available only to you and your instructor. If the object is missing the screen says so instead of failing.
A successful simulated run is recorded but does **not** complete a physical lesson (by design). Screenshot: `wf03/wf03-student-run-result.png`.

### 4.5 Assignments
Assignments → open → **Submit assignment**; the status is shown; after grading you see score and feedback (only once released).

## 5. Ubuntu Desktop Lab Station

Scope: **Ubuntu amd64 only** (tested on Ubuntu 26.04.1; other releases are not claimed). Windows and macOS are **Coming Soon**; there is no AppImage.

**Availability.** v0.1.0 is published and was verified on 2026-11-26 (anonymous download works; size 131,395,882 bytes ≈ 125.3 MiB; SHA-256 `a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4`; package `vista-lab-station` 0.1.0, amd64). The Homepage **Download VISTA Desktop** section shows an active **Download DEB** button once the web release containing this change is deployed; until then Production still shows *Download unavailable*.

Install (Homepage → Command Line tab has Copy buttons):
```bash
curl -fL "https://github.com/leduc121/vista_lab/releases/download/v0.1.0/VISTA.Lab.Station-0.1.0-amd64.deb" -o /tmp/vista-lab-station.deb
echo "a5dbca4d54a28de1aae2f254b08484460efb3db6a3eeee7828d8dc24ea3ba8e4  /tmp/vista-lab-station.deb" | sha256sum -c -   # must print: OK
sudo apt install /tmp/vista-lab-station.deb
gtk-launch vista-lab-station
```
1. Download and verify the checksum (the second command must print `OK`; you may also compare with the published `SHA256SUMS`).
2. `sudo apt install /tmp/vista-lab-station.deb` (APT installs dependencies).
3. Launch **VISTA Lab Station** from the application menu or `gtk-launch vista-lab-station`.
4. Sign in with your student account. Assignments and evidence stay in the VISTA web app.
Simulation Profile: no GPU needed. Robotics Profile (advanced): needs an operator-managed Python 3.12.14 environment and an authorized VISTA Edge checkout selected in Settings; it is not bundled. **Physical robot operation is not certified by this release.** Full Desktop↔Web end-to-end acceptance has **not been run**.

## 6. Troubleshooting

| Symptom | What to do |
|---|---|
| "Not found" for a classroom, course or file | You may be in a different school or role; ask your administrator. This is also the safe answer for other schools' data |
| Cannot start the Physical Experiment | Read the message: no robot allocated, not entitled, or Blockly step not passed yet; ask your instructor |
| Run shows a runtime/timeout error | Retry once; if it repeats, tell your instructor — the lab runtime may be offline |
| Evidence "unavailable" | The stored file is missing; the run record still exists; ask your instructor |
| Import rejected | Read the row errors; fix the file; check the 1 MB / 500-row limits and the template header |
| "Import must be explicitly confirmed" | Tick the review confirmation after previewing |
| Session expired / signed out | Sign in again; use Forgot password for staff accounts |
| Download button unavailable on the Homepage | The deployed web version predates the verified-download change (see section 5) |
| `sha256sum` does not print OK | Delete the file and download again; do not install a package that fails the check |

## 7. Known limitations

- Simulation and mock runtime only; no physical robot acceptance, no AWS end-to-end acceptance in this release.
- No AI/VLA inference or AI assessment; instructor assessment only.
- Question import is per lesson; rows are not one transaction (the result lists imported/skipped/failed).
- Vietnamese pilot question explanations repeat the correct option (content review pending); English demo explanations are generated drafts pending review.
- No dark mode.
- The temporary-password student login is not enabled in Production.
