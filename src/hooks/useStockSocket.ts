import { useEffect, useRef } from 'react';
import { Client, type IMessage } from '@stomp/stompjs';
import { useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/stores/authStore';
import { useWsStore } from '@/stores/wsStore';
import type { LowStockAlertMessage, StockUpdatedMessage } from '@/types/ws';

const devLog = (...args: unknown[]) => {
  if (import.meta.env.DEV) console.log(...args);
};

/**
 * Connects to backend STOMP WebSocket and subscribes to topics that drive
 * real-time UI updates:
 *  - /topic/stock-updates → invalidate inventory + transactions caches
 *  - /topic/alerts        → toast + invalidate alerts cache
 *
 * Connection state (status, errors, message count) is mirrored to useWsStore
 * so the AppShell can render a visible connection indicator.
 */
export function useStockSocket() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const queryClient = useQueryClient();
  const setStatus = useWsStore((s) => s.setStatus);
  const recordEvent = useWsStore((s) => s.recordEvent);
  const reset = useWsStore((s) => s.reset);
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    if (!accessToken) {
      reset();
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackWsUrl = `${protocol}//${window.location.host}/ws`;
    const wsUrl = import.meta.env.VITE_WS_BASE_URL || fallbackWsUrl;

    setStatus('connecting');
    devLog('[WS] connecting →', wsUrl);

    const client = new Client({
      brokerURL: wsUrl,
      connectHeaders: { Authorization: `Bearer ${accessToken}` },
      reconnectDelay: 5_000,
      heartbeatIncoming: 10_000,
      heartbeatOutgoing: 10_000,
      // debug: (str) => console.log('[STOMP]', str),  // uncomment for verbose STOMP frame logging

      onConnect: () => {
        devLog('[WS] ✅ connected, subscribing to topics');
        setStatus('connected');

        client.subscribe('/topic/stock-updates', (msg: IMessage) => {
          const payload: StockUpdatedMessage = JSON.parse(msg.body);
          devLog('[WS] 📡 stock-update', payload);
          recordEvent();
          queryClient.invalidateQueries({ queryKey: ['inventory'] });
          queryClient.invalidateQueries({ queryKey: ['transactions'] });
          queryClient.invalidateQueries({ queryKey: ['product', payload.variantId] });

          toast(
            `${payload.type} · ${payload.sku} · ${payload.qtyBefore} → ${payload.qtyAfter}`,
            { icon: payload.qtyAfter > payload.qtyBefore ? '📈' : '📉', duration: 2500 }
          );
        });

        client.subscribe('/topic/alerts', (msg: IMessage) => {
          const payload: LowStockAlertMessage = JSON.parse(msg.body);
          devLog('[WS] 🔔 alert', payload);
          recordEvent();
          queryClient.invalidateQueries({ queryKey: ['alerts'] });
          toast.error(
            `⚠️ Low Stock: ${payload.productName} (${payload.sku}) เหลือ ${payload.currentQty}/${payload.thresholdQty}`,
            { duration: 6000 }
          );
        });
      },

      onDisconnect: () => {
        devLog('[WS] 🔌 disconnected');
        setStatus('disconnected');
      },

      onStompError: (frame) => {
        const msg = frame.headers['message'] ?? 'STOMP protocol error';
        console.error('[WS] STOMP error:', msg, frame.body);
        setStatus('error', msg);
      },

      onWebSocketError: (e) => {
        console.error('[WS] websocket error:', e);
        setStatus('error', 'WebSocket connection failed');
      },

      onWebSocketClose: (e) => {
        devLog('[WS] websocket closed', e.code, e.reason);
      },
    });

    client.activate();
    clientRef.current = client;

    return () => {
      devLog('[WS] cleanup: deactivating client');
      void client.deactivate();
      clientRef.current = null;
      reset();
    };
  }, [accessToken, queryClient, setStatus, recordEvent, reset]);
}
