// Optional Sentry wiring for the SPA.
//
// Only activates when the deploying site sets `sheets_sentry_dsn`
// in site_config.json — the value is then injected into the page by
// sheets/www/sheets.py and surfaces here as
// `window.frappe.boot.sentry_dsn`. With no DSN this module is a no-op
// so local development never tries to ship to anyone's project.
//
// User identification piggybacks on the same `window.frappe.session`
// shim that drives the top-right avatar, so every captured event
// already carries the email of the affected user without us having
// to plumb anything through the app.

// Dynamic import so @sentry/vue (~90 kB gzipped) only enters the
// network at all on sites that have configured a DSN. The bare-bones
// SPA bundle stays unchanged for everyone else.
export function initSentry(app) {
  const boot = (typeof window !== 'undefined' && window.frappe?.boot) || {}
  const dsn  = boot.sentry_dsn
  if (!dsn) return

  // Fire-and-forget — we don't await, so the rest of `main.js` keeps
  // going while Sentry's chunk loads. Errors thrown before Sentry is
  // ready fall back to the browser console, which is acceptable.
  import('@sentry/vue').then(Sentry => {
    Sentry.init({
      app,
      dsn,
      environment: boot.sentry_environment || 'production',
      release:     boot.sentry_release     || undefined,
      tracesSampleRate: typeof boot.sentry_traces_sample_rate === 'number'
        ? boot.sentry_traces_sample_rate
        : 0.1,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: typeof boot.sentry_replay_on_error_rate === 'number'
        ? boot.sentry_replay_on_error_rate
        : 0,
    })
    const user = window.frappe?.session?.user
    if (user) Sentry.setUser({ email: user, username: user })
  }).catch(err => {
    // Don't crash the SPA if Sentry's chunk fails to load — just log
    // and move on. The user has bigger problems if their CDN is down.
    console.warn('[sentry] init failed:', err)
  })
}
