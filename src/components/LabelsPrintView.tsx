import { BarcodeDisplay } from './BarcodeDisplay';

export interface LabelItem {
  code: string;          // IMEI or SKU — what the barcode encodes
  productName: string;   // big text under barcode
  detail?: string;       // small text (color/storage)
  warrantyLines?: string[]; // เงื่อนไข + วันหมดประกันจากข้อมูลราย Serial
  price?: string;        // ราคา (optional)
}

interface Props {
  items: LabelItem[];
  copies?: number;       // duplicate each item N times
}

/**
 * Renders a grid of printable barcode labels.
 * Designed for A4 / 24-up labels (3 cols x 8 rows).
 * Visible only when window.print() runs (CSS @media print rules).
 */
export function LabelsPrintView({ items, copies = 1 }: Props) {
  const expanded = items.flatMap((it) => Array(copies).fill(it) as LabelItem[]);

  return (
    <div className="labels-print">
      {expanded.map((item, i) => (
        <div className="label-cell" key={i}>
          <div className="label-name">{item.productName}</div>
          {item.detail && <div className="label-detail">{item.detail}</div>}
          {item.warrantyLines?.map((line) => (
            <div className="label-detail" key={line}>{line}</div>
          ))}
          <BarcodeDisplay
            value={item.code}
            height={36}
            width={1.4}
            fontSize={10}
            displayValue={true}
          />
          {item.price && <div className="label-price">{item.price}</div>}
        </div>
      ))}
    </div>
  );
}
