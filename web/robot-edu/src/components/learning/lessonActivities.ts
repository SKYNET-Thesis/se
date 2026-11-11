import type {
  LessonProgressStatus,
  LessonLockReason,
  LessonContent,
  LessonAssignmentInfo,
  ApiQualifiedProgramHandoff,
} from '../../lib/api';

export type LessonActivityType =
  | 'reading'
  | 'video'
  | 'demonstration'
  | 'guided_practice'
  | 'knowledge_check'
  | 'simulation'
  | 'challenge'
  | 'physical_lab'
  | 'result'
  | 'reflection';

export type LessonActivityStatus = 'neutral' | 'unavailable' | 'completed' | 'current' | 'available';

export interface LessonActivity {
  id: string;
  type: LessonActivityType;
  title: string;
  description: string;
  durationMinutes: number | null;
  status: LessonActivityStatus;
  actionable: boolean;
  authoritative: boolean;
  action: 'reading' | 'knowledge_check' | 'practice' | 'unavailable' | null;
  content?: Record<string, unknown>;
}

export interface LessonActivitySection {
  title: string;
  items: LessonActivity[];
}

export interface LessonSummaryOrDetail {
  id: string;
  ordinal: number;
  title: string;
  status: LessonProgressStatus;
  content?: Partial<LessonContent> | null;
  assignment?: Partial<LessonAssignmentInfo> | null;
  qualification?: ApiQualifiedProgramHandoff | null;
  lockReason?: LessonLockReason | null;
  learningItems?: string[];
  estimatedMinutes?: number | null;
  databaseSections?: Array<{
    id: string; title: string; ordinal: number;
    activities: Array<{ id: string; title: string; type: string; ordinal: number; required: boolean; content_ref?: { kind: string; id?: string }; content?: Record<string, unknown> }>;
  }>;
}

export const activityTypeLabels: Record<LessonActivityType, string> = {
  reading: 'Reading',
  video: 'Video',
  demonstration: 'Demonstration',
  guided_practice: 'Guided Practice',
  knowledge_check: 'Practice Quiz',
  simulation: '3D Simulation',
  challenge: '3D Challenge',
  physical_lab: 'Physical Lab',
  result: 'Result',
  reflection: 'Reflection',
};

const reading = (
  id: string,
  title: string,
  description: string,
  durationMinutes: number | null = null,
): LessonActivity => ({
  id,
  type: 'reading',
  title,
  description,
  durationMinutes,
  status: 'neutral',
  actionable: true,
  authoritative: false,
  action: 'reading',
});

const demonstration = (
  id: string,
  title: string,
  description: string,
  durationMinutes: number | null = null,
): LessonActivity => ({
  id,
  type: 'demonstration',
  title,
  description,
  durationMinutes,
  status: 'neutral',
  actionable: true,
  authoritative: false,
  action: 'reading',
});

export function buildLessonActivitySections(lesson: LessonSummaryOrDetail): LessonActivitySection[] {
  if (lesson.databaseSections?.length) {
    return lesson.databaseSections.map((section) => ({
      title: section.title,
      items: section.activities.map((item) => {
        const type = item.type as LessonActivityType;
        const content = item.content;
        const instruction = typeof content?.instructions === 'string' ? content.instructions : '';
        const blocks = Array.isArray(content?.blocks) ? content.blocks : [];
        const readingText = blocks.flatMap((block) => {
          if (!block || typeof block !== 'object') return [];
          const value = block as Record<string, unknown>;
          return typeof value.text === 'string' ? [value.text] : Array.isArray(value.items) ? value.items.filter((part): part is string => typeof part === 'string') : [];
        }).join('\n');
        const description = instruction || readingText || '';
        const estimated = content?.estimatedMinutes;
        const supportedType = (Object.hasOwn(activityTypeLabels, type));
        const assignmentLinked = item.content_ref?.kind === 'assignment' && item.content_ref.id === lesson.assignment?.id;
        const unavailable = !supportedType || type === 'physical_lab' || type === 'video' || (type === 'knowledge_check' && !assignmentLinked);
        const action = type === 'reading' || type === 'demonstration' || type === 'result' || type === 'reflection'
          ? 'reading'
          : type === 'knowledge_check' ? 'knowledge_check'
            : type === 'guided_practice' || type === 'simulation' || type === 'challenge' ? 'practice' : null;
        return {
          id: item.id, type: supportedType ? type : 'reading', title: item.title, description,
          durationMinutes: typeof estimated === 'number' ? estimated : null,
          status: unavailable ? 'unavailable' : 'neutral', actionable: !unavailable && action !== null,
          authoritative: ['knowledge_check', 'guided_practice', 'simulation', 'challenge', 'physical_lab'].includes(type),
          action: unavailable ? 'unavailable' : action,
          ...(content ? { content } : {}),
        };
      }),
    }));
  }
  const sections = lesson.content?.conceptSections ?? [];
  const summary = lesson.content?.summary ?? lesson.content?.taskPreview ?? '';

  if (lesson.ordinal === 1) {
    const isQuiz = lesson.assignment ? lesson.assignment?.constraints?.kind === 'knowledge_check' : true;
    return [
      {
        title: 'Robot Fundamentals',
        items: [
          reading(
            `${lesson.id}-reading-1`,
            sections[0]?.title ?? 'Understanding Meet Your Robot',
            sections[0]?.content ?? summary,
            4,
          ),
          demonstration(
            `${lesson.id}-demonstration`,
            'Robot Concept in Action',
            lesson.content?.robotConcept ?? 'Explore how the robot applies fundamental coordinate frames.',
            3,
          ),
        ],
      },
      {
        title: 'Safety & Assessment',
        items: [
          reading(
            `${lesson.id}-reading-2`,
            sections[1]?.title ?? 'Safety & Operational Procedures',
            sections[1]?.content ?? 'Master safety protocols before operating the robot.',
            4,
          ),
          ...(isQuiz
            ? [
                {
                  id: `${lesson.id}-knowledge-check`,
                  type: 'knowledge_check' as const,
                  title: lesson.assignment?.title ?? 'Practice Quiz',
                  description:
                    lesson.assignment?.instructions ??
                    'Test your understanding of robot terminology, safety procedures, and coordinate frames.',
                  durationMinutes: 8,
                  status: 'neutral' as const,
                  actionable: true,
                  authoritative: true,
                  action: 'knowledge_check' as const,
                },
              ]
            : []),
        ],
      },
    ];
  }

  if (lesson.ordinal === 2) {
    return [
      {
        title: 'Movement Fundamentals',
        items: [
          reading(
            `${lesson.id}-reading-1`,
            'Understanding Robot Movement',
            sections[0]?.content ?? summary,
            4,
          ),
          demonstration(
            `${lesson.id}-demonstration`,
            'Robot Concept in Action',
            lesson.content?.robotConcept ?? 'Explore how target positions plan deterministic motion in 3D.',
            3,
          ),
        ],
      },
      {
        title: 'Practice',
        items: [
          {
            id: `${lesson.id}-guided-practice`,
            type: 'guided_practice' as const,
            title: 'Build Your Move the Robot Sequence',
            description:
              lesson.assignment?.instructions ??
              lesson.content?.taskPreview ??
              'Program the left arm to home, move to Target A, and wait.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: true,
            authoritative: true,
            action: 'practice' as const,
          },
          {
            id: `${lesson.id}-simulation`,
            type: 'simulation' as const,
            title: 'Reach Target A',
            description:
              lesson.assignment?.challengeDescription ??
              'Run the authoritative 3D simulation to verify robot trajectory.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: true,
            authoritative: true,
            action: 'practice' as const,
          },
          {
            id: `${lesson.id}-result`,
            type: 'result' as const,
            title: 'Simulation Feedback',
            description: 'Review the persisted evaluation result after practice.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: false,
            authoritative: true,
            action: null,
          },
        ],
      },
    ];
  }

  if (lesson.ordinal === 3) {
    return [
      {
        title: 'Gripper Fundamentals',
        items: [
          reading(
            `${lesson.id}-reading-1`,
            sections[0]?.title ?? 'Understanding Grab & Release',
            sections[0]?.content ?? summary,
            4,
          ),
          demonstration(
            `${lesson.id}-demonstration`,
            'Robot Concept in Action',
            lesson.content?.robotConcept ?? 'Explore how the gripper interacts with target objects.',
            3,
          ),
        ],
      },
      {
        title: 'Practice',
        items: [
          {
            id: `${lesson.id}-guided-practice`,
            type: 'guided_practice' as const,
            title: 'Build your Grab & Release sequence',
            description: lesson.assignment?.instructions ?? lesson.content?.taskPreview ?? 'Build the program in the practice workspace.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: true,
            authoritative: true,
            action: 'practice' as const,
          },
          {
            id: `${lesson.id}-simulation`,
            type: 'simulation' as const,
            title: lesson.assignment?.challengeTitle ?? 'Reach & Grasp Target',
            description: lesson.assignment?.challengeDescription ?? 'Run the authoritative simulation.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: true,
            authoritative: true,
            action: 'practice' as const,
          },
          {
            id: `${lesson.id}-result`,
            type: 'result' as const,
            title: 'Result / Feedback',
            description: 'Review the persisted evaluation result after practice.',
            durationMinutes: null,
            status: 'neutral' as const,
            actionable: false,
            authoritative: true,
            action: null,
          },
        ],
      },
    ];
  }

  if (lesson.ordinal === 5) {
    return [
      {
        title: 'Lab Preparation',
        items: [
          reading(
            `${lesson.id}-reading-1`,
            sections[0]?.title ?? 'Understanding Physical Robot Lab',
            sections[0]?.content ?? summary,
            4,
          ),
          demonstration(
            `${lesson.id}-demonstration`,
            'Qualified Program Review',
            lesson.content?.robotConcept ?? 'Review your verified symbolic program before physical execution.',
            null,
          ),
        ],
      },
      {
        title: 'Physical Execution',
        items: [
          {
            id: `${lesson.id}-readiness`,
            type: 'physical_lab' as const,
            title: 'Robot Readiness / Safety Check',
            description: 'Physical lab execution will become available when the robot runtime is authorized and ready.',
            durationMinutes: null,
            status: lesson.qualification
              ? (lesson.status === 'completed' ? ('completed' as const) : ('current' as const))
              : ('unavailable' as const),
            actionable: Boolean(lesson.qualification),
            authoritative: true,
            action: null,
          },
          {
            id: `${lesson.id}-physical`,
            type: 'physical_lab' as const,
            title: 'Physical Experiment',
            description: 'Physical lab execution will become available when the robot runtime is authorized and ready.',
            durationMinutes: null,
            status: lesson.qualification
              ? (lesson.status === 'completed' ? ('completed' as const) : ('available' as const))
              : ('unavailable' as const),
            actionable: Boolean(lesson.qualification),
            authoritative: true,
            action: null,
          },
          {
            id: `${lesson.id}-evidence`,
            type: 'result' as const,
            title: 'Result / Evidence',
            description: 'Review authoritative physical robot experiment evidence.',
            durationMinutes: null,
            status: lesson.qualification
              ? (lesson.status === 'completed' ? ('completed' as const) : ('neutral' as const))
              : ('unavailable' as const),
            actionable: Boolean(lesson.qualification),
            authoritative: true,
            action: null,
          },
          {
            id: `${lesson.id}-reflection`,
            type: 'reflection' as const,
            title: 'Reflection',
            description: 'Reflection on physical vs simulated execution.',
            durationMinutes: null,
            status: lesson.qualification
              ? (lesson.status === 'completed' ? ('completed' as const) : ('neutral' as const))
              : ('unavailable' as const),
            actionable: Boolean(lesson.qualification),
            authoritative: false,
            action: null,
          },
        ],
      },
    ];
  }

  // Default / Lesson 4
  const simulationType: LessonActivityType = lesson.ordinal === 4 ? 'challenge' : 'simulation';
  return [
    {
      title: lesson.ordinal === 4 ? 'Pick & Place Fundamentals' : 'Module Fundamentals',
      items: [
        reading(
          `${lesson.id}-reading-1`,
          sections[0]?.title ?? `Understanding ${lesson.title}`,
          sections[0]?.content ?? summary,
          4,
        ),
        demonstration(
          `${lesson.id}-demonstration`,
          'Robot Concept in Action',
          lesson.content?.robotConcept ?? 'Explore how the robot applies this concept.',
          3,
        ),
      ],
    },
    {
      title: lesson.ordinal === 4 ? 'Challenge & Evidence' : 'Practice',
      items: [
        {
          id: `${lesson.id}-guided-practice`,
          type: 'guided_practice' as const,
          title: `Build your ${lesson.title} sequence`,
          description: lesson.assignment?.instructions ?? lesson.content?.taskPreview ?? 'Build the program in the existing practice flow.',
          durationMinutes: null,
          status: 'neutral' as const,
          actionable: true,
          authoritative: true,
          action: 'practice' as const,
        },
        {
          id: `${lesson.id}-simulation`,
          type: simulationType,
          title:
            lesson.assignment?.challengeTitle ??
            (lesson.ordinal === 4 ? 'Pick & Place Simulation' : lesson.content?.taskPreview ?? 'Authoritative simulation'),
          description:
            lesson.assignment?.challengeDescription ??
            (lesson.ordinal === 4
              ? 'Run the authoritative simulation to verify robot trajectory.'
              : 'Run the existing authoritative simulation.'),
          durationMinutes: null,
          status: 'neutral' as const,
          actionable: true,
          authoritative: true,
          action: 'practice' as const,
        },
        {
          id: `${lesson.id}-result`,
          type: 'result' as const,
          title: lesson.ordinal === 4 ? 'Simulation Result / Evidence' : 'Result / Feedback',
          description: 'Review the persisted evaluation result after practice.',
          durationMinutes: null,
          status: 'neutral' as const,
          actionable: false,
          authoritative: true,
          action: null,
        },
      ],
    },
  ];
}

export function buildLessonActivities(lesson: LessonSummaryOrDetail): LessonActivity[] {
  return buildLessonActivitySections(lesson).flatMap((section) => section.items);
}
