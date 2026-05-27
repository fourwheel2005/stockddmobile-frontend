import { create } from 'zustand';

export type WsStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface WsState {
  status: WsStatus;
  lastError: string | null;
  lastEventAt: number | null;        // ms timestamp of last received message
  receivedCount: number;             // total messages received this session
  setStatus: (status: WsStatus, error?: string | null) => void;
  recordEvent: () => void;
  reset: () => void;
}

export const useWsStore = create<WsState>((set) => ({
  status: 'disconnected',
  lastError: null,
  lastEventAt: null,
  receivedCount: 0,
  setStatus: (status, error = null) => set({ status, lastError: error }),
  recordEvent: () => set((s) => ({
    lastEventAt: Date.now(),
    receivedCount: s.receivedCount + 1,
  })),
  reset: () => set({ status: 'disconnected', lastError: null, lastEventAt: null, receivedCount: 0 }),
}));
