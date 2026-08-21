import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, UserRoundCheck, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { posApi } from '@/api/pos';
import type { CashierProfile } from '@/types/api';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
  compact?: boolean;
}

const QUERY_KEY = ['pos', 'cashiers'] as const;

export function CashierPicker({ selectedId, onSelect, compact = false }: Props) {
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const query = useQuery({ queryKey: QUERY_KEY, queryFn: posApi.listCashiers });

  useEffect(() => {
    if (!selectedId && query.data?.length) onSelect(query.data[0].id);
  }, [onSelect, query.data, selectedId]);

  const create = useMutation({
    mutationFn: () => posApi.createCashier(newName.trim()),
    onSuccess: (profile) => {
      queryClient.setQueryData<CashierProfile[]>(QUERY_KEY, (current = []) =>
        [...current.filter((item) => item.id !== profile.id), profile]
          .sort((left, right) => left.name.localeCompare(right.name, 'th')));
      onSelect(profile.id);
      setNewName('');
      setAdding(false);
      toast.success(`เพิ่มผู้รับเงิน “${profile.name}” แล้ว`);
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const removeProfile = useMutation({
    mutationFn: (id: string) => posApi.deleteCashier(id),
    onSuccess: (_result, id) => {
      queryClient.setQueryData<CashierProfile[]>(QUERY_KEY, (current = []) =>
        current.filter((item) => item.id !== id));
      if (selectedId === id) onSelect('');   // ลบชื่อที่เลือกอยู่ → บังคับเลือกใหม่ (effect เลือกตัวแรกให้)
      toast.success('ลบชื่อผู้รับเงินแล้ว');
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });

  const confirmRemove = (profile: CashierProfile) => {
    if (window.confirm(`ลบ “${profile.name}” ออกจากรายชื่อผู้รับเงิน?\nบิลเก่าที่พิมพ์ชื่อนี้ไปแล้วไม่กระทบ`)) {
      removeProfile.mutate(profile.id);
    }
  };

  const submit = () => {
    const name = newName.trim().replace(/\s+/g, ' ');
    if (name.length < 2) {
      toast.error('กรุณากรอกชื่อผู้รับเงินอย่างน้อย 2 ตัวอักษร');
      return;
    }
    setNewName(name);
    create.mutate();
  };

  return (
    <section className={`rounded-lg border border-emerald-200 bg-emerald-50/60 ${compact ? 'p-2' : 'p-3'}`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <label className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
          <UserRoundCheck className="h-4 w-4" />
          ผู้รับเงินบนใบเสร็จ
        </label>
        {!adding && (
          <button type="button" className="btn-secondary px-2 py-1 text-xs" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" /> เพิ่มชื่อ
          </button>
        )}
      </div>

      {query.isPending && <p className="text-xs text-slate-500">กำลังโหลดรายชื่อ...</p>}
      {query.isError && (
        <button type="button" className="text-xs font-medium text-red-600 underline" onClick={() => query.refetch()}>
          โหลดรายชื่อไม่สำเร็จ — กดเพื่อลองใหม่
        </button>
      )}
      {query.data && (
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="เลือกผู้รับเงิน">
          {query.data.map((profile) => {
            const selected = profile.id === selectedId;
            return (
              <span
                key={profile.id}
                className={`inline-flex items-center overflow-hidden rounded-full border text-sm font-medium transition ${selected
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                  : 'border-slate-300 bg-white text-slate-700 hover:border-emerald-400'}`}
              >
                <button
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => onSelect(profile.id)}
                  className="px-3 py-1.5"
                >
                  {selected ? '✓ ' : ''}{profile.name}
                </button>
                <button
                  type="button"
                  aria-label={`ลบ ${profile.name}`}
                  title={`ลบ ${profile.name}`}
                  disabled={removeProfile.isPending}
                  onClick={(event) => { event.stopPropagation(); confirmRemove(profile); }}
                  className={`-ml-1 px-2 py-1.5 ${selected
                    ? 'text-emerald-100 hover:bg-emerald-700 hover:text-white'
                    : 'text-slate-400 hover:bg-red-50 hover:text-red-600'}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            className="input min-w-0 flex-1"
            placeholder="ชื่อผู้รับเงินใหม่"
            maxLength={80}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') { event.preventDefault(); submit(); }
              if (event.key === 'Escape') { setAdding(false); setNewName(''); }
            }}
          />
          <button type="button" className="btn-primary px-3" disabled={create.isPending} onClick={submit}>
            {create.isPending ? 'กำลังเพิ่ม...' : 'บันทึก'}
          </button>
          <button
            type="button"
            className="btn-secondary px-2"
            aria-label="ยกเลิกเพิ่มชื่อ"
            onClick={() => { setAdding(false); setNewName(''); }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </section>
  );
}
