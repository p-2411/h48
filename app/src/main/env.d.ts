// Settings fixed when the app is built (electron-vite puts MAIN_VITE_* from the environment or a
// .env file into the main process). See src/main/reports and src/main/account.
interface ImportMetaEnv {
  /** The WorkOS client id for sign-in (not a secret). Without it the build has no sign-in. */
  readonly MAIN_VITE_WORKOS_CLIENT_ID?: string
  readonly MAIN_VITE_SENTRY_DSN?: string
  readonly MAIN_VITE_POSTHOG_KEY?: string
  readonly MAIN_VITE_POSTHOG_HOST?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
