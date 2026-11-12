import React, { useState } from 'react';
import {
  BookOpenIcon,
  BotIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  FileTextIcon,
  HelpCircleIcon,
  PlusIcon,
  VideoIcon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import type { Lesson, Section } from '../../pages/admin/CanonicalCurriculumEditor';
import { AddContentMenu } from './AddContentMenu';

export interface CourseOutlinePanelProps {
  courseTitle: string;
  lessons: Lesson[];
  sectionsByLesson: Record<string, Section[]>;
  selectedActivityId?: string;
  selectedLessonId?: string;
  selectedSectionId?: string;
  onSelectActivity: (lessonId: string, sectionId: string, activityId: string) => void;
  onSelectLesson: (lessonId: string) => void;
  onSelectSection?: (lessonId: string, sectionId: string) => void;
  onAddLesson: () => void;
  onAddSection: (lessonId: string) => void;
  onAddActivity: (sectionId: string, type: string) => void;
  onMoveLesson?: (index: number, direction: -1 | 1) => void;
  onMoveSection?: (lessonId: string, index: number, direction: -1 | 1) => void;
  onMoveActivity?: (sectionId: string, index: number, direction: -1 | 1) => void;
  isArchived?: boolean;
}

export function getActivityIcon(type: string, className = 'h-4 w-4') {
  switch (type) {
    case 'reading':
      return <FileTextIcon className={`${className} text-emerald-500`} />;
    case 'video':
      return <VideoIcon className={`${className} text-blue-500`} />;
    case 'knowledge_check':
      return <HelpCircleIcon className={`${className} text-amber-500`} />;
    case 'guided_practice':
    case 'simulation':
    case 'challenge':
    case 'physical_lab':
      return <BotIcon className={`${className} text-purple-500`} />;
    default:
      return <BookOpenIcon className={`${className} text-ink-muted`} />;
  }
}

export function CourseOutlinePanel({
  lessons,
  sectionsByLesson,
  selectedActivityId,
  selectedLessonId,
  selectedSectionId,
  onSelectActivity,
  onSelectLesson,
  onSelectSection,
  onAddLesson,
  onAddSection,
  onAddActivity,
  onMoveLesson,
  onMoveSection,
  onMoveActivity,
  isArchived = false,
}: CourseOutlinePanelProps) {
  // Set of expanded lesson/module IDs
  const [expandedLessons, setExpandedLessons] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    lessons.forEach((l, idx) => {
      init[l.id] = idx === 0 || l.id === selectedLessonId;
    });
    return init;
  });

  // Set of expanded section IDs
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    if (selectedSectionId) init[selectedSectionId] = true;
    return init;
  });

  // Automatically expand modules and lessons when lessons are loaded or selection changes
  React.useEffect(() => {
    if (lessons.length > 0) {
      setExpandedLessons((prev) => {
        const next = { ...prev };
        lessons.forEach((l, idx) => {
          if (next[l.id] === undefined) {
            next[l.id] = idx === 0 || l.id === selectedLessonId;
          }
        });
        if (selectedLessonId) next[selectedLessonId] = true;
        return next;
      });
    }
  }, [lessons, selectedLessonId]);

  React.useEffect(() => {
    if (selectedSectionId) {
      setExpandedSections((prev) => ({ ...prev, [selectedSectionId]: true }));
    }
  }, [selectedSectionId]);

  const toggleLesson = (lessonId: string) => {
    setExpandedLessons((prev) => ({ ...prev, [lessonId]: !prev[lessonId] }));
  };

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const totalActivities = Object.values(sectionsByLesson).reduce((acc, secs) => {
    return acc + secs.reduce((a, s) => a + (s.learning_activities?.length ?? 0), 0);
  }, 0);

  return (
    <aside
      className="flex flex-col h-full rounded-xl border border-line bg-surface shadow-sm overflow-hidden"
      aria-label="Course outline panel"
      data-testid="course-outline-panel"
    >
      {/* Header (Coursera Reference / Image 4) */}
      <div className="border-b border-line bg-sunken/30 px-4 py-3.5 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-ink">Course Outline</h3>
          <p className="text-2xs text-ink-muted mt-0.5">
            {lessons.length} Modules · {totalActivities} Learning Items
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onAddLesson}
          disabled={isArchived}
          icon={<PlusIcon className="h-3.5 w-3.5" />}
          title="Add Module"
        >
          Add
        </Button>
      </div>

      {/* Scrollable Curriculum Tree */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {lessons.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-xs text-ink-muted italic">No modules created yet.</p>
            <Button
              size="sm"
              variant="secondary"
              className="mt-3"
              onClick={onAddLesson}
              disabled={isArchived}
            >
              + Create First Module
            </Button>
          </div>
        ) : (
          lessons.map((lessonItem, lessonIndex) => {
            const isLessonExpanded = Boolean(expandedLessons[lessonItem.id]);
            const isLessonSelected = selectedLessonId === lessonItem.id && !selectedActivityId && !selectedSectionId;
            const sections = sectionsByLesson[lessonItem.id] ?? [];

            return (
              <div
                key={lessonItem.id}
                className="rounded-lg border border-line/60 bg-surface/50 overflow-hidden"
              >
                {/* Module Item Header */}
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-2 transition-colors ${
                    isLessonSelected ? 'bg-accent-soft/40 text-accent-ink' : 'hover:bg-sunken/40 text-ink'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleLesson(lessonItem.id)}
                    className="p-1 rounded text-ink-muted hover:text-ink focus-visible:outline-none"
                    aria-label={`${isLessonExpanded ? 'Collapse' : 'Expand'} Module ${lessonIndex + 1}`}
                  >
                    {isLessonExpanded ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onSelectLesson(lessonItem.id);
                      if (!isLessonExpanded) toggleLesson(lessonItem.id);
                    }}
                    className="flex-1 text-left text-xs font-semibold truncate hover:text-accent-ink focus-visible:outline-none"
                    title={lessonItem.title}
                  >
                    Module {lessonIndex + 1}: {lessonItem.title}
                  </button>

                  {onMoveLesson && (
                    <div className="flex items-center gap-0.5 opacity-0 hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => onMoveLesson(lessonIndex, -1)}
                        disabled={lessonIndex === 0 || isArchived}
                        className="px-1 text-xs text-ink-muted hover:text-ink disabled:opacity-20"
                        title="Move module up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => onMoveLesson(lessonIndex, 1)}
                        disabled={lessonIndex === lessons.length - 1 || isArchived}
                        className="px-1 text-xs text-ink-muted hover:text-ink disabled:opacity-20"
                        title="Move module down"
                      >
                        ↓
                      </button>
                    </div>
                  )}
                </div>

                {/* Expanded Sections / Lessons inside Module */}
                {isLessonExpanded && (
                  <div className="pl-4 pr-2 pb-2 pt-1 border-t border-line/40 space-y-1.5 bg-sunken/10">
                    {sections.length === 0 ? (
                      <div className="py-2 pl-3">
                        <p className="text-2xs text-ink-muted italic">No lessons in this module.</p>
                        <button
                          type="button"
                          onClick={() => onAddSection(lessonItem.id)}
                          disabled={isArchived}
                          className="mt-1 text-2xs text-accent-ink font-medium hover:underline block"
                        >
                          + Add Lesson
                        </button>
                      </div>
                    ) : (
                      sections.map((sectionItem, sectionIndex) => {
                        const isSectionExpanded = expandedSections[sectionItem.id] ?? true;
                        const activities = sectionItem.learning_activities ?? [];

                        return (
                          <div
                            key={sectionItem.id}
                            className="rounded-md border border-line/50 bg-surface/80 overflow-hidden"
                          >
                            {/* Section / Lesson Header */}
                            <div className="flex items-center gap-1.5 px-2 py-1.5 bg-sunken/20 hover:bg-sunken/40">
                              <button
                                type="button"
                                onClick={() => toggleSection(sectionItem.id)}
                                className="p-0.5 rounded text-ink-muted hover:text-ink"
                                aria-label={`${isSectionExpanded ? 'Collapse' : 'Expand'} Lesson ${sectionIndex + 1}`}
                              >
                                {isSectionExpanded ? (
                                  <ChevronDownIcon className="h-3.5 w-3.5" />
                                ) : (
                                  <ChevronRightIcon className="h-3.5 w-3.5" />
                                )}
                              </button>

                              {onSelectSection ? (
                                <button
                                  type="button"
                                  onClick={() => onSelectSection(lessonItem.id, sectionItem.id)}
                                  aria-current={selectedSectionId === sectionItem.id && !selectedActivityId ? 'true' : undefined}
                                  className={`flex-1 truncate rounded text-left text-xs font-medium hover:text-accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 ${
                                    selectedSectionId === sectionItem.id && !selectedActivityId ? 'text-accent-ink' : 'text-ink'
                                  }`}
                                  title={sectionItem.title}
                                >
                                  Lesson {sectionIndex + 1}: {sectionItem.title}
                                </button>
                              ) : (
                                <span className="flex-1 text-xs font-medium text-ink truncate">
                                  Lesson {sectionIndex + 1}: {sectionItem.title}
                                </span>
                              )}

                              <Badge
                                tone={sectionItem.status === 'published' ? 'ok' : 'neutral'}
                                className="text-3xs px-1.5 py-0"
                              >
                                {sectionItem.status ?? 'draft'}
                              </Badge>

                              {onMoveSection && (
                                <div className="flex items-center gap-0.5">
                                  <button
                                    type="button"
                                    onClick={() => onMoveSection(lessonItem.id, sectionIndex, -1)}
                                    disabled={sectionIndex === 0 || isArchived}
                                    className="px-0.5 text-2xs text-ink-muted hover:text-ink disabled:opacity-20"
                                    title="Move lesson up"
                                  >
                                    ↑
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => onMoveSection(lessonItem.id, sectionIndex, 1)}
                                    disabled={sectionIndex === sections.length - 1 || isArchived}
                                    className="px-0.5 text-2xs text-ink-muted hover:text-ink disabled:opacity-20"
                                    title="Move lesson down"
                                  >
                                    ↓
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Activities List */}
                            {isSectionExpanded && (
                              <div className="p-1 space-y-1">
                                {activities.length === 0 ? (
                                  <p className="text-2xs text-ink-muted italic px-2 py-1">
                                    No activities yet.
                                  </p>
                                ) : (
                                  activities.map((activity, activityIndex) => {
                                    const isSelected = selectedActivityId === activity.id;
                                    return (
                                      <div
                                        key={activity.id}
                                        onClick={() =>
                                          onSelectActivity(lessonItem.id, sectionItem.id, activity.id)
                                        }
                                        className={`group flex items-center justify-between gap-2 px-2.5 py-2 rounded-md transition-all cursor-pointer ${
                                          isSelected
                                            ? 'bg-ink text-surface shadow-sm font-semibold'
                                            : 'hover:bg-sunken text-ink font-normal'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                          {getActivityIcon(activity.type, 'h-3.5 w-3.5 shrink-0')}
                                          <div className="min-w-0 flex-1">
                                            <p
                                              className={`truncate text-xs ${
                                                isSelected ? 'text-white' : 'text-ink'
                                              }`}
                                            >
                                              {activity.title}
                                            </p>
                                            {isSelected && (
                                              <p className="text-3xs text-accent-soft font-normal">
                                                {activity.type.charAt(0).toUpperCase() +
                                                  activity.type.slice(1).replace('_', ' ')}{' '}
                                                · Editing
                                              </p>
                                            )}
                                          </div>
                                        </div>

                                        <div className="flex items-center gap-1 shrink-0">
                                          {!isSelected && (
                                            <span className="text-3xs capitalize text-ink-subtle">
                                              {activity.type.replace('_', ' ')}
                                            </span>
                                          )}
                                          {onMoveActivity && (
                                            <div
                                              className={`flex items-center gap-0.5 ${
                                                isSelected ? 'text-white/70' : 'text-ink-muted'
                                              } opacity-0 group-hover:opacity-100`}
                                            >
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onMoveActivity(sectionItem.id, activityIndex, -1);
                                                }}
                                                disabled={activityIndex === 0 || isArchived}
                                                className="px-0.5 text-2xs hover:text-white disabled:opacity-20"
                                                title="Move up"
                                              >
                                                ↑
                                              </button>
                                              <button
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  onMoveActivity(sectionItem.id, activityIndex, 1);
                                                }}
                                                disabled={activityIndex === activities.length - 1 || isArchived}
                                                className="px-0.5 text-2xs hover:text-white disabled:opacity-20"
                                                title="Move down"
                                              >
                                                ↓
                                              </button>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })
                                )}

                                {/* Add Activity to Section */}
                                <div className="pt-1 px-1 border-t border-line/30 flex items-center justify-between">
                                  <AddContentMenu
                                    disabled={isArchived}
                                    onSelectType={(type) => onAddActivity(sectionItem.id, type)}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {/* Add Section Button */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => onAddSection(lessonItem.id)}
                        disabled={isArchived}
                        className="w-full py-1.5 px-2 rounded border border-dashed border-line text-2xs font-medium text-ink-muted hover:text-ink hover:bg-surface text-center transition-colors"
                      >
                        + Add Lesson to Module {lessonIndex + 1}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer action: adds a lesson to the selected module (modules are added from the header; activities from inside a lesson) */}
      <div className="border-t border-line bg-sunken/20 p-3">
        <Button
          size="sm"
          variant="secondary"
          className="w-full justify-center"
          icon={<PlusIcon className="h-4 w-4" />}
          onClick={() => {
            const target = selectedLessonId ?? lessons[0]?.id;
            if (target) onAddSection(target);
          }}
          disabled={isArchived || lessons.length === 0}
          title={lessons.length === 0 ? 'Create a module first' : 'Add a lesson to the selected module. Add activities from inside a lesson.'}
        >
          Add Lesson
        </Button>
      </div>
    </aside>
  );
}
