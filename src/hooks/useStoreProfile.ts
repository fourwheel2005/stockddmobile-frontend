import { useQuery } from '@tanstack/react-query';
import { storeProfileApi } from '@/api/storeProfile';

export const STORE_PROFILE_QUERY_KEY = ['store-profile'] as const;

export function useStoreProfile() {
  return useQuery({ queryKey: STORE_PROFILE_QUERY_KEY, queryFn: storeProfileApi.get });
}
