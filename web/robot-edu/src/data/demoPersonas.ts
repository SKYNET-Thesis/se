import type { Role } from '../types/user';

/** DEMO personas for the role preview switcher. This is not authentication. */
export const demoPersonas: Record<Role, {name: string;firstName: string;detail: string;}> = {
  student: { name: 'Maya Okafor', firstName: 'Maya', detail: 'Year 10 · Robotics A' },
  teacher: { name: 'Daniel Reyes', firstName: 'Daniel', detail: 'Engineering faculty' },
  admin: { name: 'Priya Nair', firstName: 'Priya', detail: 'IT services' }
};