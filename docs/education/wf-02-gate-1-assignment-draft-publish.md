# WF-02 Gate 1: Assignment Draft and Publish

Gate 1 reuses `learning_assignments` for assignment content and
`learning_classroom_assignments` for classroom delivery. Creating an assignment
creates both records in one Prisma transaction. A new delivery starts as
`draft`; publishing is an explicit, classroom-scoped transition to
`published`. Publishing an already published delivery is idempotent, while
`closed` and `archived` deliveries cannot be republished.

No database migration is required. The existing classroom, membership, Course,
Lesson, Challenge, and permission relationships remain authoritative.

## Schematic content classification

The current schema has no authoritative Lesson-to-Challenge compatibility
relation. Gate 1 therefore does not require a Lesson and Challenge pair to have
appeared in an earlier Assignment.

For the Gate 1 Blockly workflow, a selectable Challenge must:

- be `published`;
- belong to the Classroom organization or be global;
- include `blockly` in `permitted_modes`; and
- have at least one `success` condition in
  `learning_challenge_conditions`, providing symbolic evaluation rules.

The success-condition requirement is deliberately conservative. Existing demo
VR and demonstration Challenges inherited the default `blockly` mode but do not
have symbolic success conditions, so `permitted_modes` alone cannot safely
identify schematic content. A future explicit capability or curriculum
compatibility relation should replace this conservative classification; Gate 1
does not add one.

Gate 1 does not start an Attempt, Experiment, control session, VR session, or
physical robot execution.
