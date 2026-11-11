import { useEffect, useState } from 'react';
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  ChevronRightIcon,
  RocketIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { ApiCourse } from '../../lib/api';
import type { Lesson, Section } from '../../pages/admin/CanonicalCurriculumEditor';

export interface ReadinessChecklistModalProps {
  open: boolean;
  onClose: () => void;
  course: ApiCourse;
  lessons: Lesson[];
  sections: Section[];
  onPublish: () => void;
  isPublishing?: boolean;
}

export function ReadinessChecklistModal({
  open,
  onClose,
  course,
  lessons,
  sections,
  onPublish,
  isPublishing = false,
}: ReadinessChecklistModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  // Re-opening the checklist (for example to retry after a failed publish) always starts from the checklist step.
  useEffect(() => { if (open) setStep(1); }, [open]);

  // Validation rules (Authoritative backend rules)
  const checks = [
    {
      title: 'Course Metadata',
      description: 'Course has an approved title and description.',
      passed: Boolean(course.title.trim() && course.description?.trim()),
      critical: true,
    },
    {
      title: 'Canonical Lessons Requirement',
      description: 'Course must contain at least 1 lesson before publication.',
      passed: lessons.length >= 1,
      critical: true,
      current: `${lessons.length} lesson${lessons.length === 1 ? '' : 's'}`,
    },
    {
      title: 'Curriculum Sections Configured',
      description: 'Lessons should contain structured learning sections.',
      passed: sections.length >= 1,
      critical: false,
      current: `${sections.length} section${sections.length === 1 ? '' : 's'} in current lesson`,
    },
    {
      title: 'Published Learning Activities',
      description: 'Activities marked as published will become accessible to enrolled students.',
      passed: sections.some((s) => s.learning_activities?.some((a) => a.status === 'published')),
      critical: false,
    },
    {
      title: 'Lifecycle & Integrity Safeguards',
      description: 'Archived courses cannot be modified; published courses lock structural reordering once learner enrollments exist.',
      passed: course.status !== 'archived',
      critical: true,
    },
  ];

  const canPublish = checks.filter((c) => c.critical).every((c) => c.passed);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={step === 1 ? 'Course Readiness Checklist' : 'Review & Publish Course'}
      description={
        step === 1
          ? 'Verify canonical course requirements before publishing to institutional catalog.'
          : 'Once published, your course curriculum becomes live for school offering creation.'
      }
      footer={
        <div className="flex items-center justify-between w-full">
          {step === 1 ? (
            <>
              <Button variant="secondary" onClick={onClose}>
                Back to Edit
              </Button>
              <Button
                variant="primary"
                disabled={!canPublish}
                onClick={() => setStep(2)}
                icon={<ChevronRightIcon className="h-4 w-4" />}
              >
                Proceed to Review
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back to Checklist
              </Button>
              <Button
                variant="primary"
                loading={isPublishing}
                disabled={course.status === 'published'}
                onClick={onPublish}
                icon={<RocketIcon className="h-4 w-4" />}
              >
                {course.status === 'published' ? 'Already Published' : 'Publish Course'}
              </Button>
            </>
          )}
        </div>
      }
    >
      {step === 1 ? (
        /* Step 1: Readiness Checklist (Coursera Reference 3) */
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-line pb-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink">Readiness Score</span>
              <Badge tone={canPublish ? 'ok' : 'warn'}>
                {canPublish ? 'Ready to Publish' : 'Requirements Incomplete'}
              </Badge>
            </div>
            <span className="text-xs text-ink-muted">
              {checks.filter((c) => c.passed).length} of {checks.length} checks satisfied
            </span>
          </div>

          <div className="space-y-3">
            {checks.map((chk, i) => (
              <div
                key={i}
                className={`flex items-start gap-3 rounded-lg border p-3.5 text-xs transition-colors ${
                  chk.passed
                    ? 'border-line bg-surface'
                    : chk.critical
                    ? 'border-danger/30 bg-danger-soft/20'
                    : 'border-warn/30 bg-warn-soft/20'
                }`}
              >
                <div className="mt-0.5 shrink-0">
                  {chk.passed ? (
                    <CheckCircle2Icon className="h-4 w-4 text-ok" />
                  ) : chk.critical ? (
                    <XCircleIcon className="h-4 w-4 text-danger" />
                  ) : (
                    <AlertTriangleIcon className="h-4 w-4 text-warn" />
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink">{chk.title}</span>
                    {chk.critical && (
                      <span className="text-3xs uppercase font-bold text-danger">Required</span>
                    )}
                    {chk.current && (
                      <span className="text-3xs text-ink-subtle">({chk.current})</span>
                    )}
                  </div>
                  <p className="text-ink-muted mt-0.5 leading-relaxed">{chk.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Step 2: Review & Publish (Coursera Reference 7) */
        <div className="space-y-6 text-center py-4">
          <div className="flex items-center justify-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-line text-2xs font-bold text-ink-muted">
              1
            </span>
            <span className="text-xs text-ink-muted">Edit</span>
            <span className="h-px w-8 bg-line" />
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent text-2xs font-bold text-accent-contrast">
              2
            </span>
            <span className="text-xs font-semibold text-ink">Review &amp; Publish</span>
          </div>

          <div className="space-y-2">
            <h3 className="text-2xl font-extrabold tracking-tight text-ink">Ready to publish?</h3>
            <p className="text-sm font-semibold text-ink/80">
              Once you click publish, this course template will become live immediately in the VISTA catalog.
            </p>
          </div>

          <div className="rounded-xl border border-line bg-sunken/40 p-4 text-left text-xs text-ink-muted space-y-2">
            <div className="flex items-center gap-2 text-ink font-semibold">
              <ShieldCheckIcon className="h-4 w-4 text-accent" />
              <span>What happens next:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-ink-subtle">
              <li>
                School administrators will be able to select this course and create classroom offerings.
              </li>
              <li>
                Sections and activities that are marked as <strong>published</strong> will become accessible to enrolled students.
              </li>
              <li>
                Once students make progress in an offering, structural reordering will be locked by data integrity rules.
              </li>
            </ul>
          </div>
        </div>
      )}
    </Dialog>
  );
}
