import React, { useId } from 'react';
import { cx } from '../../lib/format';

export function FormRow({
  label,
  hint,
  children,
  htmlFor





}: {label: string;hint?: React.ReactNode;children: React.ReactNode;htmlFor?: string;}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-ink2">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-faint">{hint}</p> : null}
    </div>);

}

const controlClass =
'w-full h-10 rounded-lg border border-line bg-subtle px-3 text-base text-ink placeholder:text-faint transition-colors duration-150 ease-smooth hover:border-faint/50 disabled:opacity-50';

export function Select({
  label,
  value,
  onChange,
  options,
  hint,
  mono,
  disabled








}: {label: string;value: string;onChange: (v: string) => void;options: {value: string;label: string;disabled?: boolean;}[];hint?: React.ReactNode;mono?: boolean;disabled?: boolean;}) {
  const id = useId();
  return (
    <FormRow label={label} hint={hint} htmlFor={id}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className={cx(controlClass, mono && 'font-mono text-sm')}>
        
        {options.map((o) =>
        <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        )}
      </select>
    </FormRow>);

}

export function TextInput({
  label,
  value,
  onChange,
  hint,
  mono,
  placeholder,
  type = 'text'








}: {label: string;value: string;onChange: (v: string) => void;hint?: React.ReactNode;mono?: boolean;placeholder?: string;type?: string;}) {
  const id = useId();
  return (
    <FormRow label={label} hint={hint} htmlFor={id}>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cx(controlClass, mono && 'font-mono text-sm')} />
      
    </FormRow>);

}

export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled






}: {label: string;description?: string;checked: boolean;onChange: (v: boolean) => void;disabled?: boolean;}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <p className="text-base text-ink">{label}</p>
        {description ? <p className="text-sm text-ink2">{description}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0.5 h-6 w-11 shrink-0 overflow-hidden rounded-full border transition-colors duration-150 ease-smooth disabled:opacity-45',
          checked ? 'border-brand/60 bg-brand/80' : 'border-line bg-subtle'
        )}>
        
        <span
          className={cx(
            'absolute left-0.5 top-0.5 h-[1.125rem] w-[1.125rem] rounded-full bg-ink shadow-sm transition-transform duration-150 ease-smooth',
            checked ? 'translate-x-5' : 'translate-x-0'
          )}
        />
        
      </button>
    </div>);

}

export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit,
  onChange,
  disabled









}: {label: string;value: number;min: number;max: number;step?: number;unit?: string;onChange: (v: number) => void;disabled?: boolean;}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink2">
          {label}
        </label>
        <span className="font-mono text-sm text-ink">
          {value}
          {unit}
        </span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-brand disabled:opacity-45" />
      
    </div>);

}
