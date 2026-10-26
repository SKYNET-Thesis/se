export type Role = 'student' | 'teacher' | 'admin';

export const student = {
  name: 'Nguyen Bao Ngoc',
  firstName: 'Bao Ngoc',
  code: 'VISTA-STU-001',
  grade: 'Grade 3',
  school: 'VISTA Academy',
  progress: 42,
};

export const teacher = { name: 'VISTA Demo Instructor', role: 'Instructor' };

export const course = {
  title: 'Robot Discovery',
  summary: 'Understand how robots move, sense and interact through practical lessons.',
  progress: 42,
  next: 'Robot Coordinate Systems',
  lessons: [
    { number: '01', title: 'Getting Started', state: 'Completed', duration: '6 min' },
    { number: '02', title: 'Robot Motion', state: 'Completed', duration: '9 min' },
    { number: '03', title: 'Coordinate Systems', state: 'Current', duration: '8 min' },
    { number: '04', title: 'Programming the Robot', state: 'Locked', duration: '12 min' },
    { number: '05', title: 'Robot Lab', state: 'Locked', duration: 'VISTA Web' },
  ],
};

export const classA = {
  name: 'Robotics Class A',
  code: 'ROBOTICS-A',
  students: 24,
  staff: 1,
  resource: 'VISTA Classroom Demo Robot Resource',
  model: 'SO-101',
  serial: 'VISTA-WF01-DEMO-ROBOT-01',
};

export const people = [
  { name: 'Nguyen Bao Ngoc', code: 'VISTA-STU-001', detail: 'Grade 3', progress: 68, state: 'Active', initials: 'NB' },
  { name: 'Tran Minh Anh', code: 'VISTA-STU-002', detail: 'Grade 3', progress: 54, state: 'Active', initials: 'TM' },
  { name: 'Le Gia Huy', code: 'VISTA-STU-003', detail: 'Grade 3', progress: 31, state: 'Setup pending', initials: 'LG' },
  { name: 'Pham Ha Linh', code: 'VISTA-STU-004', detail: 'Grade 3', progress: 76, state: 'Active', initials: 'PH' },
];

export const taskGroups = [
  { title: 'Robot Motion Exercise', meta: '12 of 24 submitted', note: '5 need review', state: 'Review' },
  { title: 'Coordinate Systems Quiz', meta: 'Due tomorrow', note: '18 assigned', state: 'Upcoming' },
  { title: 'Robot Lab 01', meta: '24 of 24 submitted', note: 'Reviewed', state: 'Completed' },
];
