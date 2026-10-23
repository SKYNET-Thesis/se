import React, { useEffect, useRef } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useSupabaseSession } from '../contexts/SupabaseSessionContext';

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, gcTime: 5 * 60_000, refetchOnWindowFocus: true, retry: 1 } } });

export function SchoolQueryProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSupabaseSession();
  const previousUser = useRef<string | null>(null);
  const userId = session?.user.id ?? null;
  useEffect(() => {
    if (previousUser.current !== userId) queryClient.clear();
    previousUser.current = userId;
  }, [userId]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
