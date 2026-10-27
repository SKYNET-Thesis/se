# Homepage V2 integration into SKYNET (feature/ui-homepage-v2-integration)

For the owner's acceptance before any commit or push. No Git command was run (no commit, push, merge or
rebase), and no pull request was opened.

- **SOURCE:** `E:\CapStone\RobotEdu\RobotEdu`, branch `feature/ui-homepage-v2`, **working tree**
  (includes the uncommitted H6.9 Checkpoint 3 changes).
- **TARGET:** this repository, `web/robot-edu`.

## 1. What changed in TARGET

**Added (55 files, same relative paths: SOURCE `apps/web/src/<x>` → TARGET `web/robot-edu/src/<x>`):**
- `pages/home-v2/HomeV2.tsx`
- `components/home-v2/**`: 23 files (chapters, scene director, header, media, `v2.css`, `journey/`,
  `modes/`, `schools/`)
- `components/home/**`: only the 18 files `/home-v2` imports (CTA, reveal, `home.css`, lesson one
  content, fallbacks, media manifest `homeAssets.ts`, visuals). The old `/home` page was not moved
- `components/home-lab/**`: only the 7 files `/home-v2` imports (`robotScene`, `RobotCanvas`,
  `stlWorker`, `envWorker`, `jaw`, `lessonProgram`, `useLessonPlayer`). This includes the H6.9
  model-loader fix: a failed mesh goes to the poster, never false-ready
- 5 unit tests from the V2 dependency graph: `modes/model`, `modes/experiences`, `ModesChapter`,
  `journey/loopModel`, `home-lab/lessonProgram`
- `src/vite-env.d.ts`: the standard Vite type reference (`vite/client`), with the existing
  `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` and `VITE_API_BASE_URL` declared

No existing file was overwritten: the copy refused any path that already existed, and it refused none.

**Edited (3 files):**
- `package.json`: one line, `"@types/three": "0.186.0"` in `devDependencies` (pinned).
- `package-lock.json`: adds `@types/three` and its own type dependencies only (`@types/webxr`,
  `@types/stats.js`, `@tweenjs/tween.js`, `fflate`, `meshoptimizer`, `@dimforge/rapier3d-compat`);
  **no existing version changed**.
- `App.tsx`: two additions only.
  - A lazy import gated on `import.meta.env.DEV || VITE_HOME_V2_PREVIEW === 'true'`.
  - `<Route path="home-v2">` beside `login`, **outside `RequireSession`**.

  No route, guard or provider was changed. A default production build does not register the route.

**Reused, not copied:** `hooks/useMediaQuery.ts` and `utils/cn.ts` (identical), and
`contexts/SupabaseSessionContext.tsx` (the team's file; `useSupabaseSession().session` is all V2 needs).
`public/assets/so101` (URDF and 13 STL) was byte-identical, so nothing was copied.

**Not moved (by decision):** `home-modes-lab`, `home-direction-lab`, `/home-lab`, the old `/home` page,
`homeAssets.spec.tsx` (decision D), and any `.taste-skill`, QA image, backup, cache or `.env` file.

**SOURCE:** not modified. 0 files in `apps/web/src`, `apps/web/public`, `apps/web/*` or `docs` changed
since the integration began. npm was not run in SOURCE.

## 2. Baseline issues already in TARGET (before the integration)

| Issue | Evidence | Effect |
| --- | --- | --- |
| **Windows case clash:** `pages/school/ClassroomStudentImport.tsx` and `classroomStudentImport.ts` | On case-insensitive Windows, `import './ClassroomStudentImport'` resolves to the `.ts` helper | **`vite build` fails, and the dev server does not load any page** (all routes, before and after the integration). It should work on case-sensitive Linux. Not changed: team file |
| TypeScript | `tsc --noEmit`: **99 errors** before the integration (unused variables, the `teaching_assistant` role type, `So101Viewer3D` without `three` types, missing `import.meta.env` types) | `vite build` does not type-check, so these do not block a Linux build |

To verify on Windows anyway, the build and the dev server were run with a **verification-only config
kept outside the repository** (`vite.verify.config.mjs`). It is TARGET's own config plus a case-exact
resolver for relative imports, imitating a Linux file system. No TARGET file was changed for this.

## 3. Results

| Check | Result |
| --- | --- |
| `npm ci` (lockfile baseline) | OK, 414 packages |
| TypeScript, before → after | **99 → 88 errors; 0 new errors, 0 errors in integrated files.** Fixed as a side effect: `import.meta.env` types (3 team files) and `three` types (`So101Viewer3D`) |
| Unit tests, before → after | **14 files / 59 tests → 19 files / 92 tests, all pass** |
| ESLint, before → after | 0 errors / 12 warnings → **0 errors** / 18 warnings (6 new, all `react-refresh/only-export-components` in integrated files) |
| Default production build (verification config) | **Builds.** No V2 text or STL worker in the output: the preview is not included |
| Preview build (`VITE_HOME_V2_PREVIEW=true`) | **Builds**; includes V2, `stlWorker` and `envWorker` |
| `/home-v2` at 1440 × 900 and 390 × 844 | All 9 chapters render, **0 runtime errors** |
| Team routes at 1440 and 390: `/login`, `/`, `/my-learning`, `/courses`, `/teacher`, `/teacher/classes`, `/school`, `/school/users`, `/admin/users`, `/lab`, `/studio`, unknown path | Protected routes redirect to `/login` (session guard), and the login page renders. **0 runtime errors.** Only `/home-v2` renders V2 |
| V2 regression `qa-v2` (keyboard, 53 Tab stops, reduced motion, **no-WebGL poster**, SO-101 render, every interaction, Learning Modes) | **61/61** |
| Learning Loop `qa-h68` (scroll both ways, manual, keyboard, no flicker, phone, short screen, zoom) | **64/64** |
| Motion (headings, hero exit, Loop and Modes timing; with and without reduced motion) | **8/8** |
| Checkpoint prerequisites (Target A contrast, covered Loop screens inert and unfocusable, Roles captions) at 4 sizes | **18/18** |

**Not completed when this report was written** (the QA run was still going: alive, not hung; results
land in the session scratch folder `integ/qa.log` and `integ/qa/`):

| Step | Status |
| --- | --- |
| Loading (all 3D windows, including Safety) | Running |
| Failure → poster | Not yet run |
| Teach-by-demonstration framing (4 sizes) | Not yet run |
| Learning Loop on phone, continuous scroll | Not yet run |
| Closing Scene gap on phone | Not yet run |
| Frame timing: p95, frames over 33 ms, long tasks | Not yet run |

In SOURCE (H6.9 Checkpoint 3), on the same code, these measured:
- **Failure → poster:** 4/4.
- **Demonstration framing:** no cut at 4 sizes.
- **Phone Loop:** a flick settles in about 0.46 s.
- **Frame timing:** desktop p95 20.7 ms; frames over 33 ms 8 / 16; no long tasks.

Re-check them on TARGET before acceptance.

**Not testable here:**
- **Signed-in flows** (Dashboard, Teacher, Student, School Admin content): TARGET has no `.env.local`,
  and SOURCE's was not copied because it holds credentials. Only routing and guards were checked.
- **Real devices:** not tested; all evidence is headless Chrome on one Windows laptop.

## 4. Open items for the team

1. **Case clash in `pages/school`:** blocks the build and the dev server on Windows (before the
   integration). Renaming one of the two files would fix it; that is the team's decision.
2. **88 existing TypeScript errors** (none from Homepage V2).
3. **Release blockers kept from H6.9:**
   - No approved Homepage media (0 of 19).
   - No Apache-2.0 licence copy or attribution file next to `public/assets/so101`.
   - SO-101 meshes 16 MB raw (5.9 MB gzipped).
4. **H6.9 QA checklist still to confirm on TARGET:**
   - Phone Loop under continuous scroll.
   - Demonstration framing.
   - Closing Scene gap on a phone.
   - Frame timing.
   - Real-device testing.
5. **`/home-v2` stays a preview route:** it is not the homepage and is not in a default production
   build.
