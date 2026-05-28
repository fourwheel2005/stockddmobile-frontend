import { api } from './client';

export interface UploadedFile {
  id: string;
  url: string;
}

export const filesApi = {
  /** Upload a file (multipart). Returns { id, url }. */
  upload: (file: File) => {
    const form = new FormData();
    form.append('file', file);
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
