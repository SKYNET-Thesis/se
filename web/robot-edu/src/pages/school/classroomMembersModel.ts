import type { ApiRecord } from '../../lib/api';

/**
 * A02 roster view model. GET .../classrooms/:id/members returns active members only, ordered by classroom role then
 * name, with: id, user_id, classroom_role ('student' | 'teacher'), status, joined_at, full_name, email, membership_role.
 * Nothing here invents fields the API does not return.
 */
export type ClassroomRole = 'student' | 'teacher';
export type MemberRoleFilter = 'all' | ClassroomRole;
export interface ClassroomMember { id: string; userId: string; role: ClassroomRole; name: string; email: string | null; joinedAt: string | null }

export const MEMBER_ROLE_FILTERS: Array<{ value: MemberRoleFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'student', label: 'Students' },
  { value: 'teacher', label: 'Teachers' },
];

const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export function toClassroomMember(record: ApiRecord): ClassroomMember {
  return {
    id: String(record.id),
    userId: String(record.user_id),
    role: record.classroom_role === 'student' ? 'student' : 'teacher',
    name: text(record.full_name) ?? 'Unnamed member',
    email: text(record.email),
    joinedAt: text(record.joined_at),
  };
}

export function memberCounts(members: ClassroomMember[]): Record<MemberRoleFilter, number> {
  const students = members.filter((member) => member.role === 'student').length;
  return { all: members.length, student: students, teacher: members.length - students };
}

export function filterMembers(members: ClassroomMember[], filters: { search: string; role: MemberRoleFilter }) {
  const needle = filters.search.trim().toLowerCase();
  return members.filter((member) => (filters.role === 'all' || member.role === filters.role)
    && (!needle || member.name.toLowerCase().includes(needle) || (member.email ?? '').toLowerCase().includes(needle)));
}

export const roleLabel = (role: ClassroomRole) => (role === 'student' ? 'Student' : 'Teacher');

/** "12 Nov 2026"-style date in the viewer's locale; null when the API sent nothing parseable. */
export function joinedLabel(joinedAt: string | null, locale?: string) {
  if (!joinedAt) return null;
  const date = new Date(joinedAt);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
}

/** Only students can be removed: DELETE .../members/:studentId matches classroom_role = 'student' (404 otherwise). */
export const canRemove = (member: ClassroomMember) => member.role === 'student';
