import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { quizAuthoringApi } from '../../lib/api';

type QuestionType = 'single_choice' | 'multiple_choice' | 'true_false';
type Props = { open: boolean; onClose: () => void; lessonId: string; token: string; onCreated: () => void };

const field = 'mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink';
const letters = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Authors a school-owned question for this lesson and publishes it (school authors publish their own school's questions). */
export function NewQuestionDialog({ open, onClose, lessonId, token, onCreated }: Props) {
  const [type, setType] = useState<QuestionType>('single_choice');
  const [stem, setStem] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correct, setCorrect] = useState<string[]>([]);
  const [explanation, setExplanation] = useState('');
  const [difficulty, setDifficulty] = useState('easy');
  const [objectiveId, setObjectiveId] = useState('');
  const [newObjective, setNewObjective] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const objectives = useQuery({ queryKey: ['quiz-authoring-objectives', lessonId], queryFn: () => quizAuthoringApi.objectives(lessonId, token), enabled: open });
  const items = type === 'true_false' ? ['True', 'False'] : options;
  const ids = items.map((_, i) => letters[i]);
  const reset = () => { setStem(''); setOptions(['', '']); setCorrect([]); setExplanation(''); setObjectiveId(''); setNewObjective(''); setLocalError(null); setType('single_choice'); };
  const create = useMutation({
    mutationFn: () => quizAuthoringApi.authorQuestion(lessonId, token, {
      content: { type, difficulty, cognitiveLevel: 'understand', stem: stem.trim(), options: items.map((text, i) => ({ id: ids[i], text: text.trim() })), answerKey: correct, ...(explanation.trim() ? { explanation: explanation.trim() } : {}) },
      ...(objectiveId ? { objectiveId } : { newObjective: newObjective.trim() }),
    }),
    onSuccess: () => { onCreated(); reset(); onClose(); },
  });
  const submit = () => {
    setLocalError(null);
    if (!stem.trim()) return setLocalError('Enter the question text.');
    if (items.some((text) => !text.trim())) return setLocalError('Every answer option needs text.');
    if (type === 'single_choice' || type === 'true_false') { if (correct.length !== 1) return setLocalError('Mark exactly one correct answer.'); }
    else if (correct.length < 2) return setLocalError('Mark at least two correct answers for a multiple-choice question.');
    if (!explanation.trim()) return setLocalError('Add an explanation; it is required before a question can be published.');
    if (!objectiveId && !newObjective.trim()) return setLocalError('Choose or enter a Learning Outcome.');
    create.mutate();
  };
  const toggle = (id: string) => setCorrect((current) => type === 'multiple_choice' ? (current.includes(id) ? current.filter((x) => x !== id) : [...current, id]) : [id]);
  const message = localError ?? (create.error instanceof Error ? create.error.message : null);
  return <Dialog open={open} onClose={() => { reset(); onClose(); }} title="New question" size="lg" description="Saved to your school's Question Bank and published for this quiz."
    footer={<><Button variant="secondary" onClick={() => { reset(); onClose(); }}>Cancel</Button><Button loading={create.isPending} onClick={submit}>Save and publish question</Button></>}>
    <div className="space-y-3">
      <label className="block text-sm font-medium">Question type
        <select className={field} value={type} onChange={(e) => { setType(e.target.value as QuestionType); setCorrect([]); }}>
          <option value="single_choice">Single choice</option><option value="multiple_choice">Multiple choice</option><option value="true_false">True / false</option>
        </select></label>
      <label className="block text-sm font-medium">Question text<textarea className={field} rows={3} value={stem} onChange={(e) => setStem(e.target.value)} /></label>
      <fieldset className="space-y-2"><legend className="text-sm font-medium">Answer options (tick the correct {type === 'multiple_choice' ? 'answers' : 'answer'})</legend>
        {items.map((text, i) => <div key={ids[i]} className="flex items-center gap-2">
          <input type={type === 'multiple_choice' ? 'checkbox' : 'radio'} name="correct" aria-label={`Correct answer ${i + 1}`} checked={correct.includes(ids[i])} onChange={() => toggle(ids[i])} />
          {type === 'true_false' ? <span className="text-sm">{text}</span>
            : <input className={field} aria-label={`Option ${i + 1}`} value={text} onChange={(e) => setOptions((current) => current.map((value, index) => index === i ? e.target.value : value))} />}
          {type !== 'true_false' && options.length > 2 && <Button size="sm" variant="secondary" onClick={() => { setOptions((current) => current.filter((_, index) => index !== i)); setCorrect((current) => current.filter((id) => id !== ids[i])); }}>Remove</Button>}
        </div>)}
        {type !== 'true_false' && options.length < 6 && <Button size="sm" variant="secondary" onClick={() => setOptions((current) => [...current, ''])}>Add option</Button>}
      </fieldset>
      <label className="block text-sm font-medium">Explanation (required, shown after submission)<textarea className={field} rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} /></label>
      <label className="block text-sm font-medium">Difficulty
        <select className={field} value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option></select></label>
      <label className="block text-sm font-medium">Learning outcome
        <select className={field} value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}>
          <option value="">{objectives.data?.length ? 'New learning outcome…' : 'Enter a new learning outcome below'}</option>
          {objectives.data?.map((o) => <option key={o.id} value={o.id}>{o.code} · {o.description}</option>)}
        </select></label>
      {!objectiveId && <label className="block text-sm font-medium">New learning outcome<input className={field} value={newObjective} onChange={(e) => setNewObjective(e.target.value)} placeholder="Learners can …" /></label>}
      {message && <p role="alert" className="text-sm text-danger">{message}</p>}
    </div>
  </Dialog>;
}
