import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2Icon,
  CheckIcon,
  CopyIcon,
  EditIcon,
  PlusIcon,
  SearchIcon,
  ShieldCheckIcon,
  Trash2Icon,
  UserPlusIcon,
  UsersIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import {
  organizationsApi,
  type ApiOrganization,
  type ApiOrganizationDetail,
  type ApiSchoolAdminItem,
} from '../../lib/api';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { Badge, type BadgeTone } from '../../components/ui/Badge';
import { Dialog } from '../../components/ui/Dialog';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { Field, inputClasses } from '../../components/ui/Field';

const STATUS_TONE: Record<string, BadgeTone> = {
  active: 'ok',
  suspended: 'warn',
  inactive: 'danger',
};

const TYPE_LABEL: Record<string, string> = {
  school: 'K-12 School',
  university: 'University',
  training_center: 'Training Center',
  enterprise: 'Enterprise',
};

const SEGMENT_LABEL: Record<string, string> = {
  k12: 'K-12',
  higher_ed: 'Higher Ed',
  vocational: 'Vocational',
  corporate: 'Corporate',
};

interface OrgFormData {
  name: string;
  type: string;
  segment: string;
  schoolCode: string;
  contractStart: string;
  contractEnd: string;
}

const defaultFormData: OrgFormData = {
  name: '',
  type: 'school',
  segment: 'k12',
  schoolCode: '',
  contractStart: '',
  contractEnd: '',
};

export function AdminOrganizations() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const queryClient = useQueryClient();

  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editOrg, setEditOrg] = useState<ApiOrganization | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [assignAdminOpen, setAssignAdminOpen] = useState(false);
  const [adminUserId, setAdminUserId] = useState('');
  const [adminToRemove, setAdminToRemove] = useState<ApiSchoolAdminItem | null>(null);
  const [formData, setFormData] = useState<OrgFormData>(defaultFormData);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Queries
  const orgsQuery = useQuery({
    queryKey: ['organizations'],
    queryFn: () => organizationsApi.list(token),
    enabled: Boolean(token),
  });

  const orgDetailQuery = useQuery({
    queryKey: ['organizations', selectedOrgId],
    queryFn: () => organizationsApi.get(selectedOrgId!, token),
    enabled: Boolean(token && selectedOrgId),
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: (body: OrgFormData) =>
      organizationsApi.create(token, {
        name: body.name.trim(),
        type: body.type,
        segment: body.segment,
        schoolCode: body.schoolCode.trim() || undefined,
        contractStart: body.contractStart || undefined,
        contractEnd: body.contractEnd || undefined,
      }),
    onSuccess: (newOrg) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      toast.success('Organization created', { description: `"${newOrg.name}" has been created.` });
      setCreateOpen(false);
      setFormData(defaultFormData);
      setFormErrors({});
    },
    onError: (err: any) => {
      toast.error('Failed to create organization', { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Partial<OrgFormData> & { status?: string } }) =>
      organizationsApi.update(id, token, {
        name: body.name?.trim(),
        type: body.type,
        segment: body.segment,
        schoolCode: body.schoolCode !== undefined ? body.schoolCode.trim() || '' : undefined,
        contractStart: body.contractStart || undefined,
        contractEnd: body.contractEnd || undefined,
        status: body.status,
      }),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ['organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organizations', updated.id] });
      toast.success('Organization updated', { description: `Changes to "${updated.name}" saved.` });
      setEditOrg(null);
      setFormErrors({});
    },
    onError: (err: any) => {
      toast.error('Failed to update organization', { description: err.message });
    },
  });

  const assignAdminMutation = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      organizationsApi.assignAdmin(orgId, token, { userId: userId.trim() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', selectedOrgId] });
      toast.success('School Admin assigned', { description: 'The user now has administrative access to this school.' });
      setAssignAdminOpen(false);
      setAdminUserId('');
    },
    onError: (err: any) => {
      toast.error('Failed to assign admin', { description: err.message });
    },
  });

  const removeAdminMutation = useMutation({
    mutationFn: ({ orgId, userId }: { orgId: string; userId: string }) =>
      organizationsApi.removeAdmin(orgId, userId, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organizations', selectedOrgId] });
      toast.success('School Admin removed');
      setAdminToRemove(null);
    },
    onError: (err: any) => {
      toast.error('Failed to remove admin', { description: err.message });
    },
  });

  // Filtered organizations
  const organizations = orgsQuery.data ?? [];
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return organizations.filter((org) => {
      const matchesType = typeFilter === 'all' || org.type === typeFilter;
      const matchesQuery =
        !q ||
        org.name.toLowerCase().includes(q) ||
        (org.school_code && org.school_code.toLowerCase().includes(q));
      return matchesType && matchesQuery;
    });
  }, [organizations, query, typeFilter]);

  const validateForm = (data: OrgFormData): boolean => {
    const errors: Record<string, string> = {};
    if (!data.name.trim()) errors.name = 'Organization name is required.';
    if (!data.type) errors.type = 'Type is required.';
    if (!data.segment) errors.segment = 'Segment is required.';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleOpenEdit = (org: ApiOrganization) => {
    setEditOrg(org);
    setFormData({
      name: org.name,
      type: org.type,
      segment: org.segment,
      schoolCode: org.school_code ?? '',
      contractStart: org.contract_start ? org.contract_start.slice(0, 10) : '',
      contractEnd: org.contract_end ? org.contract_end.slice(0, 10) : '',
    });
    setFormErrors({});
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(text);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader
        title="Organizations"
        description="Create and manage educational institutions, schools, and their assigned school administrators."
        actions={
          <Button
            variant="primary"
            icon={<PlusIcon className="h-4 w-4" />}
            onClick={() => {
              setFormData(defaultFormData);
              setFormErrors({});
              setCreateOpen(true);
            }}
          >
            Create organization
          </Button>
        }
      />

      {/* Filter bar */}
      <div className="mt-6 flex flex-col gap-3 py-2 sm:flex-row">
        <label className="flex h-9 flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20 sm:max-w-sm">
          <SearchIcon className="h-4 w-4 text-ink-subtle" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or school code"
            aria-label="Search organizations"
            className="w-full bg-transparent text-sm outline-none placeholder:text-ink-subtle"
          />
        </label>
        <select
          aria-label="Filter by type"
          className={`${inputClasses} h-9 py-0 sm:w-44`}
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
        >
          <option value="all">All types</option>
          <option value="school">K-12 School</option>
          <option value="university">University</option>
          <option value="training_center">Training Center</option>
          <option value="enterprise">Enterprise</option>
        </select>
      </div>

      {/* Organizations Table */}
      {orgsQuery.isLoading ? (
        <div className="py-12 text-center text-sm text-ink-muted">Loading organizations…</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Building2Icon />}
          title={organizations.length === 0 ? 'No organizations created yet' : 'No organizations match'}
          description={
            organizations.length === 0
              ? 'Get started by creating the first school or training institution.'
              : 'Try a different search query or type filter.'
          }
        />
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs text-ink-subtle">
                <th className="py-2 pr-4 font-medium">Name</th>
                <th className="py-2 pr-4 font-medium">School Code</th>
                <th className="py-2 pr-4 font-medium">Type</th>
                <th className="py-2 pr-4 font-medium">Segment</th>
                <th className="py-2 pr-4 font-medium">Status</th>
                <th className="py-2 pr-4 font-medium">Created</th>
                <th className="py-2" aria-label="Actions" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filtered.map((org) => (
                <tr
                  key={org.id}
                  className="group cursor-pointer transition-colors hover:bg-canvas"
                  onClick={() => setSelectedOrgId(org.id)}
                >
                  <td className="py-3 pr-4">
                    <p className="font-medium text-ink group-hover:text-accent">{org.name}</p>
                    <p className="text-xs text-ink-subtle">{org.id}</p>
                  </td>
                  <td className="py-3 pr-4 text-ink-muted font-mono text-xs">
                    {org.school_code ? (
                      <span className="inline-flex items-center gap-1">
                        {org.school_code}
                        <button
                          type="button"
                          className="text-ink-subtle hover:text-ink"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyToClipboard(org.school_code!);
                          }}
                          aria-label="Copy school code"
                        >
                          {copiedCode === org.school_code ? (
                            <CheckIcon className="h-3 w-3 text-ok" />
                          ) : (
                            <CopyIcon className="h-3 w-3" />
                          )}
                        </button>
                      </span>
                    ) : (
                      <span className="text-ink-subtle italic">None</span>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-ink-muted">{TYPE_LABEL[org.type] ?? org.type}</td>
                  <td className="py-3 pr-4 text-ink-muted">{SEGMENT_LABEL[org.segment] ?? org.segment}</td>
                  <td className="py-3 pr-4">
                    <Badge tone={STATUS_TONE[org.status] ?? 'neutral'}>
                      {org.status.charAt(0).toUpperCase() + org.status.slice(1)}
                    </Badge>
                  </td>
                  <td className="py-3 pr-4 text-xs text-ink-muted">
                    {new Date(org.created_at).toLocaleDateString()}
                  </td>
                  <td className="py-3 text-right">
                    <div className="inline-flex gap-1" onClick={(e) => e.stopPropagation()}>
                      <IconButton
                        label={`Manage admins for ${org.name}`}
                        size="sm"
                        onClick={() => setSelectedOrgId(org.id)}
                      >
                        <ShieldCheckIcon />
                      </IconButton>
                      <IconButton
                        label={`Edit ${org.name}`}
                        size="sm"
                        onClick={() => handleOpenEdit(org)}
                      >
                        <EditIcon />
                      </IconButton>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create organization"
        description="Add a new educational organization or school to the platform."
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={createMutation.isPending}
              onClick={() => {
                if (validateForm(formData)) {
                  createMutation.mutate(formData);
                }
              }}
            >
              {createMutation.isPending ? 'Creating…' : 'Create organization'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Organization Name" error={formErrors.name}>
            {(props) => (
              <input
                {...props}
                className={inputClasses}
                placeholder="e.g. Greenwood Academy"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type" error={formErrors.type}>
              {(props) => (
                <select
                  {...props}
                  className={inputClasses}
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="school">K-12 School</option>
                  <option value="university">University</option>
                  <option value="training_center">Training Center</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              )}
            </Field>

            <Field label="Segment" error={formErrors.segment}>
              {(props) => (
                <select
                  {...props}
                  className={inputClasses}
                  value={formData.segment}
                  onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                >
                  <option value="k12">K-12</option>
                  <option value="higher_ed">Higher Ed</option>
                  <option value="vocational">Vocational</option>
                  <option value="corporate">Corporate</option>
                </select>
              )}
            </Field>
          </div>

          <Field
            label="School Code (optional)"
            hint="Unique identifier prefix used for student login and credentials."
            error={formErrors.schoolCode}
          >
            {(props) => (
              <input
                {...props}
                className={inputClasses}
                placeholder="e.g. GW-ACADEMY"
                value={formData.schoolCode}
                onChange={(e) => setFormData({ ...formData, schoolCode: e.target.value.toUpperCase() })}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Contract Start" hint="Optional">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClasses}
                  value={formData.contractStart}
                  onChange={(e) => setFormData({ ...formData, contractStart: e.target.value })}
                />
              )}
            </Field>

            <Field label="Contract End" hint="Optional">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClasses}
                  value={formData.contractEnd}
                  onChange={(e) => setFormData({ ...formData, contractEnd: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={editOrg !== null}
        onClose={() => setEditOrg(null)}
        title={`Edit ${editOrg?.name ?? 'organization'}`}
        size="md"
        footer={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setEditOrg(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={updateMutation.isPending}
              onClick={() => {
                if (editOrg && validateForm(formData)) {
                  updateMutation.mutate({ id: editOrg.id, body: formData });
                }
              }}
            >
              {updateMutation.isPending ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <Field label="Organization Name" error={formErrors.name}>
            {(props) => (
              <input
                {...props}
                className={inputClasses}
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Type">
              {(props) => (
                <select
                  {...props}
                  className={inputClasses}
                  value={formData.type}
                  onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                >
                  <option value="school">K-12 School</option>
                  <option value="university">University</option>
                  <option value="training_center">Training Center</option>
                  <option value="enterprise">Enterprise</option>
                </select>
              )}
            </Field>

            <Field label="Segment">
              {(props) => (
                <select
                  {...props}
                  className={inputClasses}
                  value={formData.segment}
                  onChange={(e) => setFormData({ ...formData, segment: e.target.value })}
                >
                  <option value="k12">K-12</option>
                  <option value="higher_ed">Higher Ed</option>
                  <option value="vocational">Vocational</option>
                  <option value="corporate">Corporate</option>
                </select>
              )}
            </Field>
          </div>

          <Field label="School Code" hint="Leave empty or set a unique uppercase code">
            {(props) => (
              <input
                {...props}
                className={inputClasses}
                value={formData.schoolCode}
                onChange={(e) => setFormData({ ...formData, schoolCode: e.target.value.toUpperCase() })}
              />
            )}
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Contract Start">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClasses}
                  value={formData.contractStart}
                  onChange={(e) => setFormData({ ...formData, contractStart: e.target.value })}
                />
              )}
            </Field>

            <Field label="Contract End">
              {(props) => (
                <input
                  {...props}
                  type="date"
                  className={inputClasses}
                  value={formData.contractEnd}
                  onChange={(e) => setFormData({ ...formData, contractEnd: e.target.value })}
                />
              )}
            </Field>
          </div>
        </div>
      </Dialog>

      {/* Organization Detail & School Admin Management Dialog */}
      <Dialog
        open={selectedOrgId !== null}
        onClose={() => setSelectedOrgId(null)}
        title={orgDetailQuery.data?.name ?? 'Organization Details'}
        description={`Code: ${orgDetailQuery.data?.school_code ?? 'None'} · Segment: ${SEGMENT_LABEL[orgDetailQuery.data?.segment ?? ''] ?? orgDetailQuery.data?.segment ?? ''}`}
        size="lg"
        footer={
          <div className="flex justify-between w-full items-center">
            <div className="text-xs text-ink-subtle">
              ID: {orgDetailQuery.data?.id}
            </div>
            <Button variant="secondary" onClick={() => setSelectedOrgId(null)}>
              Close
            </Button>
          </div>
        }
      >
        <div className="space-y-6">
          {/* Admin Management Section */}
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div>
                <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                  <ShieldCheckIcon className="h-4 w-4 text-accent" />
                  Assigned School Administrators
                </h3>
                <p className="text-xs text-ink-muted mt-0.5">
                  School Admins can log in and manage classrooms, teachers, students, and offerings for this school.
                </p>
              </div>
              <Button
                variant="primary"
                size="sm"
                icon={<UserPlusIcon className="h-3.5 w-3.5" />}
                onClick={() => setAssignAdminOpen(true)}
              >
                Assign admin
              </Button>
            </div>

            {orgDetailQuery.isLoading ? (
              <div className="py-6 text-center text-xs text-ink-muted">Loading administrators…</div>
            ) : !orgDetailQuery.data?.schoolAdmins || orgDetailQuery.data.schoolAdmins.length === 0 ? (
              <div className="py-8 text-center bg-canvas rounded-lg mt-3 border border-dashed border-line">
                <UsersIcon className="h-8 w-8 mx-auto text-ink-subtle" />
                <p className="mt-2 text-sm font-medium text-ink">No school administrators assigned yet</p>
                <p className="mt-1 text-xs text-ink-muted">
                  Assign a user as School Admin so they can manage this school's curriculum and classes.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3"
                  icon={<UserPlusIcon className="h-3.5 w-3.5" />}
                  onClick={() => setAssignAdminOpen(true)}
                >
                  Assign first admin
                </Button>
              </div>
            ) : (
              <div className="mt-3 divide-y divide-line border border-line rounded-lg overflow-hidden">
                {orgDetailQuery.data.schoolAdmins.map((admin) => (
                  <div key={admin.id} className="flex items-center justify-between px-4 py-3 bg-surface">
                    <div>
                      <p className="text-sm font-medium text-ink">{admin.fullName}</p>
                      <p className="text-xs text-ink-subtle">{admin.email ?? 'No email'}</p>
                      <p className="text-[11px] text-ink-muted mt-0.5">User ID: {admin.userId}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone="ok">Active Admin</Badge>
                      <IconButton
                        label={`Remove ${admin.fullName} as School Admin`}
                        size="sm"
                        className="text-ink-subtle hover:text-danger hover:bg-danger-soft"
                        onClick={() => setAdminToRemove(admin)}
                      >
                        <Trash2Icon />
                      </IconButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Dialog>

      {/* Assign Admin Dialog */}
      <Dialog
        open={assignAdminOpen}
        onClose={() => {
          setAssignAdminOpen(false);
          setAdminUserId('');
        }}
        title="Assign School Administrator"
        description="Enter the user's UUID to grant them administrative rights over this organization."
        size="sm"
        footer={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAssignAdminOpen(false);
                setAdminUserId('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              disabled={!adminUserId.trim() || assignAdminMutation.isPending}
              onClick={() => {
                if (selectedOrgId && adminUserId.trim()) {
                  assignAdminMutation.mutate({
                    orgId: selectedOrgId,
                    userId: adminUserId.trim(),
                  });
                }
              }}
            >
              {assignAdminMutation.isPending ? 'Assigning…' : 'Assign admin'}
            </Button>
          </div>
        }
      >
        <Field
          label="User UUID"
          hint="The VISTA user ID from the Users & Roles directory (e.g. 550e8400-e29b-41d4-a716-446655440000)."
        >
          {(props) => (
            <input
              {...props}
              className={inputClasses}
              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              value={adminUserId}
              onChange={(e) => setAdminUserId(e.target.value)}
            />
          )}
        </Field>
      </Dialog>

      {/* Confirm Remove Admin */}
      <ConfirmDialog
        open={adminToRemove !== null}
        title={`Remove ${adminToRemove?.fullName} as School Admin?`}
        description="Their school administrator role for this organization will be deactivated. They will no longer have access to manage this school's classrooms or students."
        confirmLabel="Remove admin"
        onCancel={() => setAdminToRemove(null)}
        onConfirm={() => {
          if (selectedOrgId && adminToRemove) {
            removeAdminMutation.mutate({
              orgId: selectedOrgId,
              userId: adminToRemove.userId,
            });
          }
        }}
      />
    </div>
  );
}
