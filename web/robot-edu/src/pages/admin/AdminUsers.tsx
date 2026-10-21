import React, { useMemo, useState } from 'react';
import { PencilIcon, SearchIcon, Trash2Icon, UserPlusIcon, UsersIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { DemoUser, Role } from '../../types/user';
import { useAdmin } from '../../contexts/AdminContext';
import { UserFormDialog } from '../../components/admin/UserFormDialog';
import { RolesOverview } from '../../components/admin/RolesOverview';
import { PageHeader } from '../../components/ui/PageHeader';
import { DemoNotice } from '../../components/ui/DemoNotice';
import { Tabs } from '../../components/ui/Tabs';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { inputClasses } from '../../components/ui/Field';
import { formatRelative } from '../../utils/format';

const STATUS_TONE: Record<DemoUser['status'], BadgeTone> = { active: 'ok', invited: 'warn', suspended: 'danger' };
const ROLE_LABEL: Record<Role, string> = { student: 'Student', teacher: 'Teacher', admin: 'Administrator' };

export function AdminUsers() {
  const { users, upsertUser, removeUser } = useAdmin();
  const [tab, setTab] = useState<'users' | 'roles'>('users');
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | 'all'>('all');
  const [form, setForm] = useState<{open: boolean;user: DemoUser | null;}>({ open: false, user: null });
  const [toRemove, setToRemove] = useState<DemoUser | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => (roleFilter === 'all' || u.role === roleFilter) && (!q || `${u.name} ${u.email} ${u.group}`.toLowerCase().includes(q)));
  }, [users, query, roleFilter]);

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title="Users & roles"
        description="Manage who can use VISTA and what each role is intended to do."
        actions={
        <Button variant="primary" icon={<UserPlusIcon className="h-4 w-4" />} onClick={() => setForm({ open: true, user: null })}>
            Add user
          </Button>
        } />
      
      <DemoNotice className="mt-6">
        This is a demo directory stored in your browser. No identity provider is connected: changing a role here does not authenticate anyone or grant real access. Role enforcement must happen on
        the server.
      </DemoNotice>

      <Tabs
        className="mt-6"
        label="Users and roles"
        value={tab}
        onChange={setTab}
        items={[
        { id: 'users', label: 'Users', count: users.length },
        { id: 'roles', label: 'Roles' }]
        } />
      

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'roles' ?
        <RolesOverview users={users} /> :

        <>
            <div className="flex flex-col gap-3 py-4 sm:flex-row">
              <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:max-w-sm">
                <SearchIcon className="h-4 w-4 text-ink-subtle" aria-hidden />
                <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, email or class" aria-label="Search users" className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle" />
              </label>
              <select aria-label="Filter by role" className={`${inputClasses} h-9 py-0 sm:w-44`} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as Role | 'all')}>
                <option value="all">All roles</option>
                <option value="student">Students</option>
                <option value="teacher">Teachers</option>
                <option value="admin">Administrators</option>
              </select>
            </div>
            {filtered.length === 0 ?
          <EmptyState icon={<UsersIcon />} title="No users match" description="Try a different search or role." /> :

          <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs text-ink-subtle">
                      <th className="py-2 pr-4 font-medium">Name</th>
                      <th className="py-2 pr-4 font-medium">Role</th>
                      <th className="py-2 pr-4 font-medium">Class / department</th>
                      <th className="py-2 pr-4 font-medium">Status</th>
                      <th className="py-2 pr-4 font-medium">Last active</th>
                      <th className="py-2" aria-label="Actions" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {filtered.map((u) =>
                <tr key={u.id}>
                        <td className="py-3 pr-4">
                          <p className="font-medium text-ink">{u.name}</p>
                          <p className="text-xs text-ink-subtle">{u.email}</p>
                        </td>
                        <td className="py-3 pr-4 text-ink-muted">{ROLE_LABEL[u.role]}</td>
                        <td className="py-3 pr-4 text-ink-muted">{u.group}</td>
                        <td className="py-3 pr-4">
                          <Badge tone={STATUS_TONE[u.status]}>{u.status.charAt(0).toUpperCase() + u.status.slice(1)}</Badge>
                        </td>
                        <td className="py-3 pr-4 text-ink-muted">{u.lastActive ? formatRelative(u.lastActive) : 'Never'}</td>
                        <td className="py-3 text-right">
                          <div className="inline-flex">
                            <IconButton label={`Edit ${u.name}`} size="sm" onClick={() => setForm({ open: true, user: u })}>
                              <PencilIcon />
                            </IconButton>
                            <IconButton label={`Remove ${u.name}`} size="sm" className="hover:bg-danger-soft hover:text-danger" onClick={() => setToRemove(u)}>
                              <Trash2Icon />
                            </IconButton>
                          </div>
                        </td>
                      </tr>
                )}
                  </tbody>
                </table>
              </div>
          }
          </>
        }
      </div>

      <UserFormDialog
        open={form.open}
        user={form.user}
        existingEmails={users.map((u) => u.email)}
        onClose={() => setForm({ open: false, user: null })}
        onSave={(u) => {
          upsertUser(u);
          setForm({ open: false, user: null });
          toast.success(form.user ? 'User updated' : 'Demo user added', { description: 'Saved in this browser only.' });
        }} />
      
      <ConfirmDialog
        open={toRemove !== null}
        title={`Remove ${toRemove?.name}?`}
        description="They will be removed from this browser's demo directory."
        confirmLabel="Remove user"
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (toRemove) removeUser(toRemove.id);
          setToRemove(null);
          toast.success('User removed');
        }} />
      
    </div>);

}