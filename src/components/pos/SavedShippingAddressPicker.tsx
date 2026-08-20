import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BookUser, Check, Search, X } from 'lucide-react';
import { posApi } from '@/api/pos';
import type { SavedShippingAddress, ShippingAddressInput } from '@/types/api';

interface Props {
  disabled?: boolean;
  onSelect: (recipient: ShippingAddressInput) => void;
}

function useDebouncedValue(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), 250);
    return () => window.clearTimeout(timer);
  }, [value]);
  return debounced;
}

function AddressRow({ saved, onSelect }: {
  saved: SavedShippingAddress;
  onSelect: (recipient: ShippingAddressInput) => void;
}) {
  const select = () => onSelect(savedAddressToInput(saved));
  return (
    <button type="button" onClick={select}
            className="flex w-full items-start gap-2 border-b px-3 py-2.5 text-left last:border-0 hover:bg-orange-50">
      <Check className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
      <span className="min-w-0 text-xs">
        <span className="block font-semibold text-slate-800">{saved.recipientName} · {saved.recipientPhone}</span>
        <span className="mt-0.5 block whitespace-pre-line text-slate-500">{saved.address}</span>
      </span>
    </button>
  );
}

export function savedAddressToInput(saved: SavedShippingAddress): ShippingAddressInput {
  return {
    recipientName: saved.recipientName,
    recipientPhone: saved.recipientPhone,
    address: saved.address,
  };
}

function AddressResults({ loading, failed, addresses, onSelect }: {
  loading: boolean;
  failed: boolean;
  addresses: SavedShippingAddress[];
  onSelect: (recipient: ShippingAddressInput) => void;
}) {
  if (loading) return <div className="p-3 text-xs text-slate-500">กำลังค้นหา...</div>;
  if (failed) return <div className="p-3 text-xs text-red-600">โหลดสมุดที่อยู่ไม่สำเร็จ กรุณาปิดแล้วลองใหม่</div>;
  if (addresses.length === 0) {
    return <div className="p-3 text-xs text-slate-500">ยังไม่มีที่อยู่ที่เคยใช้ หรือไม่พบคำค้น</div>;
  }
  return <>{addresses.map((saved) => (
    <AddressRow key={saved.id} saved={saved} onSelect={onSelect} />
  ))}</>;
}

export function SavedShippingAddressPicker({ disabled, onSelect }: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const query = useDebouncedValue(search);
  const addresses = useQuery({
    queryKey: ['shipping-addresses', query],
    queryFn: () => posApi.searchShippingAddresses(query),
    enabled: open,
  });
  const choose = (recipient: ShippingAddressInput) => {
    onSelect(recipient);
    setOpen(false);
  };
  return (
    <div className="relative">
      <button type="button" disabled={disabled} onClick={() => setOpen((value) => !value)}
              className="btn-secondary w-full justify-center sm:w-auto">
        <BookUser className="h-4 w-4" /> เลือกจากสมุดที่อยู่
      </button>
      {open && <PickerPanel search={search} setSearch={setSearch} loading={addresses.isFetching}
                            failed={addresses.isError} addresses={addresses.data?.content ?? []} onSelect={choose}
                            onClose={() => setOpen(false)} />}
    </div>
  );
}

function PickerPanel({ search, setSearch, loading, failed, addresses, onSelect, onClose }: {
  search: string;
  setSearch: (value: string) => void;
  loading: boolean;
  failed: boolean;
  addresses: SavedShippingAddress[];
  onSelect: (recipient: ShippingAddressInput) => void;
  onClose: () => void;
}) {
  return (
    <div className="absolute left-0 top-full z-30 mt-1 w-[min(28rem,calc(100vw-2rem))] overflow-hidden rounded-lg border bg-white shadow-xl">
      <div className="flex items-center gap-2 border-b p-2">
        <Search className="h-4 w-4 text-slate-400" />
        <input autoFocus className="min-w-0 flex-1 border-0 text-sm outline-none"
               placeholder="ค้นหาชื่อ เบอร์โทร หรือที่อยู่" value={search}
               onChange={(event) => setSearch(event.target.value)} />
        <button type="button" onClick={onClose} aria-label="ปิดสมุดที่อยู่">
          <X className="h-4 w-4 text-slate-400" />
        </button>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <AddressResults loading={loading} failed={failed} addresses={addresses} onSelect={onSelect} />
      </div>
    </div>
  );
}
