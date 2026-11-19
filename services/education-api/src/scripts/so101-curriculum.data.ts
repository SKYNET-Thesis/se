import { COURSE_1 } from './so101-course1.data';
import { COURSE_2 } from './so101-course2.data';
import { COURSE_3 } from './so101-course3.data';
import type { CourseSpec } from './so101-curriculum.types';
export type { AssignmentSpec, CourseSpec, LabSpec, LessonSpec, ModuleSpec, QuestionSpec } from './so101-curriculum.types';

/** Initial SO-101 curriculum: 3 courses x 3 modules x 2 lessons, one 20-question quiz per module, 2 assignments and 2 labs per course. */
export const SO101_CURRICULUM: CourseSpec[] = [COURSE_1, COURSE_2, COURSE_3];
