import type { AssignmentStatus } from '../types/learning';
import type { BadgeTone } from '../components/ui/Badge';

export const assignmentStatusMeta: Record<AssignmentStatus, {label: string;tone: BadgeTone;}> = {
  not_started: { label: 'Not started', tone: 'outline' },
  in_progress: { label: 'In progress', tone: 'accent' },
  submitted_local: { label: 'Draft submitted', tone: 'warn' },
  reviewed: { label: 'Reviewed', tone: 'ok' }
};