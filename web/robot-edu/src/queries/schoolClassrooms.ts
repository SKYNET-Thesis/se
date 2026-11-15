import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRole } from '../contexts/RoleContext';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';
import { educationAdminApi, type ApiSchoolClassroom } from '../lib/api';
import { ClassroomStepError, createRequests, updateRequest, type ClassroomFormValues } from './classroomsModel';
import { schoolAdminKeys } from './schoolAdminQueries';

/** The organization a school administrator manages; RoleContext must finish before an empty id means "none". */
export function useSchoolScope() {
  const { session } = useSupabaseSession();
  const { memberships, loading } = useRole();
  const organizationId = memberships.find((item) => item.roleCode === 'school_admin' && item.status === 'active')?.organizationId ?? '';
  return { token: session?.access_token ?? '', organizationId, resolving: loading };
}
export type SchoolScope = ReturnType<typeof useSchoolScope>;

export function useSchoolClassrooms(scope: SchoolScope) {
  return useQuery({
    queryKey: schoolAdminKeys.classrooms(scope.organizationId),
    queryFn: () => educationAdminApi.classrooms(scope.organizationId, scope.token),
    enabled: Boolean(scope.organizationId && scope.token),
  });
}

/**
 * One classroom for the detail route. C03 (single-classroom GET for school administrators) is still open, so this
 * reads the authorized classroom list and picks the row. When C03 lands, replace the body with a query on the new
 * endpoint and keep this return shape; ClassroomDetailPage does not need to change.
 */
export function useSchoolClassroom(scope: SchoolScope, classroomId: string) {
  const list = useSchoolClassrooms(scope);
  const classroom: ApiSchoolClassroom | null = list.data?.find((item) => item.id === classroomId) ?? null;
  return {
    classroom,
    loading: scope.resolving || (Boolean(scope.organizationId) && list.isPending),
    notFound: list.isSuccess && !classroom,
    error: list.error,
    refetch: list.refetch,
    refreshing: list.isFetching && !list.isPending,
  };
}

export function useClassroomMutations(scope: SchoolScope) {
  const queryClient = useQueryClient();
  const { organizationId, token } = scope;
  const refresh = (classroomId?: string) => Promise.all([
    queryClient.invalidateQueries({ queryKey: schoolAdminKeys.classrooms(organizationId) }),
    queryClient.invalidateQueries({ queryKey: schoolAdminKeys.overview(organizationId) }),
    ...(classroomId ? [queryClient.invalidateQueries({ queryKey: schoolAdminKeys.members(organizationId, classroomId) })] : []),
  ]);

  const create = useMutation({
    mutationFn: async (values: ClassroomFormValues) => {
      const requests = createRequests(values);
      // Two independent requests, exactly as the existing flow: a later classroom failure leaves the offering in place.
      const offering = await educationAdminApi.createCourseOffering(organizationId, token, requests.offering).catch((error: unknown) => { throw new ClassroomStepError('offering', error); });
      return educationAdminApi.createClassroom(organizationId, token, { ...requests.classroom, offeringId: offering.id }).catch((error: unknown) => { throw new ClassroomStepError('classroom', error); });
    },
    onSuccess: () => refresh(),
    // The offering list reflects whatever the server now holds, including an offering created before a classroom failure.
    onSettled: () => queryClient.invalidateQueries({ queryKey: schoolAdminKeys.offerings(organizationId) }),
  });
  const update = useMutation({
    mutationFn: ({ classroomId, values }: { classroomId: string; values: ClassroomFormValues }) => educationAdminApi.updateClassroom(organizationId, classroomId, token, updateRequest(values)),
    onSuccess: (_data, { classroomId }) => refresh(classroomId),
  });
  const archive = useMutation({ mutationFn: (classroomId: string) => educationAdminApi.archiveClassroom(organizationId, classroomId, token), onSuccess: (_data, classroomId) => refresh(classroomId) });
  const reactivate = useMutation({ mutationFn: (classroomId: string) => educationAdminApi.reactivateClassroom(organizationId, classroomId, token), onSuccess: (_data, classroomId) => refresh(classroomId) });
  return { create, update, archive, reactivate };
}
