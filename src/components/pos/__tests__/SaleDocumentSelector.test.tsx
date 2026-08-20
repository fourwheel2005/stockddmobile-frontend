import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SaleDocumentSelector } from '../SaleDocumentSelector';

describe('SaleDocumentSelector shipping label option', () => {
  it('shows shipping label as an independent after-checkout option', () => {
    const html = renderToStaticMarkup(
      <SaleDocumentSelector
        mode="RECEIPT"
        buyerName=""
        disabled={false}
        shippingLabelSelected
        shippingRecipientReady
        onReceipt={vi.fn()}
        onTaxInvoice={vi.fn()}
        onToggleShippingLabel={vi.fn()}
      />,
    );

    expect(html).toContain('ป้ายที่อยู่ 10×15');
    expect(html).toContain('พิมพ์หลังปิดบิลสำเร็จ');
    expect(html).toContain('ผู้รับพร้อมพิมพ์');
  });
});
