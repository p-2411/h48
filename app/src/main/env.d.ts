// Settings baked into the main process at build time (electron-vite reads MAIN_VITE_* from the
// environment or app/.env files). See src/main/reports.
interface ImportMetaEnv {
  readonly MAIN_VITE_SENTRY_DSN?: string
  readonly MAIN_VITE_POSTHOG_KEY?: string
  readonly MAIN_VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
