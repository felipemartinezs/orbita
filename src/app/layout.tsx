import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Orbita – Planos GPS',
  description: 'Planos inteligentes para técnicos de campo CCTV. Superpone tu ubicación GPS en tiempo real sobre planos PDF.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Orbita',
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='es'>
      <head>
        <link rel='apple-touch-icon' href='/icons/icon-192.png' />
        <meta name='theme-color' content='#0a0a0f' />
      </head>
      <body>{children}</body>
    </html>
  );
}
