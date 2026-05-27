function detectCompanySlug(): string | undefined {
  if (typeof window === 'undefined') return import.meta.env.VITE_COMPANY_SLUG as string | undefined;
  if (window.location.hostname.startsWith('admin.')) return 'system';
  return import.meta.env.VITE_COMPANY_SLUG as string | undefined;
}

export const COMPANY_SLUG = detectCompanySlug();
