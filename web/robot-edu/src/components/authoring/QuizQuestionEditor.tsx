import { useState } from 'react';
import {
  CheckCircle2Icon,
  ChevronDownIcon,
  ChevronUpIcon,
  CodeIcon,
  EyeIcon,
  GripVerticalIcon,
  PlusIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';

export type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';

export interface QuizOption {
  id: string;
  text: string;
  feedback?: string;
}

export interface QuizQuestion {
  id: string;
  variation: string;
  prompt: string;
  type: QuestionType;
  options: QuizOption[];
  correctOptionIds: string[];
  explanation?: string;
  points: number;
}

export interface QuizQuestionEditorProps {
  quizTitle: string;
  instructions?: string;
  passPercent: number;
  isGraded?: boolean;
  questions: QuizQuestion[];
  onChangeQuestions: (questions: QuizQuestion[]) => void;
  onChangePassPercent: (percent: number) => void;
  disabled?: boolean;
}

export function QuizQuestionEditor({
  quizTitle,
  instructions,
  passPercent,
  isGraded = false,
  questions,
  onChangeQuestions,
  onChangePassPercent,
  disabled = false,
}: QuizQuestionEditorProps) {
  const [activeQuestionId, setActiveQuestionId] = useState<string>(
    questions[0]?.id ?? ''
  );
  const [previewMode, setPreviewMode] = useState(false);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string[]>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState(false);

  const addQuestion = () => {
    const newId = `q-${Date.now()}`;
    const newQuestion: QuizQuestion = {
      id: newId,
      variation: 'VARIATION 1',
      prompt: '',
      type: 'single_choice',
      options: [
        { id: `opt-1`, text: 'Option A', feedback: 'Correct answer!' },
        { id: `opt-2`, text: 'Option B', feedback: 'Incorrect. Please review the lesson material.' },
      ],
      correctOptionIds: ['opt-1'],
      points: 1,
      explanation: '',
    };
    const updated = [...questions, newQuestion];
    onChangeQuestions(updated);
    setActiveQuestionId(newId);
  };

  const removeQuestion = (id: string) => {
    if (questions.length <= 1) return;
    const updated = questions.filter((q) => q.id !== id);
    onChangeQuestions(updated);
    if (activeQuestionId === id) {
      setActiveQuestionId(updated[0]?.id ?? '');
    }
  };

  const updateQuestion = (id: string, patch: Partial<QuizQuestion>) => {
    const updated = questions.map((q) => (q.id === id ? { ...q, ...patch } : q));
    onChangeQuestions(updated);
  };

  const moveQuestion = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= questions.length) return;
    const next = [...questions];
    [next[index], next[target]] = [next[target], next[index]];
    onChangeQuestions(next);
  };

  const handleTypeChange = (id: string, newType: QuestionType) => {
    const q = questions.find((item) => item.id === id);
    if (!q) return;

    if (newType === 'true_false') {
      updateQuestion(id, {
        type: newType,
        options: [
          { id: 'true', text: 'True', feedback: 'Correct statement.' },
          { id: 'false', text: 'False', feedback: 'Incorrect statement.' },
        ],
        correctOptionIds: ['true'],
      });
    } else if (newType === 'single_choice') {
      const firstCorrect = q.correctOptionIds[0] ?? q.options[0]?.id ?? '';
      updateQuestion(id, {
        type: newType,
        correctOptionIds: firstCorrect ? [firstCorrect] : [],
      });
    } else {
      updateQuestion(id, { type: newType });
    }
  };

  const toggleCorrectOption = (q: QuizQuestion, optionId: string) => {
    if (disabled) return;
    if (q.type === 'single_choice' || q.type === 'true_false') {
      updateQuestion(q.id, { correctOptionIds: [optionId] });
    } else {
      const exists = q.correctOptionIds.includes(optionId);
      const next = exists
        ? q.correctOptionIds.filter((id) => id !== optionId)
        : [...q.correctOptionIds, optionId];
      updateQuestion(q.id, { correctOptionIds: next });
    }
  };

  const addOption = (q: QuizQuestion) => {
    if (disabled || q.type === 'true_false') return;
    const nextId = `opt-${Date.now()}`;
    const nextOptions = [
      ...q.options,
      { id: nextId, text: `Option ${String.fromCharCode(65 + q.options.length)}`, feedback: '' },
    ];
    updateQuestion(q.id, { options: nextOptions });
  };

  const removeOption = (q: QuizQuestion, optionId: string) => {
    if (disabled || q.options.length <= 2 || q.type === 'true_false') return;
    const nextOptions = q.options.filter((opt) => opt.id !== optionId);
    const nextCorrect = q.correctOptionIds.filter((id) => id !== optionId);
    updateQuestion(q.id, {
      options: nextOptions,
      correctOptionIds: nextCorrect.length > 0 ? nextCorrect : [nextOptions[0].id],
    });
  };

  const updateOption = (
    q: QuizQuestion,
    optionId: string,
    field: 'text' | 'feedback',
    value: string
  ) => {
    const nextOptions = q.options.map((opt) =>
      opt.id === optionId ? { ...opt, [field]: value } : opt
    );
    updateQuestion(q.id, { options: nextOptions });
  };

  // Preview Mode Calculation
  const previewScore = () => {
    let earned = 0;
    let total = 0;
    questions.forEach((q) => {
      total += q.points;
      const selected = previewAnswers[q.id] ?? [];
      const correct = q.correctOptionIds;
      const isMatch =
        selected.length === correct.length &&
        selected.every((id) => correct.includes(id));
      if (isMatch) earned += q.points;
    });
    return total > 0 ? Math.round((earned / total) * 100) : 0;
  };

  return (
    <div className="space-y-6" data-testid="quiz-question-editor">
      {/* Quiz Meta & Mode Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4 shadow-hairline">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-ink">
              {isGraded ? 'Graded Assessment' : 'Practice Quiz'}
            </span>
            <Badge tone={isGraded ? 'accent' : 'ok'}>
              {isGraded ? 'Scored' : 'Formative Knowledge Check'}
            </Badge>
            <span className="text-xs text-ink-muted">
              • {questions.length} question{questions.length === 1 ? '' : 's'}
            </span>
          </div>
          {instructions && <p className="text-xs text-ink-muted">{instructions}</p>}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium text-ink">
            <span>Pass Requirement:</span>
            <input
              type="number"
              min={1}
              max={100}
              value={passPercent}
              disabled={disabled}
              onChange={(e) => onChangePassPercent(Number(e.target.value) || 80)}
              className="h-8 w-16 rounded border border-line bg-surface px-2 text-center text-xs text-ink outline-none focus:border-accent"
              aria-label="Quiz pass percentage"
            />
            <span className="text-ink-muted">%</span>
          </label>

          <Button
            size="sm"
            variant={previewMode ? 'primary' : 'secondary'}
            icon={<EyeIcon className="h-3.5 w-3.5" />}
            onClick={() => {
              setPreviewMode(!previewMode);
              setPreviewSubmitted(false);
              setPreviewAnswers({});
            }}
          >
            {previewMode ? 'Back to Authoring' : 'Preview Quiz'}
          </Button>
        </div>
      </div>

      {previewMode ? (
        /* Preview View (Learner Simulation) */
        <div className="space-y-6 rounded-xl border border-line bg-surface p-6 shadow-hairline">
          <div className="border-b border-line pb-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-accent-ink">
                  Preview Mode
                </span>
                <h3 className="text-xl font-bold text-ink">{quizTitle || 'Knowledge Check'}</h3>
              </div>
              <Badge tone="neutral">Test Attempt</Badge>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              Passing requirement: {passPercent}% • Authors can test-take questions and verify per-option feedback.
            </p>
          </div>

          <div className="space-y-6">
            {questions.map((q, idx) => {
              const selected = previewAnswers[q.id] ?? [];
              const isSubmitted = previewSubmitted;
              const isCorrect =
                selected.length === q.correctOptionIds.length &&
                selected.every((id) => q.correctOptionIds.includes(id));

              return (
                <div
                  key={q.id}
                  className={`rounded-xl border p-5 transition-colors ${
                    isSubmitted
                      ? isCorrect
                        ? 'border-ok/30 bg-ok-soft/20'
                        : 'border-danger/30 bg-danger-soft/20'
                      : 'border-line bg-surface'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-ink">
                      {idx + 1}. {q.prompt || <span className="italic text-ink-subtle">Untitled Question</span>}
                    </p>
                    <span className="text-2xs font-mono text-ink-subtle shrink-0">
                      {q.points} pt{q.points === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="mt-4 space-y-2">
                    {q.options.map((opt) => {
                      const isChecked = selected.includes(opt.id);
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 text-sm cursor-pointer transition-colors ${
                            isChecked
                              ? 'border-accent bg-accent-soft/30 font-medium'
                              : 'border-line hover:bg-sunken/40'
                          }`}
                        >
                          <input
                            type={q.type === 'multiple_choice' ? 'checkbox' : 'radio'}
                            name={`preview-${q.id}`}
                            checked={isChecked}
                            disabled={isSubmitted}
                            onChange={() => {
                              if (q.type === 'multiple_choice') {
                                const next = isChecked
                                  ? selected.filter((id) => id !== opt.id)
                                  : [...selected, opt.id];
                                setPreviewAnswers({ ...previewAnswers, [q.id]: next });
                              } else {
                                setPreviewAnswers({ ...previewAnswers, [q.id]: [opt.id] });
                              }
                            }}
                            className="mt-0.5 accent-accent"
                          />
                          <div className="flex-1">
                            <span>{opt.text}</span>
                            {isSubmitted && opt.feedback && (
                              <p className="mt-1 text-xs text-ink-muted italic">
                                Feedback: {opt.feedback}
                              </p>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between border-t border-line pt-4">
            {previewSubmitted ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-ink">
                  Score: {previewScore()}% ({previewScore() >= passPercent ? 'Passed' : 'Did Not Pass'})
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<RotateCcwIcon className="h-3.5 w-3.5" />}
                  onClick={() => {
                    setPreviewSubmitted(false);
                    setPreviewAnswers({});
                  }}
                >
                  Reset Preview
                </Button>
              </div>
            ) : (
              <Button
                variant="primary"
                onClick={() => setPreviewSubmitted(true)}
              >
                Submit Test Attempt
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* Question Authoring View (Coursera Reference 6 Style) */
        <div className="space-y-6">
          {questions.map((q, qIndex) => {
            const isActive = activeQuestionId === q.id;
            return (
              <section
                key={q.id}
                aria-label={`Question ${qIndex + 1}`}
                className={`overflow-hidden rounded-xl border bg-surface transition-all shadow-hairline ${
                  isActive ? 'border-accent ring-1 ring-accent/20' : 'border-line'
                }`}
                onClick={() => setActiveQuestionId(q.id)}
              >
                {/* Question Header (Coursera Reference 6) */}
                <div className="flex items-center justify-between border-b border-line bg-sunken/40 px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-bold text-ink">
                      Question {qIndex + 1}
                    </h4>
                    <span className="rounded bg-line/60 px-2 py-0.5 text-2xs font-bold uppercase tracking-wider text-ink-muted">
                      {q.variation}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      disabled={disabled || qIndex === 0}
                      onClick={() => moveQuestion(qIndex, -1)}
                      aria-label={`Move Question ${qIndex + 1} up`}
                      className="rounded p-1 text-ink-subtle hover:bg-surface hover:text-ink disabled:opacity-30"
                    >
                      <ChevronUpIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || qIndex === questions.length - 1}
                      onClick={() => moveQuestion(qIndex, 1)}
                      aria-label={`Move Question ${qIndex + 1} down`}
                      className="rounded p-1 text-ink-subtle hover:bg-surface hover:text-ink disabled:opacity-30"
                    >
                      <ChevronDownIcon className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={disabled || questions.length <= 1}
                      onClick={() => {
                        if (window.confirm(`Delete Question ${qIndex + 1}?`)) {
                          removeQuestion(q.id);
                        }
                      }}
                      aria-label={`Delete Question ${qIndex + 1}`}
                      className="rounded p-1 text-ink-subtle hover:bg-danger-soft hover:text-danger disabled:opacity-30"
                    >
                      <Trash2Icon className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Question Body */}
                <div className="p-5 sm:p-6 space-y-5">
                  {/* Prompt Field */}
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                      Prompt
                    </label>
                    <textarea
                      rows={3}
                      value={q.prompt}
                      disabled={disabled}
                      onChange={(e) => updateQuestion(q.id, { prompt: e.target.value })}
                      placeholder="e.g. Which robot joint configuration provides the maximum horizontal reach?"
                      className="w-full rounded-md border border-line-strong bg-surface p-3 text-sm text-ink outline-none placeholder:text-ink-subtle focus:border-accent focus:ring-2 focus:ring-accent/20"
                      aria-label={`Question ${qIndex + 1} prompt`}
                    />
                  </div>

                  {/* Question Type Selection */}
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                        Question Type
                      </label>
                      <select
                        value={q.type}
                        disabled={disabled}
                        onChange={(e) =>
                          handleTypeChange(q.id, e.target.value as QuestionType)
                        }
                        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                        aria-label={`Question ${qIndex + 1} type`}
                      >
                        <option value="single_choice">Single correct answer</option>
                        <option value="multiple_choice">Multiple correct answers</option>
                        <option value="true_false">True / False</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                        Points
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={q.points}
                        disabled={disabled}
                        onChange={(e) =>
                          updateQuestion(q.id, { points: Math.max(1, Number(e.target.value) || 1) })
                        }
                        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
                        aria-label={`Question ${qIndex + 1} points`}
                      />
                    </div>
                  </div>

                  {/* Options List (Coursera Reference 6) */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <label className="block text-xs font-bold uppercase tracking-wider text-ink-subtle">
                        Options
                      </label>
                      <span className="text-2xs text-ink-muted">
                        {q.type === 'multiple_choice'
                          ? 'Select all correct answers'
                          : 'Select the single correct answer'}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {q.options.map((opt, optIndex) => {
                        const isCorrect = q.correctOptionIds.includes(opt.id);
                        return (
                          <div
                            key={opt.id}
                            className={`rounded-lg border transition-all ${
                              isCorrect
                                ? 'border-accent bg-accent-soft/20'
                                : 'border-line bg-surface'
                            }`}
                          >
                            <div className="flex items-center gap-3 p-3">
                              <span className="cursor-grab text-ink-subtle hover:text-ink">
                                <GripVerticalIcon className="h-4 w-4" />
                              </span>

                              {/* Correct answer toggle button (Coursera Reference 6 green circle) */}
                              <button
                                type="button"
                                disabled={disabled}
                                onClick={() => toggleCorrectOption(q, opt.id)}
                                aria-label={`Mark option ${optIndex + 1} as ${isCorrect ? 'incorrect' : 'correct'}`}
                                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-colors ${
                                  isCorrect
                                    ? 'bg-ok text-surface shadow-sm'
                                    : 'border-2 border-line-strong hover:border-accent'
                                }`}
                              >
                                {isCorrect && <CheckCircle2Icon className="h-3.5 w-3.5" />}
                              </button>

                              {/* Option text */}
                              <input
                                type="text"
                                value={opt.text}
                                disabled={disabled}
                                onChange={(e) =>
                                  updateOption(q, opt.id, 'text', e.target.value)
                                }
                                placeholder={`Option ${String.fromCharCode(65 + optIndex)}`}
                                className="flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
                                aria-label={`Option ${optIndex + 1} text`}
                              />

                              {/* Remove Option Button */}
                              {q.type !== 'true_false' && (
                                <button
                                  type="button"
                                  disabled={disabled || q.options.length <= 2}
                                  onClick={() => removeOption(q, opt.id)}
                                  aria-label={`Remove option ${optIndex + 1}`}
                                  className="rounded p-1 text-ink-subtle hover:text-danger disabled:opacity-20"
                                >
                                  <Trash2Icon className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {/* Per-option Feedback & Formatting Toolbar (Coursera Reference 6) */}
                            <div className="border-t border-line/50 bg-sunken/30 px-3 py-2">
                              <input
                                type="text"
                                value={opt.feedback ?? ''}
                                disabled={disabled}
                                onChange={(e) =>
                                  updateOption(q, opt.id, 'feedback', e.target.value)
                                }
                                placeholder="Feedback for learners selecting this answer (e.g. You got it right!)"
                                className="w-full bg-transparent text-xs text-ink outline-none placeholder:text-ink-subtle"
                                aria-label={`Option ${optIndex + 1} feedback`}
                              />
                              <div className="mt-1 flex items-center gap-2 text-2xs text-ink-subtle">
                                <span className="font-mono">H1</span>
                                <span className="font-mono">H2</span>
                                <span className="font-bold">B</span>
                                <span className="italic">I</span>
                                <span className="underline">U</span>
                                <CodeIcon className="h-3 w-3" />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {q.type !== 'true_false' && (
                      <Button
                        size="sm"
                        variant="secondary"
                        icon={<PlusIcon className="h-3.5 w-3.5" />}
                        disabled={disabled}
                        onClick={() => addOption(q)}
                      >
                        Add Option
                      </Button>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          {/* Add Question Button */}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="secondary"
              icon={<PlusIcon className="h-4 w-4" />}
              disabled={disabled}
              onClick={addQuestion}
            >
              Add Question
            </Button>
            <span className="text-xs text-ink-muted">
              Total questions: {questions.length} • Max points:{' '}
              {questions.reduce((sum, q) => sum + q.points, 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
