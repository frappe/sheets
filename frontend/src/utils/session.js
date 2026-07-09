// Resolve the logged-in Frappe user across deployment contexts.
//
// Standalone Sheets serves its SPA from www/sheets.html, which injects
// `window.frappe.session.{user,user_fullname,user_image}` (see www/sheets.py).
// But when Sheets is embedded in the frappe/suite monorepo the page is served
// by suite's own frontend, which never sets `window.frappe` — so the avatar
// used to collapse to the literal "U" fallback there.
//
// Frappe writes the logged-in identity into cookies on every authenticated
// session (`user_id`, `full_name`, `user_image`; only `sid` is httponly), so
// reading those recovers the user in both contexts without an API round-trip.

function readCookie(name) {
  // Tests run under the `node` vitest environment where `document` is absent.
  if (typeof document === 'undefined') return ''
  const m = document.cookie.match(new RegExp('(?:^|;\\s*)' + name + '=([^;]*)'))
  if (!m) return ''
  let v = m[1]
  // Werkzeug wraps cookie values that contain spaces in double quotes
  // (e.g. full_name="Asif Mulani"); strip them before decoding.
  if (v.length >= 2 && v[0] === '"' && v[v.length - 1] === '"') v = v.slice(1, -1)
  try { return decodeURIComponent(v) } catch (_) { return v }
}

// Best-effort, synchronous: window.frappe shim first (standalone www page),
// then Frappe's login cookies (works in the suite deployment too). Guest
// sessions carry user_id=Guest — treat that as "not logged in" so the avatar
// falls back cleanly rather than rendering a "G".
export function getSessionUser() {
  const w = (typeof window !== 'undefined') ? window : undefined
  const s = w?.frappe?.session || {}
  const user     = s.user          || readCookie('user_id')  || ''
  const fullName = s.user_fullname || readCookie('full_name') || ''
  const image    = s.user_image    || readCookie('user_image') || ''
  if (!user || user === 'Guest') return { user: '', fullName: '', image: '' }
  return { user, fullName, image }
}

// Two-letter initials from a full name ("Asif Mulani" → "AM"); falls back to
// the first letter of the email, then "U" so the avatar is never empty.
export function userInitials(fullName, email) {
  const fn = (fullName || '').trim()
  if (fn) {
    const parts = fn.split(/\s+/)
    return ((parts[0][0] || '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
  }
  return (email ? email[0] : 'U').toUpperCase()
}
