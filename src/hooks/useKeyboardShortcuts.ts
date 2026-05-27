import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

/**
 * Global keyboard shortcuts. Uses Alt+letter so they don't conflict
 * with browser hotkeys (Cmd/Ctrl reserved for the user's OS).
 *
 *  Alt+1 → Dashboard
 *  Alt+2 → POS
 *  Alt+3 → Inventory
 *  Alt+4 → Inbound
 *  Alt+5 → Outbound
 *  Alt+P → POS (mnemonic)
 *  Alt+I → Inventory
 *  Alt+R → Reports
 *  Esc   → blur active input (close current focus context)
 */
export function useKeyboardShortcuts() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Skip when typing in inputs (so users can still type "P" in a search)
      const target = e.target as HTMLElement | null;
      const isTyping = target && (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      );
      if (e.key === 'Escape' && target instanceof HTMLElement) {
        target.blur();
        return;
      }
      if (isTyping) return;
      if (!e.altKey) return;

      const map: Record<string, string> = {
        '1': '/',
        '2': '/pos',
        '3': '/inventory',
        '4': '/inbound',
        '5': '/outbound',
        p: '/pos',
        P: '/pos',
        i: '/inventory',
        I: '/inventory',
        r: '/reports',
        R: '/reports',
      };
      const path = map[e.key];
      if (path) {
        e.preventDefault();
        navigate(path);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);
}
