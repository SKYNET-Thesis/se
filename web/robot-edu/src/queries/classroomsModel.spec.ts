import { describe, expect, it } from 'vitest';
import { ApiError, type ApiSchoolClassroom } from '../lib/api';
import {
  ClassroomStepError, apiErrorPresentation, canReassignOffering, classroomStatusPresentation, createRequests, emptyClassroomForm, enrollmentLabel,
  filterClassrooms, firstErrorField, lifecycleAction, parseStatusFilter, statusCounts, updateRequest, validateClassroomForm,
} from './classroomsModel';
import { currentOffering, isRefusedOfferingError, isStaleLifecycleError, lifecycleErrorMessage, lifecycleOutcome, selectableOfferings } from './classroomLifecycleModel';

const room = (over: Partial<ApiSchoolClassroom>): ApiSchoolClassroom => ({
  id: 'c', organization_id: 'o', offering_id: 'f', name: 'Robotics A', code: 'ROB-A', description: null, capacity: null, status: 'active',
  offering_title: 'Robotics Foundations', student_count: 0, teaching_staff_count: 0, allocated_robot: null, ...over,
});

describe('classroom status', () => {
  it('presents archived as neutral, never as success', () => {
    expect(classroomStatusPresentation('active')).toEqual({ label: 'Active', tone: 'ok' });
    expect(classroomStatusPresentation('archived')).toEqual({ label: 'Archived', tone: 'neutral' });
    expect(classroomStatusPresentation('completed')).toEqual({ label: 'Completed', tone: 'outline' });
    expect(classroomStatusPresentation('setup_pending')).toEqual({ label: 'Setup pending', tone: 'neutral' });
  });
  it('follows the service lifecycle rules', () => {
    expect(lifecycleAction(room({ status: 'active' }))).toBe('archive');
    expect(lifecycleAction(room({ status: 'archived' }))).toBe('reactivate');
    expect(lifecycleAction(room({ status: 'completed' }))).toBe('reactivate');
    expect(canReassignOffering(room({ status: 'archived' }))).toBe(false);
    expect(canReassignOffering(room({ status: 'active' }))).toBe(true);
  });
  it('parses only known status filters from the URL', () => {
    expect(parseStatusFilter('archived')).toBe('archived');
    expect(parseStatusFilter('bogus')).toBe('all');
    expect(parseStatusFilter(null)).toBe('all');
  });
});

describe('filterClassrooms', () => {
  const rooms = [room({ id: '1', name: 'Robotics B', code: 'ROB-B' }), room({ id: '2', name: 'Robotics A', code: 'ROB-A', status: 'archived' }), room({ id: '3', name: 'Coding 10', code: 'CODE-10', offering_title: 'Blockly Basics' })];
  it('searches name, code and course offering, case-insensitively, sorted by name', () => {
    expect(filterClassrooms(rooms, { search: 'rob', status: 'all' }).map((r) => r.id)).toEqual(['2', '1']);
    expect(filterClassrooms(rooms, { search: 'code-10', status: 'all' }).map((r) => r.id)).toEqual(['3']);
    expect(filterClassrooms(rooms, { search: ' blockly ', status: 'all' }).map((r) => r.id)).toEqual(['3']);
  });
  it('filters by status and counts each status', () => {
    expect(filterClassrooms(rooms, { search: '', status: 'archived' }).map((r) => r.id)).toEqual(['2']);
    expect(statusCounts(rooms)).toEqual({ all: 3, active: 2, archived: 1, completed: 0 });
  });
  it('shows enrollment against capacity only when capacity is set', () => {
    expect(enrollmentLabel(room({ student_count: 12, capacity: 30 }))).toBe('12 / 30');
    expect(enrollmentLabel(room({ student_count: 12 }))).toBe('12');
  });
});

describe('validateClassroomForm', () => {
  it('requires the create fields and reports the first invalid field in visual order', () => {
    const errors = validateClassroomForm(emptyClassroomForm, 'create');
    expect(Object.keys(errors).sort()).toEqual(['code', 'courseId', 'name', 'offeringCode']);
    expect(firstErrorField(errors)).toBe('name');
  });
  it('mirrors the DTO limits', () => {
    const errors = validateClassroomForm({ ...emptyClassroomForm, name: 'x'.repeat(161), code: '   ', capacity: '0', description: 'd'.repeat(1001) }, 'edit');
    expect(errors.name).toContain('160');
    expect(errors.code).toBe('Enter a classroom code.');
    expect(errors.capacity).toBe('Enter a whole number from 1 to 10,000.');
    expect(errors.description).toContain('1000');
    expect(validateClassroomForm({ ...emptyClassroomForm, name: 'A', code: 'B', capacity: '2.5' }, 'edit').capacity).toBeDefined();
    expect(validateClassroomForm({ ...emptyClassroomForm, name: 'A', code: 'B', capacity: '10000' }, 'edit')).toEqual({});
  });
  it('does not let an emptied capacity pretend to remove the limit', () => {
    expect(validateClassroomForm({ ...emptyClassroomForm, name: 'A', code: 'B' }, 'edit', 30).capacity).toContain('can’t be removed');
    expect(validateClassroomForm({ ...emptyClassroomForm, name: 'A', code: 'B' }, 'edit', null)).toEqual({});
  });
});

describe('request bodies', () => {
  it('builds the two create requests with trimmed values and omits empty optionals', () => {
    expect(createRequests({ ...emptyClassroomForm, name: ' Robotics A ', code: 'ROB-A', courseId: 'k1', offeringCode: ' OFF-1 ', offeringTitle: ' ', capacity: '' })).toEqual({
      offering: { courseId: 'k1', code: 'OFF-1', title: undefined },
      classroom: { name: 'Robotics A', code: 'ROB-A', description: undefined, capacity: undefined },
    });
  });
  it('sends an empty description so it can be cleared, and omits a blank capacity', () => {
    expect(updateRequest({ ...emptyClassroomForm, name: 'A', code: 'B', description: '  ', capacity: '' })).toEqual({ name: 'A', code: 'B', description: '' });
    expect(updateRequest({ ...emptyClassroomForm, name: 'A', code: 'B', capacity: '25' })).toEqual({ name: 'A', code: 'B', description: '', capacity: 25 });
  });
});

describe('apiErrorPresentation', () => {
  it('puts a 409 on the field of the step that failed', () => {
    expect(apiErrorPresentation(new ClassroomStepError('offering', new ApiError(409, 'An offering with this code already exists in the organization.')))).toEqual({ field: 'offeringCode', message: 'An offering with this code already exists in the organization.' });
    expect(apiErrorPresentation(new ClassroomStepError('classroom', new ApiError(409, 'A classroom with this code already exists in the organization.')))).toEqual({ field: 'code', message: 'A classroom with this code already exists in the organization.' });
    expect(apiErrorPresentation(new ApiError(409, 'dup'))).toEqual({ field: 'code', message: 'dup' });
  });
  it('keeps other errors at form level', () => {
    expect(apiErrorPresentation(new ApiError(403, 'Forbidden.'))).toEqual({ message: 'Forbidden.' });
    expect(apiErrorPresentation('x')).toEqual({ message: 'The classroom could not be saved. Try again.' });
  });
});

describe('classroom lifecycle model (A03)', () => {
  const room = { name: 'Robotics 8A', student_count: 12 };
  it('maps network, session, permission and state errors to plain messages', () => {
    expect(lifecycleErrorMessage(new TypeError('Failed to fetch'), 'archive')).toBe('VISTA couldn’t be reached. Check your connection, then try again.');
    expect(lifecycleErrorMessage(new ApiError(401, 'Unauthorized'), 'reactivate')).toBe('Your session has ended. Sign in again, then try again.');
    expect(lifecycleErrorMessage(new ApiError(403, 'Forbidden resource'), 'change-course')).toBe('Your account isn’t allowed to manage classrooms in this school.');
    expect(lifecycleErrorMessage(new ApiError(409, 'Only archived or completed classrooms can be reactivated.'), 'reactivate')).toContain('can’t be reactivated from its current status');
    expect(lifecycleErrorMessage(new ApiError(500, 'Database unavailable.'), 'archive')).toBe('Database unavailable.');
    expect(isStaleLifecycleError(new ApiError(404, 'x'))).toBe(true);
    expect(isStaleLifecycleError(new ApiError(409, 'x'))).toBe(true);
    expect(isStaleLifecycleError(new ApiError(403, 'x'))).toBe(false);
  });

  it('treats only the offering-specific 404 as an ineligible course', () => {
    expect(isRefusedOfferingError(new ApiError(404, 'An active offering for a published global course was not found.'))).toBe(true);
    expect(isRefusedOfferingError(new ApiError(404, 'Classroom was not found.'))).toBe(false);
    expect(isRefusedOfferingError(new ApiError(404, 'Cannot PUT /api/v1/education/admin/organizations/o/classrooms/c/offering'))).toBe(false);
    expect(isRefusedOfferingError(new ApiError(500, 'An active offering for a published global course was not found.'))).toBe(false);
    expect(isRefusedOfferingError(new TypeError('Failed to fetch'))).toBe(false);
    expect(lifecycleErrorMessage(new ApiError(404, 'Cannot PUT /x/offering'), 'change-course')).toContain('This classroom wasn’t found');
  });

  it('only reports counts the server returned', () => {
    expect(lifecycleOutcome('archive', { releasedEnrollments: 1 }, room).description).toBe('Course access ended for 1 student in this classroom. Their work is kept.');
    expect(lifecycleOutcome('archive', {}, room).description).toBe('Students keep their work. You can reactivate the classroom later.');
    expect(lifecycleOutcome('reactivate', { restoredEnrollments: 12 }, room).description).toBe('Course access is back for 12 students.');
    expect(lifecycleOutcome('reactivate', { restoredEnrollments: 0 }, { ...room, student_count: 0 }).description).toBe('You can change its course and manage it as before.');
    expect(lifecycleOutcome('reactivate', { restoredEnrollments: '3' }, room).description).toBe('You can change its course and manage it as before.'); // non-numeric: no claim
  });

  it('offers only active offerings other than the current one', () => {
    const list = [{ id: 'a', code: 'A', title: 'A', status: 'active' }, { id: 'b', code: 'B', title: 'B', status: 'active' }, { id: 'c', code: 'C', title: 'C', status: 'archived' }];
    expect(selectableOfferings(list, 'a').map((item) => item.id)).toEqual(['b']);
    expect(selectableOfferings(undefined, 'a')).toEqual([]);
    expect(currentOffering(list, 'c')?.code).toBe('C');
    expect(currentOffering(list, null)).toBeNull();
  });
});
