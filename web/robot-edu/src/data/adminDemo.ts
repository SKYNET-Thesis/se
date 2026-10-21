import type { DemoUser, RobotResource, RoleDefinition, SystemSettings } from '../types/user';
import { daysFromNow } from '../utils/format';

/** DEMO RECORDS — no identity provider is connected. */
export const demoUsers: DemoUser[] = [
{ id: 'u1', name: 'Maya Okafor', email: 'maya.okafor@school.example', role: 'student', status: 'active', group: 'Year 10 · Robotics A', lastActive: daysFromNow(0, 9) },
{ id: 'u2', name: 'Leo Martins', email: 'leo.martins@school.example', role: 'student', status: 'active', group: 'Year 10 · Robotics A', lastActive: daysFromNow(-1, 15) },
{ id: 'u3', name: 'Aisha Rahman', email: 'aisha.rahman@school.example', role: 'student', status: 'active', group: 'Year 10 · Robotics A', lastActive: daysFromNow(-1, 11) },
{ id: 'u4', name: 'Tom Becker', email: 'tom.becker@school.example', role: 'student', status: 'active', group: 'Year 11 · Robotics B', lastActive: daysFromNow(0, 8) },
{ id: 'u5', name: 'Sofia Lindqvist', email: 'sofia.lindqvist@school.example', role: 'student', status: 'invited', group: 'Year 11 · Robotics B', lastActive: null },
{ id: 'u6', name: 'Daniel Reyes', email: 'daniel.reyes@school.example', role: 'teacher', status: 'active', group: 'Engineering faculty', lastActive: daysFromNow(0, 7) },
{ id: 'u7', name: 'Hannah Cole', email: 'hannah.cole@school.example', role: 'teacher', status: 'active', group: 'Engineering faculty', lastActive: daysFromNow(-3, 12) },
{ id: 'u8', name: 'Priya Nair', email: 'priya.nair@school.example', role: 'admin', status: 'active', group: 'IT services', lastActive: daysFromNow(0, 10) },
{ id: 'u9', name: 'Marco Bianchi', email: 'marco.bianchi@school.example', role: 'student', status: 'suspended', group: 'Year 11 · Robotics B', lastActive: daysFromNow(-20, 10) }];


export const roleDefinitions: RoleDefinition[] = [
{
  role: 'student',
  label: 'Student',
  description: 'Takes courses, writes programs and runs simulations.',
  permissions: ['View published courses', 'Create and edit own programs', 'Run simulations', 'Submit assignments']
},
{
  role: 'teacher',
  label: 'Teacher',
  description: 'Authors course content and reviews student work.',
  permissions: ['Everything a student can do', 'Create and edit courses and lessons', 'Create assignments', 'Review and grade submissions', 'Request robot lab sessions']
},
{
  role: 'admin',
  label: 'Administrator',
  description: 'Manages people, robots and platform settings.',
  permissions: ['Manage users and roles', 'Register robot resources', 'Change system settings', 'Approve real-robot execution (once integrated)']
}];


export const demoRobotResources: RobotResource[] = [
{ id: 'r1', name: 'Bench 1 · Dual-arm', model: 'VISTA educational dual-arm (model TBD)', location: 'Lab 2.14', integration: 'not_configured', notes: 'Awaiting robot control backend endpoint.' },
{ id: 'r2', name: 'Bench 2 · Dual-arm', model: 'VISTA educational dual-arm (model TBD)', location: 'Lab 2.14', integration: 'pending_verification', notes: 'Network drop installed; safety review scheduled.' }];


export const defaultSettings: SystemSettings = {
  institutionName: 'Northfield Secondary School',
  defaultSimulationSpeed: 1,
  autosaveSeconds: 1,
  allowStudentExport: true,
  requireValidationBeforeSubmit: true
};