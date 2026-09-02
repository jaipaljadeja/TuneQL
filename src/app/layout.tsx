import type { Metadata, Viewport } from 'next';
import './globals.css';
import { TooltipProvider } from '@/components/ui/tooltip';
import { siteUrl } from '@/lib/site-url';

const title = 'TuneQL | PostgreSQL Query Optimization Workbench';
const description =
  'Optimize PostgreSQL queries in your browser with real execution plans, local benchmarks, result-equivalence checks, and shared WebMCP agent tools.';

export const metadata: Metadata = {
  metadataBase: siteUrl,
  title,
  description,
  applicationName: 'TuneQL',
  authors: [{ name: 'Jaipal Jadeja', url: 'https://github.com/jaipaljadeja' }],
  creator: 'Jaipal Jadeja',
  publisher: 'TuneQL',
  category: 'developer tools',
  keywords: [
    'PostgreSQL query optimization',
    'SQL performance',
    'EXPLAIN ANALYZE',
    'PGlite',
    'WebMCP',
    'database benchmarking',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'TuneQL',
    title,
    description,
  },
  twitter: {
    card: 'summary_large_image',
    title,
    description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
  colorScheme: 'dark',
};

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'TuneQL',
  description,
  url: siteUrl.toString(),
  image: new URL('/icon.png', siteUrl).toString(),
  applicationCategory: 'DeveloperApplication',
  applicationSubCategory: 'Database development tool',
  operatingSystem: 'Any modern web browser',
  isAccessibleForFree: true,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  codeRepository: 'https://github.com/jaipaljadeja/TuneQL',
  license: 'https://opensource.org/license/mit',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="dark h-full antialiased"
      style={{ colorScheme: 'dark' }}
    >
      <body className="font-sans h-full min-h-full flex flex-col bg-background text-foreground overflow-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(softwareApplicationJsonLd),
          }}
        />
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
