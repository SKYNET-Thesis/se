import React, { useEffect, useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { SystemSettings } from '../../types/user';
import { useAdmin } from '../../contexts/AdminContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Field, inputClasses } from '../../components/ui/Field';
import { Switch } from '../../components/ui/Switch';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DemoNotice } from '../../components/ui/DemoNotice';
import { clearDemoStorage, STORAGE_PREFIX } from '../../utils/storage';

function storageUsageKb(): number {
  try {
    let bytes = 0;
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) bytes += (localStorage.getItem(k)?.length ?? 0) * 2;
    }
    return Math.round(bytes / 1024);
  } catch {
    return 0;
  }
}

export function AdminSettings() {
  const { settings, updateSettings } = useAdmin();
  const [draft, setDraft] = useState<SystemSettings>(settings);
  const [nameError, setNameError] = useState<string | undefined>();
  const [resetOpen, setResetOpen] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  useEffect(() => setDraft(settings), [settings]);
  const set = <K extends keyof SystemSettings,>(k: K, v: SystemSettings[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.institutionName.trim()) {
      setNameError('Institution name is required.');
      return;
    }
    setNameError(undefined);
    updateSettings({ ...draft, institutionName: draft.institutionName.trim() });
    toast.success('Settings saved', { description: 'Applied to this browser.' });
  };

  const reset = () => {
    clearDemoStorage();
    window.location.assign('/');
  };

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="System settings" description="Platform defaults for the Studio, simulation and submissions." />
      <DemoNotice className="mt-6">Settings are stored in this browser and affect only this demo session.</DemoNotice>

      <form onSubmit={save} noValidate className="mt-8 space-y-8">
        <section className="space-y-4">
          <h2 className="text-[15px] font-semibold text-ink">Institution</h2>
          <Field label="Institution name" error={nameError} className="max-w-md">
            {(p) => <input {...p} className={inputClasses} value={draft.institutionName} onChange={(e) => set('institutionName', e.target.value)} />}
          </Field>
        </section>

        <section className="space-y-4 border-t border-line pt-6">
          <h2 className="text-[15px] font-semibold text-ink">Programming Studio</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Default simulation speed">
              {(p) =>
              <select {...p} className={inputClasses} value={draft.defaultSimulationSpeed} onChange={(e) => set('defaultSimulationSpeed', Number(e.target.value) as 1 | 2 | 4)}>
                  <option value={1}>1× (real-time sketch)</option>
                  <option value={2}>2×</option>
                  <option value={4}>4×</option>
                </select>
              }
            </Field>
            <Field label="Autosave delay" hint="Seconds of inactivity before saving.">
              {(p) =>
              <select {...p} className={inputClasses} value={draft.autosaveSeconds} onChange={(e) => set('autosaveSeconds', Number(e.target.value))}>
                  <option value={1}>1 second</option>
                  <option value={3}>3 seconds</option>
                  <option value={10}>10 seconds</option>
                </select>
              }
            </Field>
          </div>
          <div className="max-w-lg space-y-4 pt-2">
            <Switch checked={draft.allowStudentExport} onChange={(v) => set('allowStudentExport', v)} label="Allow students to export programs" description="Program files and RobotProgram JSON downloads." />
            <Switch
              checked={draft.requireValidationBeforeSubmit}
              onChange={(v) => set('requireValidationBeforeSubmit', v)}
              label="Require a valid program to submit"
              description="Students must fix validation errors before saving a draft submission." />
            
          </div>
        </section>

        <div className="flex justify-end gap-2 border-t border-line pt-5">
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(settings)}>
            Discard
          </Button>
          <Button type="submit" variant="primary" disabled={!dirty}>
            Save settings
          </Button>
        </div>
      </form>

      <section className="mt-12 rounded-xl border border-danger/30 p-5">
        <h2 className="text-[15px] font-semibold text-ink">Reset demo data</h2>
        <p className="mt-1 text-[13px] text-ink-muted">
          Deletes every program, run, submission, course edit and setting VISTA has stored in this browser (currently about {storageUsageKb()} KB), then restores the original demo content.
        </p>
        <Button variant="danger" className="mt-4" icon={<RotateCcwIcon className="h-4 w-4" />} onClick={() => setResetOpen(true)}>
          Reset demo data
        </Button>
      </section>

      <ConfirmDialog
        open={resetOpen}
        title="Reset all demo data?"
        description="All locally stored programs, experiments, submissions and edits will be permanently deleted. Export any programs you want to keep first."
        confirmLabel="Reset everything"
        onConfirm={reset}
        onCancel={() => setResetOpen(false)} />
      
    </div>);

}