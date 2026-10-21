import React from 'react';
import { CheckIcon } from 'lucide-react';
import type { DemoUser } from '../../types/user';
import { roleDefinitions } from '../../data/adminDemo';

export function RolesOverview({ users }: {users: DemoUser[];}) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {roleDefinitions.map((r) => {
        const count = users.filter((u) => u.role === r.role).length;
        return (
          <section key={r.role} className="grid gap-4 py-6 md:grid-cols-[260px_1fr]">
            <div>
              <h3 className="text-[15px] font-semibold text-ink">{r.label}</h3>
              <p className="mt-1 text-[13px] text-ink-muted">{r.description}</p>
              <p className="tabular mt-2 text-xs text-ink-subtle">
                {count} user{count === 1 ? '' : 's'}
              </p>
            </div>
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {r.permissions.map((p) =>
              <li key={p} className="flex gap-2 text-[14px] text-ink">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden />
                  {p}
                </li>
              )}
            </ul>
          </section>);

      })}
    </div>);

}