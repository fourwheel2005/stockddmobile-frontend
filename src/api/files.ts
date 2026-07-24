import { api } from './client';

export interface UploadedFile {
  id: string;
  url: string;
}

export const filesApi = {
  /** Alias for slip uploads — same backend endpoint · ไม่ normalize (สลิปห้ามตัดขอบ) */
  uploadSlip: (file: File) => filesApi.upload(file),

  /**
   * Upload a file (multipart). Returns { id, url }.
   * @param opts.normalize รูปสินค้า → ให้ backend ตัดขอบว่าง+จัดเฟรม (อย่าใช้กับสลิป)
   */
  upload: (file: File, opts?: { normalize?: boolean }) => {
    const form = new FormData();
    form.append('file', file);
    if (opts?.normalize) form.append('normalize', 'true');
    return api
      .post<UploadedFile>('/files', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  /** Fetch a stored file as an object URL (auth-protected → must fetch as blob). */
  fetchBlobUrl: async (fileId: string): Promise<string> => {
    const res = await api.get(`/files/${fileId}`, { responseType: 'blob' });
    return URL.createObjectURL(res.data as Blob);
  },
};
