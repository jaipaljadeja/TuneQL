const configuredUrl =
  process.env.NEXT_PUBLIC_SITE_URL ??
  process.env.VERCEL_PROJECT_PRODUCTION_URL ??
  process.env.VERCEL_URL;

const normalizedUrl = configuredUrl
  ? configuredUrl.startsWith('http')
    ? configuredUrl
    : `https://${configuredUrl}`
  : 'http://localhost:3000';

export const siteUrl = new URL(normalizedUrl);
