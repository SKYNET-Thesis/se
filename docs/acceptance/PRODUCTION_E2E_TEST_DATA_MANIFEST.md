# Production E2E test data manifest — run R1126-1901

Identifiers and relationships only; **no credentials, tokens or temporary passwords**. Nothing was deleted. Test e-mail addresses use `example.com` (deliverable nowhere) or `vista.demo`. Credential files for the demo are outside the repository (owner holds them): `/tmp/vista-prod-e2e/.*.cred` (mode 600; lost on reboot).

## Organizations
| Entity | Id | Notes |
|---|---|---|
| Organization A | `597cd591-ba63-4a27-af5d-12fede921fad` | "VISTA E2E Acceptance Academy R1126-1901", school code E2E1901 |
| Organization B (isolation) | `689d24cd-dbed-446c-b025-279aad557fe4` | "VISTA E2E Isolation Academy R1126-1901", code E2E1901B, 1 School Admin, no other data |

## People (Organization A unless noted)
| Role | App user id | Auth user id | Code / e-mail |
|---|---|---|---|
| System Admin (E2E) | `78e311a7-4a2e-4a7f-9b96-6bf63a6de2dc` | `174006bb-62ef-4622-9d96-888db6eafe33` | e2e.sysadmin.r1126-1901@vista.demo |
| School Admin | `b97412b0-76f5-43bc-893e-5bc688caf129` | `ec9e6543-8fe7-4fc1-bdf9-964f102cfb83` | e2e.schooladmin.r1126-1901@example.com |
| Instructor | `7dbc41c1-fdd6-4e2b-8e67-2b68c3262905` | `f20b9ba3-d1b3-4368-8ced-b4c467a3c0ee` | E2EI1901 · e2e.instructor.r1126-1901@example.com |
| Student 1 | `f9eb7496-9369-449f-9b9f-9368122fa410` | — (alias) | E2ES01 |
| Student 2 | `d5cb659c-8af3-41db-8e01-1c3f3e9a9c27` | — | E2ES02 |
| Bulk students | `3523c224-a145-4c54-9bf1-cbdf01ca8a6e`, `14b21be9-3349-4eda-af8c-5a383ede8fb9`, `90eb8a37-31fd-42a3-a5f9-75e0ed410015` | — | E2ES03–E2ES05 |
| School Admin B (Org B) | `df7e8d9c-d6da-407c-b711-6214baa858a6` | `9312420f-cc9d-4c2c-b524-fba11976a424` | e2e.schooladminb.r1126-1901@example.com |

Student school code: E2E1901. Students 1–2 changed their temporary password; students 3–5 still have first-login pending.

## Academic structure
| Entity | Id |
|---|---|
| Basic course "Introduction to Robotics and Blockly R1126-1901" | `f741c4fd-fce3-4eca-a248-5a517c8e31af` (published) |
| Module (lesson) | `cd95c4ea-a91b-4a66-9d86-2a488bc2fb9e` |
| Lessons (UI "lessons" = sections) | `093ec822-289b-4c76-9721-966c018aa74d`, `de8f230b-68a8-4f73-916b-5adb6b1477ec`, `84fa5411-c057-4be7-9c20-a1eef479762c` |
| Activities | readings `5ecbd886-8b29-4660-8e27-ef9374f26cc5`, `ed9d4148-ac5b-439e-b636-1193930b473d`, `f36ecb53-9385-41c6-ac04-5a2fec641474`, `d01dd0a1-dac0-4e23-9dbe-1a8481a6892a`; quiz "Module 1 mini quiz" `6f035db0-f146-43cf-90b5-fa29a39732a7` |
| Advanced course "Advanced Robotics Simulation R1126-1901" | `eff5ec2e-da86-4c8d-8ff5-920e09d98271` (published; reading `6f94a440-7bc0-4fbf-8918-2d158ddd86e3`) |
| Offerings | basic `02dffc4b-c12e-44c6-b0a2-fcec8a2ff3c5`, advanced `de508d2e-7ecb-4ad3-af03-495b075aec0c` (both active) |
| Classroom "VISTA Robotics Acceptance Class" (E2E-CLS-1901) | `8ae93146-e368-4db6-bc9a-cf78b91e4a41`; members Students 1–2 + Instructor; robot: none |
| Media (course library) | arm.png, safety.pdf, notes.docx, arm.mp4 (all Ready; attached: png+pdf, docx ×2) |
| Questions | 2 manual (published), 4 imported drafts `IMP-9FA36105-2..5`, 3 imported published `IMP-EC290526-2..4`; quiz uses 4 (points 1/3/4/2, pass 70%) |
| Blockly challenge "Open then close the gripper R1126-1901" | `ed783af4-1fbc-49a4-85a0-cf571dbb80f3` (published) |

## Delivery, attempts, grading
| Entity | Id |
|---|---|
| Quiz delivery (classroom assignment) | `b136b312-af6b-4620-b26b-c46a1f1a8b37` (assignment `d63012fb-3797-4f9d-8d04-fa13ebe2f65d`) |
| Quiz attempts | Student 1 `07e27c30-96ca-4748-9235-b851da78f489` (10/10 PASS); Student 2 attempt (3/10 FAIL) |
| Blockly assignment | classroom assignment `11e23f2c-45b8-4a0a-ad72-e790afc50193`, assignment `cadf6c65-3310-4238-8f2a-554cff554b86` (rubric 6+4, due 2026-12-10, 3 attempts) |
| Student 1 attempt → program → version | `cc72b629-2211-4dc2-ab49-968ea5194290` → `9f48a40a-2a3a-4db8-9164-a078b20eef9e` → `9d7c5dbc-e9e5-42a8-8545-92609e5106b0` |
| Experiment (schematic) → symbolic evaluation → submission | `024fa1b7-1927-4198-93b7-75940f5a6710` → `78f7e475-64e1-427b-b8e5-2d67d80440b5` (passed) → `c724d692-5acc-457a-b3a8-1e9ac844406a` |
| Assessment | 6/6 + 3/4 = 9/10, released 2026-11-26 13:39 UTC, feedback `16ef5848-b3ff-4444-954e-2e887004b454` |
