import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

interface Props {
  value: string;
  /** CODE128 (default — best for IMEI/SKU) | EAN13 | CODE39 */
  format?: 'CODE128' | 'EAN13' | 'CODE39';
  /** Bar height in pixels */
  height?: number;
  /** Bar width (1 = narrow, 2 = normal, 3 = wide) */
  width?: number;
  /** Show the text under the barcode */
  displayValue?: boolean;
  /** Font size of the text */
  fontSize?: number;
  /** Background color */
  background?: string;
  className?: string;
}

/**
 * Renders a barcode inline as SVG.
 * Replaces external services like barcode.tec-it.com — works offline,
 * unlimited, no watermark.
 *
 * @example
 *   <BarcodeDisplay value="351111111111111" />
 *   <BarcodeDisplay value={variant.sku} height={40} />
 */
export function BarcodeDisplay({
  value,
  format = 'CODE128',
  height = 60,
  width = 2,
  displayValue = true,
  fontSize = 14,
  background = '#ffffff',
  className,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || !value) return;
    try {
      JsBarcode(svgRef.current, value, {
        format,
        height,
        width,
        displayValue,
        fontSize,
        background,
        margin: 4,
        textMargin: 2,
      });
    } catch (err) {
      console.error('JsBarcode error:', err);
    }
  }, [value, format, height, width, displayValue, fontSize, background]);

  if (!value) return null;
  return <svg ref={svgRef} className={className} />;
}
