import React, { useMemo } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';

// networkMode 'always': when the browser is offline a request fails fast and the page shows its error + Retry, instead of staying on "Loading…" forever (TanStack's default pauses the query).
const createQueryClient = () => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true, retry: 1, networkMode: 'always' }, mutations: { networkMode: 'always' } } });

export function SchoolQueryProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSupabaseSession();
  const userId = session?.user.id ?? null;
  // Select the user-scoped cache before descendants render. Clearing a shared
  // client in an effect races with queries started by those descendants.
  const queryClient = useMemo(createQueryClient, [userId]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
