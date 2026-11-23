import { describe, expect, it } from 'vitest';
import { ApiError } from '../lib/api';
import { metricsSummary, registryState, sourceLabel, statusTone, successRate } from './aiRegistryModel';

describe('AI registry model', () => {
  it('treats 404 as "not available to this account" and everything else as a failure', () => {
    expect(registryState(null)).toBe('ok');
    expect(registryState(new ApiError(404, 'AI model was not found.'))).toBe('unavailable');
    expect(registryState(new ApiError(500, 'boom'))).toBe('error');
    expect(registryState(new TypeError('network'))).toBe('error');
  });

  it('summarises only the scalar metrics that were stored, in order, without inventing any', () => {
    expect(metricsSummary({ success_rate: 0.91234567, episodes: 30, split: 'test', passed: true })).toEqual(['success rate: 0.9123', 'episodes: 30', 'split: test', 'passed: yes']);
    expect(metricsSummary({ nested: { a: 1 }, list: [1, 2], empty: '', n: NaN })).toEqual([]);
    expect(metricsSummary(null)).toEqual([]);
    expect(metricsSummary([1, 2])).toEqual([]);
    expect(metricsSummary(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`m${i}`, i])), 3)).toHaveLength(3);
  });

  it('shows a Hugging Face source only when one was recorded', () => {
    expect(sourceLabel('org/model', 'abc123')).toBe('org/model@abc123');
    expect(sourceLabel('org/model', null)).toBe('org/model');
    expect(sourceLabel(null, 'abc123')).toBeNull();
  });

  it('reports trial outcomes only when trials exist', () => {
    expect(successRate(30, 24)).toBe('24 of 30 trials succeeded');
    expect(successRate(0, 0)).toBeNull();
    expect(successRate(null, null)).toBeNull();
    expect(successRate(5, undefined)).toBeNull();
  });

  it('maps statuses to a tone and leaves unknown ones neutral', () => {
    expect(statusTone('completed')).toBe('ok'); expect(statusTone('FAILED')).toBe('danger');
    expect(statusTone('running')).toBe('warn'); expect(statusTone('mystery')).toBe('neutral'); expect(statusTone(null)).toBe('neutral');
  });
});
