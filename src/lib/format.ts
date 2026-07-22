import { formatInShopZone } from './datetime';

export function formatTHB(n: number | null | undefined): string {
  if (n == null) return '-';
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(n);
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '-';
  return new Intl.NumberFormat('th-TH').format(n);
}

export function formatDateTime(iso: string | null | undefined): string {
  return formatInShopZone(iso, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export function formatDate(iso: string | null | undefined): string {
  return formatInShopZone(iso, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}
