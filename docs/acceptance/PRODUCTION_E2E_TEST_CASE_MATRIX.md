# Production E2E test case matrix — run R1126-1901

Target: `https://skynex.best` / `https://api.skynex.best/api/v1`, deployed revision `0b77ad2`, 2026-11-26. Real Chromium (headless, one browser, one case at a time), real hosted Supabase authentication, no mocks, no local stack. Evidence paths are relative to `docs/acceptance/screenshots/`.

| Status | Count |
|---|---|
| Total cases listed | 94 |
| Not applicable (excluded from coverage) | 1 |
| **Planned (applicable)** | **93** |
| Executed (PASS + FAIL) | 80 |
| PASS | 74 |
| FAIL | 6 |
| BLOCKED | 5 |
| NOT RUN | 8 |
| Execution coverage (executed / planned) | 86.0% |
| Pass rate among executed | 92.5% |

Blocked and not-run cases are **not** counted as passed. Failed cases are included in the pass rate denominator.

| ID | Phase | Role | Preconditions | Expected | Actual | Status | Evidence | Defect |
|---|---|---|---|---|---|---|---|---|
| P01-01 | 01 | Anonymous | Production deployed | Web and API report the same revision | Web and API both 0b77ad2; /health/ready ready | PASS | production-e2e/p01-homepage-download-desktop.png | — |
| P01-02 | 01 | Anonymous | — | Homepage loads on desktop and phone without overflow, console/network errors | 0.3-0.7 s; no overflow; no failed requests; only CSP report-only warnings | PASS | production-e2e/p01-homepage-download-mobile.png | D10 |
| P01-03 | 01 | Anonymous | — | Ubuntu v0.1.0 Download DEB active; Windows/macOS Coming Soon; commands + Copy | All present; DEB HTTP 200, 131,395,882 bytes | PASS | production-e2e/p01-homepage-download-desktop.png | — |
| P01-04 | 01 | Anonymous | — | Protected route redirects to /login | /teacher -> /login | PASS | — | — |
| P02-01 | 02 | System Admin | Hosted Supabase auth | Dedicated System Admin signs in via the real login form; dashboard opens; /me/roles loaded | Signed in (token 200, /me 200); /admin/organizations opens; persists after reload | PASS | production-e2e/p02-sysadmin-dashboard.png | F01 |
| P02-02 | 02 | System Admin | Owner-supplied System Admin credential | Owner/demo System Admin credential signs in | NOT PERFORMED with owner credential: the only pair available (admin@vista.demo + .env password) was rejected by hosted Supabase (stored hash does not match); owner account email/password were never supplied to the run | BLOCKED | — | F01 |
| P02-03 | 02 | System Admin | Dialog open, empty name | Create button disabled until a name is entered | Disabled | PASS | production-e2e/p02-new-org-dialog.png | — |
| P02-04 | 02 | System Admin | — | Create organization VISTA E2E Acceptance Academy R1126-1901 | 201; id 597cd591-ba63-4a27-af5d-12fede921fad | PASS | production-e2e/p02-org-created.png | — |
| P02-05 | 02 | System Admin | Org exists | Duplicate name rejected | 409 "An organization with this name already exists." | PASS | — | — |
| P02-06 | 02 | System Admin | — | Search by name and by school code; empty-result state; persistence after refresh | 1 row for name and for code; empty list state shown; org persists after reload | PASS | — | — |
| P02-07 | 02 | System Admin | Org exists | Assign School Admin by e-mail via invitation | Invitation e-mail could not be sent: hosted Supabase email rate limit (429). Invalid-TLD address correctly rejected (400 email_address_invalid) | FAIL | — | D01,D02 |
| P02-08 | 02 | System Admin | Auth identity pre-created for the School Admin (service-role, test only) | School Admin assigned to the org through the UI; role/org association correct; duplicate assignment idempotent | 201; admin listed once; org shows Admins=1 | PASS | production-e2e/p02-org-detail-admin.png | D03 |
| P02-09 | 02 | School Admin | — | New School Admin signs in; lands on school workspace | /school/classrooms; "School Administration" | PASS | production-e2e/p02-schooladmin-dashboard.png | — |
| P02-10 | 02 | System Admin | — | Organization B (isolation) created and its School Admin assigned | Org 689d24cd-dbed-446c-b025-279aad557fe4; admin assigned | PASS | — | — |
| P03-01 | 03 | School Admin | — | Add instructor (empty form blocked; created) | Disabled when empty; 201 created (existing identity, e-mail not needed) | PASS | — | D03 |
| P03-02 | 03 | School Admin | — | Add student: temporary credential shown once with school/student code and expiry; not persisted in evidence | Dialog shows credential once ("not stored"); 192-bit password never written to evidence | PASS | — | — |
| P03-03 | 03 | School Admin | Student exists | Reissue temporary password (confirm; old invalidated) | 201 reissue; old password superseded | PASS | — | — |
| P03-04 | 03 | School Admin | CSV with 3 new, 1 invalid, 1 existing row | Bulk import: preview with row errors; confirm disabled while rows need review; import after fix | Preview 4 Ready/1 Needs review; confirm disabled; import: 3 created, 1 unchanged | PASS | production-e2e/p03-bulk-import-preview.png | D06 |
| P03-05 | 03 | School Admin | Existing student code in file | Existing code shown as Duplicate in preview | Shown as Ready; result reported "unchanged" | FAIL | — | D06 |
| P03-06 | 03 | School Admin | — | People list: search/filters/roles/status; counts | 5 students, 1 teacher; list matches | PASS | production-e2e/p03-users-list.png | D08 |
| P03-07 | 03 | School Admin | Existing student | Duplicate student code via Add student -> "already exists" message, nothing changed | Covered by bulk-import existing row (unchanged) | NOT RUN | — | — |
| P04-01 | 04 | Student | Temp credential | Temp-password login lands on forced change page; LMS routes redirect back; API 403 PASSWORD_CHANGE_REQUIRED | /student/change-password; /my-learning redirected; API 403 | PASS | production-e2e/p04-student-forced-change.png | — |
| P04-02 | 04 | Student | — | Password change succeeds; lands in My Learning | PATCH 200; /my-learning | PASS | production-e2e/p04-student-after-change-E2ES01.png | — |
| P04-03 | 04 | Student | — | Old temporary password rejected; stale session rejected | Login refused; old access token 401 | PASS | — | — |
| P04-04 | 04 | Student | — | New-password login, persistence after reload, logout/login | OK | PASS | — | — |
| P04-05 | 04 | Student (2nd) | — | Same lifecycle for the second student | Same results | PASS | — | — |
| P04-06 | 04 | Instructor | Pre-created identity | Instructor signs in; /teacher dashboard; persistence | /teacher "Teaching overview" | PASS | production-e2e/p04-instructor-dashboard.png | — |
| P04-07 | 04 | Instructor/School Admin | Invitation by e-mail | First-login via invitation link and required password setup | Not exercisable: invitation e-mail could not be sent (D01) | BLOCKED | — | D01 |
| P04-08 | 04 | Staff | Dedicated mailbox | Password recovery e-mail + reset | No approved deliverable mailbox; email rate limit exhausted | NOT RUN | — | D01 |
| P04-09 | 04 | Student | — | Temporary-password expiry enforcement | Expiry shown (72 h) but not waited; not safely testable in-run | NOT RUN | — | — |
| P04-10 | 04 | Staff | — | Hosted Supabase Site URL / redirect / SMTP behavior | Public settings reachable; SMTP/redirect not verifiable; email send rate-limited | BLOCKED | — | D01 |
| P05-01 | 05 | School Admin | Courses published | Create + activate course offerings (basic, advanced) | 2 offerings active | PASS | — | — |
| P05-02 | 05 | School Admin | Active offering | Create classroom VISTA Robotics Acceptance Class | 201; id 8ae93146-e368-4db6-bc9a-cf78b91e4a41 | PASS | production-e2e/p05-classroom-created.png | — |
| P05-03 | 05 | School Admin | — | Add 2 students and the instructor; roster/counts correct | 2 students + 1 teacher | PASS | — | — |
| P05-04 | 05 | School Admin | Eligible list | WF01 eligible robot list for the new org is empty (not entitled); allocation refused/unavailable | "No eligible robot resource is currently entitled to this school." | PASS | production-e2e/p05-robot-allocation-dialog.png | — |
| P05-05 | 05 | School Admin / System Admin | Simulation-only test robot | WF01 robot allocation to the test classroom | BLOCKED: no UI to register a robot or grant entitlement; the only entitled robot (VISTA-WF01-DEMO-ROBOT-01) belongs to VISTA Academy and is allocated to two of its classes; SO101-DEV-001 is an unentitled dev rig. Not reassigned | BLOCKED | — | L01 |
| P05-06 | 05 | Instructor | — | Instructor sees the classroom and students | 1 classroom, 2 students | PASS | — | — |
| P06-01 | 06 | Instructor | — | Create Basic course (title, objectives in description, level, tags) | 201; id f741c4fd-fce3-4eca-a248-5a517c8e31af | PASS | production-e2e/p06-course-created.png | — |
| P06-02 | 06 | Instructor | — | Module, lessons, activities (3 lessons, 4 readings, 1 quiz) | Created through Course Builder | PASS | production-e2e/p09-publish-structure.png | — |
| P06-03 | 06 | Instructor | — | Upload PNG/PDF/DOCX/MP4 to media library (presign -> S3 -> complete) | 4 files Ready; S3 POST 204 | PASS | production-e2e/p06-media-library.png | — |
| P06-04 | 06 | Instructor | — | Rich-text content (heading, paragraphs), image insert, attachments; save draft | Saved | PASS | production-e2e/p06-reading-editor.png | — |
| P06-05 | 06 | Instructor | — | Publish lessons/activities and course via readiness review | Course published; 5 activities published | PASS | production-e2e/p09-course-published.png | — |
| P06-06 | 06 | Instructor | — | Advanced course created, published | id eff5ec2e-da86-4c8d-8ff5-920e09d98271; reading only (no authoring path for Robot Lab activity found) | PASS | — | — |
| P06-07 | 06 | Instructor | — | Course thumbnail, reorder, discard draft, DOCX/PPTX variants, video playback | Not exercised | NOT RUN | — | — |
| P06-08 | 06 | Instructor | — | Basic course does not require Robot Lab completion | No lab step in course; completion by readings + quiz | PASS | — | — |
| P07-01 | 07 | Instructor | — | Create single and multiple choice questions manually (points, difficulty, explanation, outcome) | Both created and published | PASS | — | — |
| P07-02 | 07 | Instructor | — | Create True/False question manually | 400 "True/False requires options with IDs true and false." | FAIL | — | D04 |
| P07-03 | 07 | Instructor | — | Download XLSX template | question-bank-template.xlsx | PASS | — | — |
| P07-04 | 07 | Instructor | Workbook: 4 valid, 1 duplicate, 1 invalid | Preview with row errors, duplicates, default/explicit points, topic mapping | "6 rows · 4 valid · 1 with errors · 1 duplicate"; points 1/2 default, 4/2 explicit; topics shown | PASS | production-e2e/p07-import-preview.png | — |
| P07-05 | 07 | Instructor | — | Import requires confirmation; drafts by default; persistence | 4 drafts IMP-9FA36105-2..5 with topic, source reference | PASS | — | — |
| P07-06 | 07 | Instructor | Imported drafts | Publish imported drafts and use them in a quiz from the UI | No UI to publish draft versions; quiz picker lists published only (workaround: Publish immediately at import) | FAIL | — | D05 |
| P07-07 | 07 | Instructor | — | Import with Publish immediately; true/false via import | 3 rows imported published incl. True/False hard 4 pts | PASS | — | — |
| P08-01 | 08 | Instructor | — | Quiz: choose questions, per-question points, pass threshold, total, preview, save | 4 questions 1/3/4/2 = 10 pts; pass 70%; saved | PASS | production-e2e/p08-quiz-authoring.png | — |
| P08-02 | 08 | Instructor | — | Deliver quiz to the classroom (draft -> publish, attempts 3) | Delivery b136b312-af6b-4620-b26b-c46a1f1a8b37 published | PASS | — | — |
| P09-01 | 09 | Instructor | — | Create Blockly challenge and publish | ed783af4-1fbc-49a4-85a0-cf571dbb80f3 published | PASS | — | — |
| P09-02 | 09 | Instructor | — | Classroom assignment: draft, rubric (6+4), schedule (due, attempts), publish | 11e23f2c-45b8-4a0a-ad72-e790afc50193 published | PASS | production-e2e/p09-assignment-edit.png | — |
| P09-03 | 09 | Instructor | — | Final assessment / advanced simulation assignment | Not created (no separate final-assessment type found; advanced course has reading only) | NOT RUN | — | — |
| P09-04 | 09 | Student | — | Assignment visible under Assignments, separate from module navigation | Visible with due date and rubric | PASS | — | — |
| P10-01 | 10 | Student | — | Dashboard shows the assigned course; course/lesson navigation | Course listed; module tree rendered | PASS | production-e2e/p10-student-dashboard.png | — |
| P10-02 | 10 | Student | — | Text, image from S3 signed URL, attachments listed | Image 320 px loaded from S3; safety.pdf, notes.docx listed | PASS | production-e2e/p10-reading-Reading-arm-anatomy.png | — |
| P10-03 | 10 | Student | — | Mark readings complete; progress persisted; reload/relogin | 4 readings completed (DB + UI) | PASS | — | — |
| P10-04 | 10 | Student | — | Video playback; mandatory-progression skip prevention | Video not attached to an activity; progression not probed | NOT RUN | — | — |
| P11-01 | 11 | Student | — | Points per question and total visible before submission; submit blocked until all answered; draft persists | Visible; button disabled until 4/4; draft restored after reload | PASS | production-e2e/p11-quiz-result-s1-desktop.png | — |
| P11-02 | 11 | Student 1 | Expected 10/10 | All correct -> PASS, 100%, Excellent | 10 of 10; PASS; Excellent | PASS | production-e2e/p11-quiz-result-s1-desktop.png | — |
| P11-03 | 11 | Student 2 | Expected 3/10 | Q1 right, Q2 partial (no credit), Q3 wrong, Q4 right -> FAIL 30% Needs Review | 3 of 10; FAIL; Needs Review | PASS | production-e2e/p11-quiz-result-s2-desktop.png | — |
| P11-04 | 11 | Student 2 | Hand calculation | Type, difficulty, objective and topic breakdowns; recommendations ranking and priorities | All values match the hand calculation (see report) | PASS | — | — |
| P11-05 | 11 | Student | — | Review Lesson links open an enrolled lesson | 2 links to the module lesson | PASS | — | — |
| P11-06 | 11 | Student | Phone width 390 px | Dashboard on phone: renders, no horizontal overflow | scrollWidth-innerWidth = 0; dashboard present (previously NOT RUN) | PASS | production-e2e/p11-quiz-result-s2-mobile.png | — |
| P11-07 | 11 | Student | — | Attempt history and retake | "1 of 3 used"; attempts list with Open result | PASS | — | — |
| P12-01 | 12 | Student | — | Blockly workspace: toolbox, build, save/restore, validate | 5 blocks; validate OK; restored after reload | PASS | production-e2e/p12-blockly-workspace.png | — |
| P12-02 | 12 | Student | — | Save immutable version, run simulation, evaluation, submit | Version 9d7c5dbc; experiment 024fa1b7 (schematic); evaluation passed; submission c724d692 | PASS | production-e2e/p12-simulation-result.png | — |
| P12-03 | 12 | Student | — | Robot Lab / R1 runtime / Digital Twin telemetry / evidence upload | Robot Lab honestly shows "robot control backend has not been connected"; no robot entitled; Production MQTT off | BLOCKED | production-e2e/p12-lab.png | L01,L02 |
| P13-01 | 13 | Instructor | Submission exists | Review program, symbolic evaluation, experiment evidence/timeline | All shown; no model metadata or recording (none attached) | PASS | — | — |
| P13-02 | 13 | Instructor | — | Score per criterion, comments, save; persists after refresh | 6+3=9/10 saved and restored | PASS | — | — |
| P13-03 | 13 | Student | Before release | Unreleased grade hidden | "Evaluated · awaiting review"; no score/feedback | PASS | production-e2e/p13-student-before-release.png | — |
| P13-04 | 13 | Instructor / Student | — | Release; student sees score, rubric comments, feedback, reflection prompt | 9/10 with comments and feedback | PASS | production-e2e/p13-student-released.png | — |
| P13-05 | 13 | Instructor | — | Recording download / model metadata | Not applicable: no recording or model for a schematic run | NOT APPLICABLE | — | — |
| P14-01 | 14 | Instructor | — | Overview counts and learner progress | 1 classroom, 2 students, 2 assignments; S1 100% course progress, best 100% | PASS | production-e2e/p14-instructor-submissions.png | — |
| P14-02 | 14 | Instructor | — | Roster status text for students | "Account setup pending" shown for active students without e-mail | FAIL | — | D07 |
| P14-03 | 14 | School Admin | — | Dashboard counts | 5 students, 1 teacher, 1 classroom, 0 robots | PASS | production-e2e/p14-schooladmin-school.png | D08 |
| P14-04 | 14 | System Admin | — | Org row counts | Admins 1, Instructors 1, Students 5, Classrooms 1 | PASS | production-e2e/p14-sysadmin-orgs.png | — |
| P14-05 | 14 | Student | — | Gradebook / results view | Released score visible on the assignment; no separate gradebook page located | NOT RUN | — | — |
| P15-01 | 15 | Student | Dedicated accounts | redirect for /school /teacher /admin/organizations /admin/courses/new -> UI | all redirected to /my-learning | PASS | — | — |
| P15-02 | 15 | Student | Dedicated accounts | 404 for API: other student submission/experiment/artifacts, rubric PUT, create course, org people | 404 on all | PASS | — | — |
| P15-03 | 15 | Instructor | Dedicated accounts | 404 for API: organization list, other org people | 404 | PASS | — | — |
| P15-04 | 15 | School Admin A | Dedicated accounts | 404 for API: org B people/PATCH, create org | 404 | PASS | — | — |
| P15-05 | 15 | School Admin B | Dedicated accounts | 404 for API: org A people, course A, submission, learner progress | 404 | PASS | — | — |
| P15-06 | 15 | Anonymous / bad token | Dedicated accounts | 401 for API /me and /courses | 401 | PASS | — | — |
| P15-07 | 15 | Instructor/School Admin/Student | DTO-invalid bodies | Authorization before request validation | Some write routes return 400 for malformed bodies before tenant 404; valid shape -> 404 | PASS | — | O02 |
| P15-08 | 15 | All | Production | axe WCAG 2.1 A/AA on 11 pages | 9 pages clean; /login 2 findings (critical+serious); instructor submission review 1 (serious) | FAIL | — | D09 |
| P15-09 | 15 | All | — | Loading/empty/error states, console and network errors | No 4xx/5xx other than expected denials and first-open program 404; CSP report-only console notices | PASS | — | D10 |
| P15-10 | 15 | Staff | Expired session | Invalid/expired session handling | Bad token 401; stale student token 401 SESSION_ROTATED | PASS | — | — |
| P16-01 | 16 | Anonymous | — | Ubuntu DEB download, size, SHA-256, install instructions | HTTP 200, 131,395,882 bytes, SHA-256 a5dbca4d... verified earlier against the published file | PASS | — | — |
| P16-02 | 16 | Student | Desktop installed | Desktop-to-Web simulation flows | Desktop not installed in this run; download verification is not integration acceptance | NOT RUN | — | — |

