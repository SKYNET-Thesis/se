import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Field, inputClasses } from '../../components/ui/Field';
import { PageHeader } from '../../components/ui/PageHeader';
import { useSupabaseSession } from '../../contexts/SupabaseSessionContext';
import { educationAdminApi } from '../../lib/api';
import { SchoolImportUsers } from '../school/SchoolImportUsers';

/**
 * System Administrator student provisioning: choose the target school, then use the same template / upload (.csv or .xlsx) / preview / confirm pipeline as a
 * School Administrator. The organization is validated server-side; the school code and every credential come from the supported provisioning response.
 */
export function AdminStudentImport() {
  const { session } = useSupabaseSession();
  const token = session?.access_token ?? '';
  const [organizationId, setOrganizationId] = useState('');
  const orgs = useQuery({ queryKey: ['system-admin', 'organizations'], queryFn: () => educationAdminApi.managedOrganizations(token), enabled: Boolean(token) });
  const selected = (orgs.data ?? []).find((org) => org.id === organizationId);
  return (
    <div className="mx-auto w-full max-w-[1240px] px-4 py-6 md:px-8 md:py-9">
      <PageHeader title="Student accounts" description="Select a school, download the template, upload a .csv or .xlsx file, review the records and create the student accounts. Initial passwords are generated automatically and shown once." />
      <div className="mt-6 max-w-md">
        <Field label="School">
          {(props) => (
            <select {...props} className={inputClasses} value={organizationId} onChange={(event) => setOrganizationId(event.target.value)}>
              <option value="">Select a school</option>
              {(orgs.data ?? []).map((org) => <option key={org.id} value={org.id}>{org.name}{org.schoolCode ? ` (${org.schoolCode})` : ''}</option>)}
            </select>
          )}
        </Field>
        {selected ? <p className="mt-2 text-sm text-ink-muted" data-testid="selected-school">Accounts will be created in <strong>{selected.name}</strong>{selected.schoolCode ? <> · school code <span className="font-mono">{selected.schoolCode}</span></> : ' · the school code is generated on first import'}.</p> : null}
        {orgs.isError ? <p role="alert" className="mt-2 text-sm text-danger">The school list could not be loaded.</p> : null}
      </div>
      {organizationId ? <SchoolImportUsers key={organizationId} organizationId={organizationId} studentsOnly heading="Import students" /> : null}
    </div>
  );
}
