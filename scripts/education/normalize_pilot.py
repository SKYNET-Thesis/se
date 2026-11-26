#!/usr/bin/env python3
"""Normalize the VISTA pilot content package into per-lesson Question Bank import files.

Reads (never modifies) <source>/02_Curriculum/vista_courses.json, <source>/03_Question_Bank/vista_question_bank.json
and writes, to --out:
  vi_<course>_lesson<N>.csv   the original Vietnamese questions in the importer's template layout (all 3 courses, 18 lessons)
  en_beginner_lesson<N>.csv   the complete English demonstration course (Beginner, 6 lessons) with authored explanations
  normalization_report.json   counts, exclusions and open issues

Rules (owner decisions 2026-11-26): points are left BLANK so the importer applies the default rule (easy 1, medium 2, hard 3);
explicit points are never invented. The English questions are a translation of the source glossary questions; their definitions and
explanations are generated draft content and carry "PENDING_REVIEW" in source_reference. Nothing here claims instructor approval.
Rows whose lesson or objective cannot be resolved from the curriculum file are excluded and reported, never guessed.

Usage: python3 -I scripts/education/normalize_pilot.py --source <VISTA_Education_Content> --out <dir>
"""
import argparse, csv, json, re, sys
from pathlib import Path

HEADERS = ['code', 'type', 'difficulty', 'cognitive_level', 'stem', 'option_a', 'option_b', 'option_c', 'option_d', 'option_e', 'option_f',
           'correct', 'points', 'explanation', 'source_reference', 'course', 'lesson', 'learning_section', 'topic', 'learning_objective']
BLOOM = {'Nhận biết': 'remember', 'Thông hiểu / ứng dụng': 'understand'}
EN_COURSE = 'SO-101 Foundations & Blockly (English demo)'
EN_LESSON = {  # Beginner course: lesson order -> (title, objective)
    1: ('Identifying the SO-101 and Safety', 'Recognise the arm structure, the workspace and the safe-stop rules.'),
    2: ('Joints and Coordinate Systems', 'Distinguish joint state, joint angles and end-effector coordinates.'),
    3: ('Blockly: Basic Commands', 'Assemble command blocks in sequence and check that the program is valid.'),
    4: ('Blockly: Conditions and Loops', 'Design programs with stop conditions and a finite number of repetitions.'),
    5: ('MuJoCo: Joints and Gripper', 'Observe motion in simulation before using hardware.'),
    6: ('Basic Lab: Pick and Place', 'Complete the approach, grasp, lift and place sequence in simulation.'),
}
# term -> (English definition, English explanation); keyed by lesson order. Definitions translate the source's correct option text.
EN = {
 1: {
  'Leader arm': ('The arm the operator moves by hand to send motion', 'The leader arm is the input device: the operator moves it by hand and its joint readings are sent to the follower. It does not perform the task itself, which is the follower arm\'s role.'),
  'Follower arm': ('The arm that carries out the motion it is commanded to perform', 'The follower arm is the one that actually moves and touches the workpiece, following commands from the leader arm or from a program. Knowing which arm is which tells you where hands must stay clear.'),
  'Gripper': ('The mechanism that grips or releases an object', 'The gripper is the end mechanism that holds or releases an object. It is not a joint that sets the arm\'s pose; open and close commands are separate from joint motion.'),
  'Joint': ('A joint that provides one degree of freedom of motion', 'A joint connects two links and gives the arm one degree of freedom. The arm\'s pose is the combination of all joint positions, so naming joints correctly is the basis for the coordinate lesson that follows.'),
  'Workspace': ('The region the robot can reach within its design limits', 'The workspace is the region the end of the arm can reach within its design limits. Targets outside it cannot be reached safely, and nothing, including hands, should be inside the planned motion area while the robot may move.'),
  'Emergency stop': ('A mechanism that stops motion when there is a hazard', 'An emergency stop halts motion when a hazard appears and takes priority over the running program. It is a safety mechanism, not a routine check; know where it is before any run.'),
  'Power-off inspection': ('Checking wiring and mechanisms while power is safely disconnected', 'A power-off inspection checks wiring and mechanical parts only while power is safely disconnected, so the arm cannot move unexpectedly while someone handles it.'),
  'Pinch point': ('A location where a hand could be trapped when the robot moves', 'A pinch point is a place where fingers or hands can be trapped between moving parts. Identify pinch points before a run and keep hands away while the arm may move.'),
  'Payload limit': ('The load limit that must be respected according to the hardware documentation', 'The payload limit is the maximum load stated in the hardware documentation. Exceeding it can damage the servos and cause unpredictable motion, so check the documented value rather than guessing.'),
  'Operator supervision': ('A responsible person who stops the robot when safety is lost', 'A responsible person must be present and ready to stop the robot whenever safety is lost. Supervision is a duty of the person, not a feature of the program, so an unattended run is never acceptable.'),
 },
 2: {
  'Joint position': ('The position value of each individual joint', 'Joint position is the value of each joint, usually an angle for this arm. It describes the state joint by joint, which is different from the rate of change (velocity) or from where the gripper is in space.'),
  'Joint velocity': ('The rate at which a joint position changes', 'Joint velocity is how fast a joint position changes over time. A position tells you where a joint is; the velocity tells you how quickly it is moving.'),
  'End effector': ('The last element of the kinematic chain, which acts on the environment', 'The end effector is the last element of the kinematic chain (for this arm, the gripper) and the part that acts on the environment. Cartesian targets usually refer to its position.'),
  'Joint space': ('Describing the robot state using joint variables', 'Joint space describes the robot\'s state with joint variables, one value per joint. The same pose can also be described in Cartesian space, so check which space a value belongs to.'),
  'Cartesian space': ('Describing position along coordinate axes', 'Cartesian space describes position along coordinate axes such as x, y and z, typically for the end effector. It is the "where in the world" view; joint space is the "how each joint is set" view.'),
  'Radians': ('The angle unit commonly used in simulation libraries', 'Radians are the angle unit commonly used inside simulation libraries. Mixing them up with degrees is a typical error; pass values in the unit the interface expects.'),
  'Degrees': ('The familiar angle unit that must be converted correctly when talking to an API', 'Degrees are the familiar angle unit; interfaces that use them need correct conversion when other parts of the system expect radians. A wrong unit can produce motion far from the target.'),
  'Home pose': ('The standard pose defined as the starting point of an exercise', 'The home pose is the standard pose defined as the exercise starting point, so every run starts from a known state. It is neither a limit nor a measured value.'),
  'Joint limit': ('The valid range of positions for a joint', 'A joint limit is the valid range of positions for a joint. Commands outside it must be rejected or clamped because they cannot be reached safely.'),
  'State feedback': ('Data reporting the actual or simulated position', 'State feedback is data reporting the actual (or simulated) position. It lets a program compare what was commanded with what happened, which is different from the command itself.'),
 },
 3: {
  'Move joint block': ('A block that commands the movement of one joint', 'A move joint block tells the robot to move one specific joint to a given value. Open and close gripper blocks are separate commands; use the move joint block only for joint motion.'),
  'Open gripper block': ('A block that requests the gripper to open', 'The open gripper block requests that the gripper open to release an object. It does not move any joint, so it belongs at the release step of a program.'),
  'Close gripper block': ('A block that requests the gripper to close', 'The close gripper block requests that the gripper close to hold an object. Order matters: it belongs after the approach step and before the lift.'),
  'Sequence': ('Commands that are executed in order', 'A sequence is a set of commands executed in order. Changing the order changes the behaviour; for example, closing the gripper before approaching grabs nothing.'),
  'Parameter validation': ('Checking the inputs before execution', 'Parameter validation checks inputs before execution, such as whether a joint value is within limits. It runs before the program is allowed to run, so errors are caught while nothing is moving.'),
  'ProgramVersion': ('A saved copy of the program with its own identifier', 'A ProgramVersion is a saved, identified copy of the program. Submissions and runs refer to a specific version, so later edits do not change what was submitted.'),
  'Save draft': ('Saving the content without sending it for execution', 'Saving a draft stores the content without sending it for execution. It is safe at any time and does not create a run.'),
  'Execution preview': ('Viewing the planned commands in a safe environment before they run', 'An execution preview shows the planned command sequence in a safe environment before anything runs, so mistakes are found without moving a robot.'),
  'Invalid block': ('A block with a missing or incorrect required parameter', 'An invalid block is one with a missing or wrong required parameter. The validator marks it, and the program cannot run until it is fixed.'),
  'Deterministic replay': ('Running the same program again under the same starting conditions', 'Deterministic replay runs the same program from the same starting conditions and gives the same result. It is how results can be checked and compared reliably.'),
 },
 4: {
  'If condition': ('Runs its branch only when the condition is true', 'An if condition runs its branch only when the condition is true. If the condition is false, the branch is skipped.'),
  'Else branch': ('The branch that runs when the condition is false', 'The else branch runs when the if condition is false, so exactly one of the two branches runs.'),
  'Repeat count': ('An explicit limit on the number of repetitions', 'A repeat count is an explicit limit on the number of repetitions. A loop with a stated count always ends, which is required for safe programs.'),
  'Loop guard': ('A condition that protects against an infinite loop', 'A loop guard is a condition that protects against an infinite loop by ending the repetition when it is met. Provide one together with a finite count.'),
  'Wait block': ('A block that pauses for an allowed duration', 'A wait block pauses for an allowed duration. The duration is limited, so waiting cannot stall a program indefinitely.'),
  'Stop block': ('A block that ends the program as part of its logic', 'A stop block ends the program as part of its logic. It is the program\'s controlled way to finish and is not the same as the hardware emergency stop.'),
  'Boolean': ('A value that is either true or false', 'A Boolean is a value that is either true or false. Conditions evaluate to Booleans, which decide which branch runs.'),
  'Comparison': ('An operation that compares two values', 'A comparison tests two values, for example greater than or equal, and produces a Boolean result that conditions can use.'),
  'Timeout': ('The maximum time allowed before an operation is ended', 'A timeout is the maximum time allowed before an operation is ended. It ensures a step that never completes cannot hang the program.'),
  'Trace': ('The sequence of events used to explain how a run went', 'A trace is the sequence of events recorded during a run. It lets you explain what the program did and why a result happened.'),
 },
 5: {
  'MuJoCo model': ('A description of the mechanism and the simulated environment', 'A MuJoCo model describes the mechanism and the simulated environment (bodies, joints, actuators). The simulation can only be as accurate as this description.'),
  'qpos': ('The vector of generalized coordinates of the model', 'qpos is the vector of generalized coordinates of the model; for a robot arm this is essentially the joint positions in model order.'),
  'mj_forward': ('Updates derived state without integrating time', 'mj_forward computes derived quantities such as positions and forces from the current state without advancing time. Use it to inspect a state; use mj_step to move the simulation forward.'),
  'mj_step': ('Advances the simulation by one time step', 'mj_step advances the simulation by one time step. Calling it repeatedly produces motion over time.'),
  'Actuator': ('The model component that produces a control action', 'An actuator is the model component that produces a control action, such as a drive on a joint or the gripper. Control inputs act on actuators, not directly on positions.'),
  'Joint mapping': ('Mapping the joint order of the system correctly onto the model', 'Joint mapping matches the system\'s joint order to the model\'s joint order. A wrong mapping moves the wrong joint, so verify it before trusting any simulation result.'),
  'Simulation reset': ('Restoring a known initial state', 'A simulation reset restores a known initial state, so each run starts from the same conditions.'),
  'Gripper visualization': ('Showing whether the gripper is open or closed', 'Gripper visualization shows whether the gripper is open or closed in the view. It helps you check gripper commands but is only a display.'),
  'Simulation PASS': ('A result that meets the simulation criteria but does not prove the real robot', 'A simulation PASS means the simulated run met the criteria. It does not prove that the physical robot would behave the same way.'),
  'Headless simulation': ('Running the simulation without a graphical interface', 'Headless simulation runs without a graphical window, which is useful for automated checks where nobody needs to watch.'),
 },
 6: {
  'Approach pose': ('The pose that brings the gripper near the object before grasping', 'The approach pose brings the gripper near the object before grasping. Approaching first avoids collisions and gives a controlled start to the grasp.'),
  'Grasp': ('The action of closing the gripper to hold the object', 'Grasp is closing the gripper to hold the object. It follows the approach and precedes the lift.'),
  'Lift': ('Raising the object off the surface', 'Lift raises the held object off the surface so it can be moved without dragging.'),
  'Place pose': ('The target pose for setting the object down', 'The place pose is the target pose where the object is to be set down.'),
  'Release': ('Opening the gripper to let go of the object', 'Release opens the gripper to let go of the object, after the place pose has been reached.'),
  'Collision check': ('Checking for collisions in the simulated environment', 'A collision check tests for collisions in the simulated environment. Run it to find contacts that would damage hardware before trying anything on a real robot.'),
  'Target tolerance': ('The permitted error around the target position', 'Target tolerance is the allowed error around the target position. The run counts as successful when the object ends within this tolerance.'),
  'Lab evidence': ('Result data and the trace of what was done', 'Lab evidence is the result data and execution trace. It is what an instructor reviews to confirm what happened.'),
  'Retry policy': ('The rule that allows an attempt to be repeated', 'A retry policy states when a step may be attempted again. It limits repeats so a failing step cannot loop forever.'),
  'Lab completion': ('The state of having met the defined completion criteria', 'Lab completion is the state reached when the defined criteria are met. It is judged from evidence against the criteria, not by the program merely having finished running.'),
 },
}


def term_of(question):
    return re.findall(r'"([^"]+)"', question)[-1]


def write_csv(path, rows):
    with open(path, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.writer(f); w.writerow(HEADERS); w.writerows(rows)


def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--source', required=True); ap.add_argument('--out', required=True)
    a = ap.parse_args(); src = Path(a.source); out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    courses = json.load(open(src / '02_Curriculum/vista_courses.json', encoding='utf-8'))['records']
    questions = json.load(open(src / '03_Question_Bank/vista_question_bank.json', encoding='utf-8'))['records']
    course_title = {c['Course ID']: c['Title'] for c in courses['courses']}
    lessons = {l['Lesson ID']: l for l in courses['lessons']}
    report = {'source_counts': {'courses': len(courses['courses']), 'lessons': len(lessons), 'questions': len(questions)},
              'vi_files': [], 'en_files': [], 'excluded': [], 'issues': []}
    by_lesson = {}
    for q in questions: by_lesson.setdefault(q['Lesson ID'], []).append(q)
    for lid, qs in by_lesson.items():
        lesson = lessons.get(lid)
        if not lesson or lesson['Course ID'] not in course_title:
            for q in qs: report['excluded'].append({'question': q['Question ID'], 'reason': f'lesson {lid} not resolvable from curriculum'})
            continue
        rows = []
        for q in qs:
            level = BLOOM.get(q['Bloom'])
            if not level: report['excluded'].append({'question': q['Question ID'], 'reason': f'unmapped Bloom level {q["Bloom"]!r}'}); continue
            if q['Type'] != 'SINGLE_CHOICE': report['excluded'].append({'question': q['Question ID'], 'reason': f'type {q["Type"]} not handled'}); continue
            rows.append([q['Question ID'], 'single_choice', q['Difficulty'].lower(), level, q['Question'], q['Option A'], q['Option B'], q['Option C'], q['Option D'], '', '',
                         q['Correct'], '', q['Explanation'],
                         f'{q["Source"]} | review:{q["Review Status"]} | source-outcome:{q["Learning Outcome"]}', course_title[lesson['Course ID']], str(lesson['Order']), '', lesson['Title'], 'LO-1'])
        name = f'vi_{lesson["Course ID"].split("-")[1].lower()}_lesson{lesson["Order"]}.csv'
        write_csv(out / name, rows); report['vi_files'].append({'file': name, 'rows': len(rows)})
    # English demonstration course (Beginner)
    for lid, lesson in sorted(lessons.items(), key=lambda kv: kv[1]['Order']):
        if lesson['Course ID'] != 'VISTA-BEGINNER-SO101': continue
        order = lesson['Order']; title_en, _ = EN_LESSON[order]; glossary = EN[order]
        vi_to_en, terms = {}, {}
        for q in by_lesson[lid]:
            term = term_of(q['Question']); terms[q['Question ID']] = term
            if term not in glossary: report['issues'].append(f'{q["Question ID"]}: term {term!r} has no English entry'); continue
            vi_to_en[q['Option ' + q['Correct']]] = glossary[term][0]
        rows = []
        for q in by_lesson[lid]:
            term = terms[q['Question ID']]
            if term not in glossary: continue
            opts = []
            for L in 'ABCD':
                if q['Option ' + L] not in vi_to_en: report['issues'].append(f'{q["Question ID"]}: option {L} has no English mapping'); break
                opts.append(vi_to_en[q['Option ' + L]])
            else:
                stem = (f'In the lesson “{title_en}”, which description correctly defines “{term}”?' if q['Question'].startswith('Trong bài')
                        else f'Choose the most accurate description of “{term}” in the context of {title_en}.')
                rows.append(['EN-' + q['Question ID'], 'single_choice', q['Difficulty'].lower(), BLOOM[q['Bloom']], stem, *opts, '', '', q['Correct'], '', glossary[term][1],
                             f'English translation of {q["Question ID"]} with authored explanation; PENDING_REVIEW (generated draft, not instructor-approved) | source-outcome:{q["Learning Outcome"]}',
                             EN_COURSE, str(order), '', title_en, 'LO-1'])
        write_csv(out / f'en_beginner_lesson{order}.csv', rows); report['en_files'].append({'file': f'en_beginner_lesson{order}.csv', 'rows': len(rows)})
    report['totals'] = {'vi_rows': sum(f['rows'] for f in report['vi_files']), 'en_rows': sum(f['rows'] for f in report['en_files']), 'excluded': len(report['excluded'])}
    report['open_issues'] = ['Vietnamese explanations are the source text (echo of the correct option); not improved.',
        'No learning_section values exist in the source; the column is empty. Recommendations resolve sections through learning objectives.',
        'points left blank: importer default easy 1 / medium 2 / hard 3 applies.',
        'Each lesson has one learning outcome; the importer auto-codes outcomes LO-<ordinal> per lesson, so every row references LO-1 and the source code (LO-01..LO-18) is kept in source_reference.',
        'Source Bloom level "Thông hiểu / ứng dụng" is mapped to "understand".']
    json.dump(report, open(out / 'normalization_report.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(json.dumps(report['totals']), 'issues:', len(report['issues']))
    sys.exit(1 if report['issues'] else 0)


if __name__ == '__main__':
    main()
