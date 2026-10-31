import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export function QrCode({ value, className }: { value: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(value, { margin: 1, width: 600, color: { dark: '#04104a', light: '#ffffff' } }).then(setSrc);
  }, [value]);
  return src ? <img src={src} alt={`QR code for ${value}`} className={className} /> : null;
}
