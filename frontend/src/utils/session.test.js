import { describe, it, expect, afterEach } from 'vitest'
import { getSessionUser, userInitials } from './session.js'

// The util reads globals (window.frappe, document.cookie) that don't exist in
// the default `node` vitest environment; we stub them per-test and clean up.
function setEnv({ frappe, cookie } = {}) {
  if (frappe !== undefined) globalThis.window = { frappe }
  if (cookie !== undefined) globalThis.document = { cookie }
}
afterEach(() => {
  delete globalThis.window
  delete globalThis.document
})

describe('getSessionUser', () => {
  it('prefers the window.frappe shim (standalone www page)', () => {
    setEnv({ frappe: { session: { user: 'a@x.com', user_fullname: 'Asif Mulani', user_image: '/img.png' } } })
    expect(getSessionUser()).toEqual({ user: 'a@x.com', fullName: 'Asif Mulani', image: '/img.png' })
  })

  it('falls back to Frappe login cookies when window.frappe is absent (suite deployment)', () => {
    setEnv({ cookie: 'sid=abc; user_id=a@x.com; full_name="Asif Mulani"; user_image=%2Fimg.png' })
    expect(getSessionUser()).toEqual({ user: 'a@x.com', fullName: 'Asif Mulani', image: '/img.png' })
  })

  it('treats a Guest session as not logged in', () => {
    setEnv({ cookie: 'user_id=Guest; full_name=Guest' })
    expect(getSessionUser()).toEqual({ user: '', fullName: '', image: '' })
  })

  it('returns empty strings when nothing is available (no window, no cookies)', () => {
    expect(getSessionUser()).toEqual({ user: '', fullName: '', image: '' })
  })
})

describe('userInitials', () => {
  it('builds two-letter initials from first and last name', () => {
    expect(userInitials('Asif Mulani', 'a@x.com')).toBe('AM')
  })
  it('uses a single initial for a one-word name', () => {
    expect(userInitials('Asif', 'a@x.com')).toBe('A')
  })
  it('falls back to the first letter of the email when there is no name', () => {
    expect(userInitials('', 'zoe@x.com')).toBe('Z')
  })
  it('falls back to "U" when there is neither name nor email', () => {
    expect(userInitials('', '')).toBe('U')
  })
})
