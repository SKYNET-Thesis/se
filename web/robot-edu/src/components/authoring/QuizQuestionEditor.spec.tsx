// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { QuizQuestionEditor, type QuizQuestion } from './QuizQuestionEditor';

const initialQuestions: QuizQuestion[] = [
  {
    id: 'q-1',
    variation: 'VARIATION 1',
    prompt: 'What is the easiest question ever?',
    type: 'single_choice',
    options: [
      { id: 'opt-1', text: 'This is the correct answer.', feedback: 'You got it right!' },
      { id: 'opt-2', text: 'This is wrong.', feedback: 'Incorrect.' },
    ],
    correctOptionIds: ['opt-1'],
    points: 1,
  },
];

describe('QuizQuestionEditor', () => {
  let root: Root;
  let container: HTMLDivElement;
  let questions: QuizQuestion[];
  let passPercent: number;

  beforeEach(() => {
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    questions = [...initialQuestions];
    passPercent = 80;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  const renderComponent = async (props = {}) => {
    await act(async () => {
      root.render(
        <QuizQuestionEditor
          quizTitle="Robotics Safety Quiz"
          instructions="Complete all questions."
          passPercent={passPercent}
          questions={questions}
          onChangeQuestions={(newQ) => {
            questions = newQ;
          }}
          onChangePassPercent={(newP) => {
            passPercent = newP;
          }}
          {...props}
        />
      );
    });
  };

  it('renders Question 1, VARIATION 1, prompt, and options', async () => {
    await renderComponent();
    expect(container.textContent).toContain('Question 1');
    expect(container.textContent).toContain('VARIATION 1');
    expect(container.textContent).toContain('What is the easiest question ever?');
    const opt1Input = container.querySelector('input[aria-label="Option 1 text"]') as HTMLInputElement;
    expect(opt1Input?.value).toBe('This is the correct answer.');
    const opt1Feedback = container.querySelector('input[aria-label="Option 1 feedback"]') as HTMLInputElement;
    expect(opt1Feedback?.value).toBe('You got it right!');
  });

  it('allows adding a new question', async () => {
    await renderComponent();
    const addBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Add Question')
    );
    expect(addBtn).toBeDefined();

    await act(async () => {
      addBtn?.click();
    });

    expect(questions.length).toBe(2);
  });

  it('switches question type to multiple choice and updates answer selection', async () => {
    await renderComponent();
    const select = container.querySelector('select[aria-label="Question 1 type"]') as HTMLSelectElement;
    expect(select).toBeDefined();

    await act(async () => {
      select.value = 'multiple_choice';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(questions[0].type).toBe('multiple_choice');
  });

  it('toggles preview mode to allow test taking', async () => {
    await renderComponent();
    const previewBtn = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.includes('Preview Quiz')
    );
    expect(previewBtn).toBeDefined();

    await act(async () => {
      previewBtn?.click();
    });

    expect(container.textContent).toContain('Preview Mode');
    expect(container.textContent).toContain('Submit Test Attempt');
  });
});
