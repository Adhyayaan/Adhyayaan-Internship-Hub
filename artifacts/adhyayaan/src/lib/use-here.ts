import { useLocation, useSearch } from 'wouter';

/** Current in-app path (base-relative) including query string, for return-to links. */
export function useHere() {
  const [loc] = useLocation();
  const search = useSearch();
  return search ? `${loc}?${search}` : loc;
}
