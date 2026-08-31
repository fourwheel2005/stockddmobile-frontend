import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { OpenSessionModal } from '@/components/OpenSessionModal';
import { useBranchStore } from '@/stores/branchStore';

describe('OpenSessionModal responsive layout', () => {
  it('keeps the dialog inside the viewport and scrolls only its body', () => {
    useBranchStore.setState({ activeBranchId: null });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    queryClient.setQueryData(['cash-register-defaults'], { defaultOpeningFloat: 5000 });
    queryClient.setQueryData(['pos', 'cashiers'], []);

    const html = renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <OpenSessionModal onClose={vi.fn()} />
      </QueryClientProvider>,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('max-h-[calc(100dvh-1.25rem)]');
    expect(html).toContain('overflow-hidden');
    expect(html).toContain('min-h-0 flex-1 space-y-4 overflow-y-auto');
    expect(html.match(/shrink-0/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('sm:flex-row');
    expect(html).toContain('w-full justify-center');
  });
});
