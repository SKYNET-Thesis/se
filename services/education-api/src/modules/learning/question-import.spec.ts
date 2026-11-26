import { ImportFileError, buildXlsx, parseCsv, parseQuestionRows, readImportTable, templateTable, toCsv } from './question-import';

const H = ['type', 'difficulty', 'cognitive_level', 'stem', 'option_a', 'option_b', 'option_c', 'correct', 'points', 'explanation'];
const ok = ['single_choice', 'easy', 'remember', 'Q1?', 'x', 'y', 'z', 'B', '3', 'because'];

describe('question import parsing', () => {
  it('parses quoted CSV with commas, quotes, newlines and BOM', () => {
    expect(parseCsv('﻿a,b\r\n"x, ""y""","l1\nl2"\r\n')).toEqual([['a', 'b'], ['x, "y"', 'l1\nl2']]);
    expect(() => parseCsv('a,"b')).toThrow(ImportFileError);
  });
  it('round-trips the template through CSV and XLSX', () => {
    const t = templateTable();
    expect(readImportTable('t.csv', Buffer.from(toCsv(t)))).toEqual(t);
    expect(readImportTable('t.xlsx', buildXlsx(t))).toEqual(t);
    const rows = parseQuestionRows(readImportTable('t.xlsx', buildXlsx(t)));
    expect(rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(rows[1].content?.answerKey).toEqual(['a', 'b', 'd']);
    expect(rows[0]).toMatchObject({ points: 1, pointsSource: 'default' });
    expect(rows[1]).toMatchObject({ points: 2, pointsSource: 'default' });
    expect(rows[2]).toMatchObject({ points: 5, pointsSource: 'file' });
    expect(rows[2].content).toMatchObject({ type: 'true_false', answerKey: ['false'], options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }] });
    expect(rows[0].mapping).toEqual({ topic: 'Robot safety' });
    const mapped = parseQuestionRows([['course', 'lesson', 'learning_section', 'topic', 'learning_objective', 'type', 'stem', 'option_a', 'option_b', 'correct', 'explanation'], ['Robotics 101', '1', 'Safety', 'Topic', 'LO-1', 'single_choice', 's', 'x', 'y', 'a', 'e']]);
    expect(mapped[0].mapping).toEqual({ course: 'Robotics 101', lesson: '1', learningSection: 'Safety', topic: 'Topic', learningObjective: 'LO-1' });
  });
  it('applies difficulty defaults 1/2/3 and preserves explicit points', () => {
    const head = ['type', 'difficulty', 'stem', 'option_a', 'option_b', 'correct', 'points', 'explanation'];
    const mk = (difficulty: string, points = '') => ['single_choice', difficulty, `Stem ${difficulty}${points}`, 'x', 'y', 'a', points, 'because'];
    const rows = parseQuestionRows([head, mk('easy'), mk('medium'), mk('hard'), mk('easy', '4.5'), mk('hard', '0')]);
    expect(rows.slice(0, 3).map((r) => [r.points, r.pointsSource])).toEqual([[1, 'default'], [2, 'default'], [3, 'default']]);
    expect(rows[3]).toMatchObject({ points: 4.5, pointsSource: 'file' });
    expect(rows[4].errors.join(' ')).toMatch(/points must be a positive number/);
  });
  it('validates true_false rows without option columns and accepts T/F aliases', () => {
    const head = ['type', 'stem', 'correct', 'explanation'];
    const rows = parseQuestionRows([head, ['true_false', 'Robots can move', 'T', 'e'], ['true_false', 'Robots cannot move', 'no', 'e'], ['true_false', 'Bad', 'maybe', 'e'], ['true_false', 'Two', 'true;false', 'e']]);
    expect(rows[0].errors).toEqual([]); expect(rows[0].content?.answerKey).toEqual(['true']);
    expect(rows[1].content?.answerKey).toEqual(['false']);
    expect(rows[2].errors.join(' ')).toMatch(/does not exist/);
    expect(rows[3].errors.join(' ')).toMatch(/exactly one/);
    expect(() => parseQuestionRows([['type', 'stem', 'correct'], ['single_choice', 's', 'a']])).toThrow(/option_a/);
  });
  it('rejects options on a true_false row', () => {
    const rows = parseQuestionRows([['type', 'stem', 'option_a', 'option_b', 'correct', 'explanation'], ['true_false', 's', 'x', 'y', 'true', 'e']]);
    expect(rows[0].errors.join(' ')).toMatch(/must not list options/);
  });
  it('preserves XML special characters and sparse cells in XLSX', () => {
    const t = [['a', 'b', 'c'], ['<&>"', '', 'z']];
    expect(readImportTable('t.xlsx', buildXlsx(t))).toEqual(t);
  });
  it('reports row-level errors with row numbers', () => {
    const rows = parseQuestionRows([H, ok,
      ['essay', 'easy', 'remember', 'Q2?', 'x', 'y', '', 'A', '', 'e'],
      ['single_choice', 'easy', 'remember', 'Q3?', 'x', 'y', '', 'C', '', 'e'],
      ['single_choice', 'easy', 'remember', 'Q4?', 'x', 'y', '', 'A;B', '', 'e'],
      ['multiple_choice', 'easy', 'remember', 'Q5?', 'x', 'y', '', 'A', '', 'e'],
      ['single_choice', 'easy', 'remember', 'Q6?', 'x', 'x', '', 'A', '-1', ''],
    ]);
    expect(rows[0].errors).toEqual([]);
    expect(rows.slice(1).map((r) => [r.rowNumber, r.errors.length > 0])).toEqual([[3, true], [4, true], [5, true], [6, true], [7, true]]);
    expect(rows[1].errors[0]).toMatch(/type must be/);
    expect(rows[2].errors[0]).toMatch(/does not exist/);
    expect(rows[5].errors.join(' ')).toMatch(/distinct|points|explanation/);
  });
  it('flags duplicate stems within the file case/space-insensitively', () => {
    const rows = parseQuestionRows([H, ok, ['single_choice', 'easy', 'remember', '  q1?  ', 'x', 'y', '', 'A', '', 'e']]);
    expect(rows[1].duplicateOfRow).toBe(2);
  });
  it('rejects bad files', () => {
    expect(() => readImportTable('t.xlsx', Buffer.from('not a zip'))).toThrow(ImportFileError);
    expect(() => readImportTable('t.txt', Buffer.from('a'))).toThrow(/Only .csv/);
    expect(() => readImportTable('t.csv', Buffer.alloc(0))).toThrow(/empty/);
    expect(() => parseQuestionRows([['type', 'stem']])).toThrow(/header row/);
    expect(() => parseQuestionRows([['type', 'stem'], ['a', 'b']])).toThrow(/Missing required column/);
  });
});
