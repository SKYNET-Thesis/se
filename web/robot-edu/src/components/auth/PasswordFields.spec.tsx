// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PasswordFields } from './PasswordFields';
import { passwordFormState } from '../../lib/passwordPolicy';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
const setValue = (input: HTMLInputElement, value: string) => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
function Harness({ current }: { current?: string }) { const [a, setA] = useState(''); const [b, setB] = useState(''); return <PasswordFields value={a} confirmation={b} onValue={setA} onConfirmation={setB} current={current} />; }
const inputs = () => Array.from(container.querySelectorAll('input[autocomplete="new-password"]')) as HTMLInputElement[];
const match = () => container.querySelector('[data-state]') as HTMLElement;

describe('PasswordFields live validation', () => {
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  it('shows a neutral confirmation until something is typed, then match / mismatch immediately, and revalidates when the original changes', async () => {
    await act(async () => { root.render(<Harness />); });
    const [first, second] = inputs();
    expect(match().dataset.state).toBe('empty'); expect(match().textContent).toBe('');
    await act(async () => { setValue(first, 'A-valid-new-Passw0rd'); });
    expect(match().dataset.state).toBe('empty');
    await act(async () => { setValue(second, 'A-valid-new-Passw'); });
    expect(match().dataset.state).toBe('mismatch'); expect(match().textContent).toContain('Passwords do not match'); expect(second.getAttribute('aria-invalid')).toBe('true');
    await act(async () => { setValue(second, 'A-valid-new-Passw0rd'); });
    expect(match().dataset.state).toBe('match'); expect(match().textContent).toContain('Passwords match');
    await act(async () => { setValue(first, 'A-valid-new-Passw0rd!'); });                       // changing the original revalidates the confirmation at once
    expect(match().dataset.state).toBe('mismatch');
    await act(async () => { setValue(first, ''); setValue(second, ''); });
    expect(match().dataset.state).toBe('empty');
  });

  it('pasting works (value set in one step) and show/hide is independent per field and keeps validation', async () => {
    await act(async () => { root.render(<Harness />); });
    const [first, second] = inputs();
    await act(async () => { setValue(first, 'Pasted-Passw0rd-123'); setValue(second, 'Pasted-Passw0rd-123'); });
    expect(match().dataset.state).toBe('match');
    const toggles = Array.from(container.querySelectorAll('button[aria-pressed]')) as HTMLButtonElement[];
    await act(async () => { toggles[0].click(); });
    expect(first.type).toBe('text'); expect(second.type).toBe('password');                      // independent
    expect(match().dataset.state).toBe('match');                                                // toggling never resets validation
    await act(async () => { toggles[1].click(); });
    expect(second.type).toBe('text'); expect(first.value).toBe('Pasted-Passw0rd-123');
  });

  it('updates the requirement checklist as the student types, using only the real rules', async () => {
    await act(async () => { root.render(<Harness current="temp-password-value" />); });
    const [first] = inputs();
    const met = () => Array.from(container.querySelectorAll('li[data-met]')).map((li) => `${li.textContent?.replace(/ — (not )?met( yet)?/, '')}=${(li as HTMLElement).dataset.met}`);
    expect(met()).toEqual(['At least 12 characters=false', 'Different from your temporary password=false']);
    await act(async () => { setValue(first, 'short'); });
    expect(met()).toEqual(['At least 12 characters=false', 'Different from your temporary password=true']);
    await act(async () => { setValue(first, 'temp-password-value'); });
    expect(met()).toEqual(['At least 12 characters=true', 'Different from your temporary password=false']);
    await act(async () => { setValue(first, 'a-brand-new-passphrase'); });
    expect(met().every((item) => item.endsWith('=true'))).toBe(true);
    expect(container.querySelector('[role="status"][aria-live="polite"]')).not.toBeNull();     // validation changes are announced
  });
});

describe('passwordFormState', () => {
  it('is valid only when every real rule is met and the confirmation matches; strength is advisory only', () => {
    expect(passwordFormState('aaaaaaaaaaaa', 'aaaaaaaaaaaa').valid).toBe(true);                // 12 chars, weak but acceptable: nothing unsupported is required
    expect(passwordFormState('aaaaaaaaaaaa', 'aaaaaaaaaaab').valid).toBe(false);
    expect(passwordFormState('short', 'short').valid).toBe(false);
    expect(passwordFormState('same-as-temp-1234', 'same-as-temp-1234', 'same-as-temp-1234').valid).toBe(false);
    expect(passwordFormState('aaaaaaaaaaaa', '').matchState).toBe('empty');
    expect(passwordFormState('Correct-Horse-Battery-9', 'x').strength.label).toBe('Strong');
  });
});
