import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, FileText, PackageCheck, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { extractErrorMessage } from '@/api/client';
import { storeProfileApi } from '@/api/storeProfile';
import { STORE_PROFILE_QUERY_KEY, useStoreProfile } from '@/hooks/useStoreProfile';
import type { StoreProfile, UpdateStoreProfileRequest } from '@/types/api';

type EditableKey = keyof UpdateStoreProfileRequest;
type Draft = UpdateStoreProfileRequest;

interface TextFieldProps {
  label: string;
  field: EditableKey;
  draft: Draft;
  onChange: (field: EditableKey, value: string) => void;
  multiline?: boolean;
}

function TextField({ label, field, draft, onChange, multiline }: TextFieldProps) {
  const value = String(draft[field] ?? '');
  const common = {
    className: 'input mt-1', value,
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange(field, event.target.value),
  };
  return (
    <label className="block text-sm font-medium text-slate-700">
      {label}
      {multiline
        ? <textarea {...common} className="input mt-1 min-h-20 resize-y" />
        : <input {...common} />}
    </label>
  );
}

function Section({ title, hint, icon: Icon, children }: {
  title: string; hint: string; icon: typeof Building2; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-700"><Icon className="h-5 w-5" /></div>
        <div><h2 className="font-semibold text-slate-900">{title}</h2><p className="text-xs text-slate-500">{hint}</p></div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">{children}</div>
    </section>
  );
}

function editable(profile: StoreProfile): Draft {
  const { updatedBy: _updatedBy, updatedAt: _updatedAt, ...draft } = profile;
  return draft;
}

export function StoreProfilePage() {
  const query = useStoreProfile();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  useEffect(() => { if (query.data) setDraft(editable(query.data)); }, [query.data]);
  const mutation = useMutation({
    mutationFn: storeProfileApi.update,
    onSuccess: (saved) => {
      queryClient.setQueryData(STORE_PROFILE_QUERY_KEY, saved);
      setDraft(editable(saved));
      toast.success('บันทึกข้อมูลร้านแล้ว');
    },
    onError: (error) => toast.error(extractErrorMessage(error)),
  });
  if (query.isError) return <div className="p-8 text-red-600">โหลดข้อมูลร้านไม่สำเร็จ</div>;
  if (query.isLoading || !draft) return <div className="p-8 text-slate-500">กำลังโหลดข้อมูลร้าน...</div>;
  const update = (field: EditableKey, value: string) =>
    setDraft((current) => current ? { ...current, [field]: value } : current);
  const submit = (event: FormEvent) => { event.preventDefault(); mutation.mutate(draft); };
  return (
    <form className="mx-auto max-w-6xl space-y-5 p-5 md:p-8" onSubmit={submit}>
      <header><h1 className="text-2xl font-bold text-slate-900">ข้อมูลร้าน</h1>
        <p className="text-sm text-slate-500">แยกข้อมูลตามเอกสาร เพื่อป้องกันการแก้เบอร์หน้าร้านกระทบใบกำกับภาษี</p></header>
      <Section title="หน้าร้านและใบเสร็จธรรมดา" hint="ใช้บนหัวใบเสร็จรับเงินทั่วไป" icon={Building2}>
        <TextField label="ชื่อร้าน" field="shopName" draft={draft} onChange={update} />
        <TextField label="เบอร์โทรบนใบเสร็จ" field="receiptPhone" draft={draft} onChange={update} />
        <TextField label="ที่อยู่บนใบเสร็จ" field="receiptAddress" draft={draft} onChange={update} multiline />
        <TextField label="เว็บไซต์" field="website" draft={draft} onChange={update} />
      </Section>
      <Section title="ข้อมูลนิติบุคคลและภาษี" hint="ใช้กับใบกำกับภาษี ใบลดหนี้ และรายงานบัญชี" icon={FileText}>
        <TextField label="ชื่อบริษัท" field="legalName" draft={draft} onChange={update} />
        <TextField label="สาขา" field="branchLabel" draft={draft} onChange={update} />
        <TextField label="เลขประจำตัวผู้เสียภาษี 13 หลัก" field="taxId" draft={draft} onChange={update} />
        <TextField label="เบอร์โทรบริษัท" field="taxPhone" draft={draft} onChange={update} />
        <div className="md:col-span-2"><TextField label="ที่อยู่จดทะเบียน" field="taxAddress" draft={draft} onChange={update} multiline /></div>
      </Section>
      <Section title="ใบจัดส่งและช่องทางร้าน" hint="ใช้กับป้ายความร้อน 100 × 150 มม." icon={PackageCheck}>
        <TextField label="ชื่อผู้ส่ง" field="shippingSenderName" draft={draft} onChange={update} />
        <TextField label="เบอร์ผู้ส่ง" field="shippingPhone" draft={draft} onChange={update} />
        <TextField label="ที่อยู่ผู้ส่ง บรรทัด 1" field="shippingAddressLine1" draft={draft} onChange={update} />
        <TextField label="ที่อยู่ผู้ส่ง บรรทัด 2" field="shippingAddressLine2" draft={draft} onChange={update} />
        <TextField label="TikTok" field="tiktok" draft={draft} onChange={update} />
        <TextField label="Facebook" field="facebook" draft={draft} onChange={update} />
      </Section>
      <div className="sticky bottom-4 flex justify-end">
        <button className="btn-primary shadow-lg" disabled={mutation.isPending} type="submit">
          <Save className="h-4 w-4" />{mutation.isPending ? 'กำลังบันทึก...' : 'บันทึกข้อมูลร้าน'}
        </button>
      </div>
    </form>
  );
}
