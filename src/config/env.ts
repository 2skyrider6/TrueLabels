export type AppEnvironment = 'development' | 'staging' | 'production';

const rawEnv = process.env.EXPO_PUBLIC_APP_ENV ?? 'development';

export const appEnvironment: AppEnvironment =
  rawEnv === 'staging' || rawEnv === 'production' ? rawEnv : 'development';

export const isProduction = appEnvironment === 'production';
export const isDevelopment = appEnvironment === 'development';

export const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_BASE_URL ??
  'https://world.openfoodfacts.org/api/v0';

export const searchUrl =
  process.env.EXPO_PUBLIC_SEARCH_URL ??
  'https://world.openfoodfacts.org/cgi/search.pl';

export const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const logLevel = process.env.EXPO_PUBLIC_LOG_LEVEL ?? 'info';

export const featureFlags = {
  ocrExperiments: process.env.EXPO_PUBLIC_ENABLE_OCR_EXPERIMENTS === 'true',
};
