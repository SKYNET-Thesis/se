import { ApiError, type ApiSchoolClassroom } from '../lib/api';

/** Pure Classroom Management rules (A01). Limits mirror the education-admin DTOs; the server stays authoritative. */
export const CLASSROOM_LIMITS = { name: 160, code: 80, description: 1000, offeringCode: 80, offeringTitle: 200, capacityMin: 1, capacityMax: 10000 } as const;

export const classroomPath = (id: string) => `/school/classrooms/${id}`;

export type ClassroomStatusFilter = 'all' | 'active' | 'archived' | 'completed';
export const STATUS_FILTERS: Array<{ value: ClassroomStatusFilter; label: string }> = [
  { value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'completed', label: 'Completed' },
];

export function classroomStatusPresentation(status: string): { label: string; tone: 'ok' | 'neutral' | 'outline' } {
  if (status === 'active') return { label: 'Active', tone: 'ok' };
  if (status === 'archived') return { label: 'Archived', tone: 'neutral' };
  if (status === 'completed') return { label: 'Completed', tone: 'outline' };
  const label = status ? status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, ' ') : 'Unknown';
  return { label, tone: 'neutral' };
}

export const isArchived = (classroom: Pick<ApiSchoolClassroom, 'status'>) => classroom.status === 'archived';
/** The service rejects offering changes on archived classrooms ("Reactivate the classroom before changing its course offering."). */
export const canReassignOffering = (classroom: Pick<ApiSchoolClassroom, 'status'>) => !isArchived(classroom);
/** The service reactivates archived or completed classrooms; an active classroom can be archived. */
export const lifecycleAction = (classroom: Pick<ApiSchoolClassroom, 'status'>): 'archive' | 'reactivate' => (classroom.status === 'active' ? 'archive' : 'reactivate');

export function parseStatusFilter(value: string | null): ClassroomStatusFilter {
  return STATUS_FILTERS.some((item) => item.value === value) ? (value as ClassroomStatusFilter) : 'all';
}

export function statusCounts(classrooms: ApiSchoolClassroom[]): Record<ClassroomStatusFilter, number> {
  const counts: Record<ClassroomStatusFilter, number> = { all: classrooms.length, active: 0, archived: 0, completed: 0 };
  for (const classroom of classrooms) if (classroom.status in counts && classroom.status !== 'all') counts[classroom.status as ClassroomStatusFilter] += 1;
  return counts;
}

export function filterClassrooms(classrooms: ApiSchoolClassroom[], filters: { search: string; status: ClassroomStatusFilter }): ApiSchoolClassroom[] {
  const term = filters.search.trim().toLocaleLowerCase();
  return classrooms
    .filter((classroom) => filters.status === 'all' || classroom.status === filters.status)
    .filter((classroom) => !term || [classroom.name, classroom.code, classroom.offering_title ?? ''].some((value) => value.toLocaleLowerCase().includes(term)))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

export function enrollmentLabel(classroom: Pick<ApiSchoolClassroom, 'student_count' | 'capacity'>): string {
  return classroom.capacity ? `${classroom.student_count} / ${classroom.capacity}` : String(classroom.student_count);
}

export interface ClassroomFormValues { name: string; code: string; description: string; capacity: string; courseId: string; offeringCode: string; offeringTitle: string }
export type ClassroomFormField = keyof ClassroomFormValues;
export type ClassroomFormErrors = Partial<Record<ClassroomFormField, string>>;
export type ClassroomFormMode = 'create' | 'edit';

export const emptyClassroomForm: ClassroomFormValues = { name: '', code: '', description: '', capacity: '', courseId: '', offeringCode: '', offeringTitle: '' };
export function classroomFormFrom(classroom: ApiSchoolClassroom): ClassroomFormValues {
  return { ...emptyClassroomForm, name: classroom.name, code: classroom.code, description: classroom.description ?? '', capacity: classroom.capacity ? String(classroom.capacity) : '' };
}

/** Field order is the visual order, so the first error is the first field to focus. */
export const FORM_FIELD_ORDER: ClassroomFormField[] = ['name', 'code', 'courseId', 'offeringCode', 'offeringTitle', 'description', 'capacity'];

export function validateClassroomForm(values: ClassroomFormValues, mode: ClassroomFormMode, existingCapacity?: number | null): ClassroomFormErrors {
  const errors: ClassroomFormErrors = {};
  const required = (field: ClassroomFormField, label: string, max: number) => {
    const value = values[field].trim();
    if (!value) errors[field] = `Enter a ${label}.`;
    else if (value.length > max) errors[field] = `Use ${max} characters or fewer (now ${value.length}).`;
  };
  required('name', 'classroom name', CLASSROOM_LIMITS.name);
  required('code', 'classroom code', CLASSROOM_LIMITS.code);
  if (values.description.trim().length > CLASSROOM_LIMITS.description) errors.description = `Use ${CLASSROOM_LIMITS.description} characters or fewer (now ${values.description.trim().length}).`;
  const capacity = values.capacity.trim();
  if (capacity) {
    const parsed = Number(capacity);
    if (!/^\d+$/.test(capacity) || parsed < CLASSROOM_LIMITS.capacityMin || parsed > CLASSROOM_LIMITS.capacityMax) errors.capacity = 'Enter a whole number from 1 to 10,000.';
  } else if (mode === 'edit' && existingCapacity) {
    // The update contract cannot clear capacity yet (it accepts 1–10,000 only), so an empty field must not look like it removed the limit.
    errors.capacity = 'Capacity can’t be removed yet. Enter a number from 1 to 10,000.';
  }
  if (mode === 'create') {
    if (!values.courseId) errors.courseId = 'Choose a catalog course.';
    required('offeringCode', 'school offering code', CLASSROOM_LIMITS.offeringCode);
    if (values.offeringTitle.trim().length > CLASSROOM_LIMITS.offeringTitle) errors.offeringTitle = `Use ${CLASSROOM_LIMITS.offeringTitle} characters or fewer.`;
  }
  return errors;
}

export const firstErrorField = (errors: ClassroomFormErrors) => FORM_FIELD_ORDER.find((field) => errors[field]);

export function createRequests(values: ClassroomFormValues) {
  const capacity = values.capacity.trim();
  return {
    offering: { courseId: values.courseId, code: values.offeringCode.trim(), title: values.offeringTitle.trim() || undefined },
    classroom: { name: values.name.trim(), code: values.code.trim(), description: values.description.trim() || undefined, capacity: capacity ? Number(capacity) : undefined },
  };
}

/** PATCH body. An empty description is sent as "" because the service stores a blank description as null (cleared). */
export function updateRequest(values: ClassroomFormValues): { name: string; code: string; description: string; capacity?: number } {
  const capacity = values.capacity.trim();
  return { name: values.name.trim(), code: values.code.trim(), description: values.description.trim(), ...(capacity ? { capacity: Number(capacity) } : {}) };
}

export type CreateStep = 'offering' | 'classroom';
/** Marks which of the two create requests failed. The create flow is two independent requests (offering, then classroom);
 *  this only reports the failing step and does not compensate for an offering that was already created. */
export class ClassroomStepError extends Error {
  constructor(readonly step: CreateStep, readonly source: unknown) { super(source instanceof Error ? source.message : 'The request failed.'); }
}

/** Maps a server error onto the field it belongs to; anything else is a form-level message. */
export function apiErrorPresentation(error: unknown, step: CreateStep = 'classroom'): { field?: ClassroomFormField; message: string } {
  const source = error instanceof ClassroomStepError ? error.source : error;
  const failedStep = error instanceof ClassroomStepError ? error.step : step;
  const message = source instanceof Error && source.message ? source.message : 'The classroom could not be saved. Try again.';
  if (source instanceof ApiError && source.status === 409) return { field: failedStep === 'offering' ? 'offeringCode' : 'code', message };
  return { message };
}
