#!/usr/bin/env python3
"""Builds docs/education/lms-acceptance-evidence from a directory of Playwright screenshots.

Usage: build_lms_evidence.py <screenshot-dir> [<output-dir>]

Converts PNG captures to compressed JPEG (the repository keeps a small, reviewable set) and writes manifest.json and
README.md describing every capture: screen, role, viewport, test state and capture result. The screenshots come from
disposable local fixtures (synthetic users and courses); they contain no tokens or real student data.
"""
import json, subprocess, sys, re
from pathlib import Path

src = Path(sys.argv[1]); out = Path(sys.argv[2] if len(sys.argv) > 2 else 'docs/education/lms-acceptance-evidence')
shots = out / 'screenshots'; shots.mkdir(parents=True, exist_ok=True)
overflow = {}
if (src / 'overflow.json').exists():
    for r in json.loads((src / 'overflow.json').read_text()): overflow[(r['screen'], r['width'])] = r['overflowPx']

# name prefix -> (role, state)
META = {
  'student-my-learning': ('student', 'My Learning, in-progress course cards'),
  'student-courses': ('student', 'Course catalogue'),
  'student-course': ('student', 'Course path, first module current'),
  'student-lesson': ('student', 'Module overview with activity map'),
  'student-activity': ('student', 'Reading activity with Mark as Completed'),
  'student-assignment': ('student', 'Blockly assignment with graded attempts'),
  'student-locked-course': ('student', 'Course path with module 2 locked behind module 1'),
  'student-locked-module': ('student', 'Module locked by the progression rule'),
  'student-media-activity': ('student', 'Reading with attachment cards (fixture files are not decodable images)'),
  'student-lesson-with-real-media': ('student', 'Reading with real PNG, PDF/DOCX/PPTX cards (valid files, from the media acceptance test)'),
  'student-quiz-assignment': ('student', 'Quiz page before the first attempt'),
  'student-quiz-taking': ('student', 'Weighted quiz, 4 points, pass at 70%'),
  'student-quiz-not-passed': ('student', 'Quiz result 25%, not passed, with per-question points'),
  'student-quiz-passed': ('student', 'Quiz result 100%, passed'),
  'student-quiz-delivery': ('student', 'Quiz delivery id not visible to this learner (unavailable state)'),
  'student-quiz': ('student', 'Legacy lesson-embedded practice quiz start screen'),
  'teacher-overview': ('instructor', 'Teaching overview'), 'teacher-classes': ('instructor', 'My Classes'),
  'teacher-class': ('instructor', 'Classroom: assigned learning, learner progress, quiz results'),
  'teacher-assignments': ('instructor', 'Assignments list'), 'teacher-assignment-new': ('instructor', 'Create assignment form'),
  'teacher-assignment-edit': ('instructor', 'Edit assignment with rubric and schedule'),
  'teacher-submission-review': ('instructor', 'Submission review, released grade locked'),
  'course-list': ('instructor', 'Course management list'),
  'course-builder': ('instructor', 'Course builder for a course the instructor cannot open (not-found state)'),
  'builder-unlock-course': ('instructor', 'Course builder outline with unlock-rule chip'),
  'builder-media-course': ('instructor', 'Course builder with attached materials'),
  'builder-quiz-editor': ('instructor', 'Quiz editor tab'), 'builder-module-editor': ('instructor', 'Module editor with Unlock rule'),
  'builder-publishing': ('instructor', 'Structure & Publishing tab'), 'builder-media-library': ('instructor', 'Media Library tab'),
  'builder-details': ('instructor', 'Course Details tab'), 'builder-settings': ('instructor', 'Settings tab'),
  'qb-import-preview': ('instructor', 'Question import preview with valid/duplicate/invalid rows'),
  'qb-quiz-builder': ('instructor', 'Quiz builder with imported weighted questions'),
}
entries = []
for png in sorted(src.glob('*.png')):
    m = re.match(r'(.+?)-(\d{3,4})$', png.stem)
    name, width = (m.group(1), int(m.group(2))) if m else (png.stem, None)
    role, state = META.get(name, ('n/a', 'see file name'))
    if width in (1024, 768): continue  # the full 4-width set is checked for overflow (see overflow.json summary); the repository keeps desktop and mobile images
    dest = shots / f'{png.stem}.jpg'
    r = subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(png), '-vf', "scale='min(1000,iw)':-2", '-q:v', '9', str(dest)])
    ov = overflow.get((name, width))
    entries.append({'file': f'screenshots/{dest.name}', 'screen': name, 'role': role, 'viewport': f'{width}px' if width else 'n/a',
                    'state': state, 'captured': r.returncode == 0 and dest.exists(),
                    'horizontalOverflowPx': ov if ov is not None else 'not measured'})
(out / 'overflow-all-widths.json').write_text(json.dumps([{'screen': k[0], 'viewport': f'{k[1]}px', 'horizontalOverflowPx': v} for k, v in sorted(overflow.items())], indent=1))
(out / 'manifest.json').write_text(json.dumps({'generatedFrom': 'Playwright against disposable local PostgreSQL, local S3-compatible storage and the real API', 'count': len(entries), 'entries': entries}, indent=1))
lines = ['# LMS acceptance screenshots', '', 'Generated by `scripts/build_lms_evidence.py` from Playwright captures against disposable local resources (synthetic users, no tokens).', '',
         '| Screen | Role | Viewport | State | Captured | Overflow px |', '|---|---|---|---|---|---|']
lines += [f"| [{e['screen']}]({e['file']}) | {e['role']} | {e['viewport']} | {e['state']} | {'yes' if e['captured'] else 'NO'} | {e['horizontalOverflowPx']} |" for e in entries]
(out / 'README.md').write_text('\n'.join(lines) + '\n')
print(len(entries), 'captures;', sum(1 for e in entries if not e['captured']), 'failed')
