// Coverage for the thin api.js wrapper around /api/method/*. The error
// attachment behaviour (excType, status) is what every other layer of
// the SPA branches on — usePersistence's retry logic, the editor's
// load-error screen, the share dialog's banner. Regressing this would
// silently break recovery paths everywhere, so we guard the contract.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { call } from './api.js'

function jsonResponse(body, { status = 200 } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }
}

describe('api.call', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn()
    globalThis.window = { csrf_token: 'tok' }
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns the `message` field on success', async () => {
    fetch.mockResolvedValue(jsonResponse({ message: { name: 'sheet-001' } }))
    const out = await call('sheets.api.save_sheet', { title: 'x' })
    expect(out).toEqual({ name: 'sheet-001' })
  })

  it('sends the CSRF token in the X-Frappe-CSRF-Token header', async () => {
    fetch.mockResolvedValue(jsonResponse({ message: 'ok' }))
    await call('any.method')
    const init = fetch.mock.calls[0][1]
    expect(init.headers['X-Frappe-CSRF-Token']).toBe('tok')
  })

  it('attaches excType + status to thrown errors so callers can branch', async () => {
    fetch.mockResolvedValue(jsonResponse(
      { exc: '[...]', exc_type: 'PermissionError' },
      { status: 403 },
    ))
    try {
      await call('sheets.api.get_sheet', { name: 'x' })
      throw new Error('expected call() to throw')
    } catch (err) {
      expect(err.excType).toBe('PermissionError')
      expect(err.status).toBe(403)
    }
  })

  it('prefers the _server_messages message text over exc_type for the human message', async () => {
    // Frappe wraps user-facing messages in _server_messages (double-encoded JSON).
    const inner = JSON.stringify({ message: 'Sheet not found' })
    fetch.mockResolvedValue(jsonResponse(
      { exc: '[...]', exc_type: 'DoesNotExistError', _server_messages: JSON.stringify([inner]) },
      { status: 417 },
    ))
    try {
      await call('sheets.api.get_sheet', { name: 'x' })
      throw new Error('expected call() to throw')
    } catch (err) {
      expect(err.message).toBe('Sheet not found')
      expect(err.excType).toBe('DoesNotExistError')
      expect(err.status).toBe(417)
    }
  })

  it('falls back to exc_type as the message when _server_messages is missing', async () => {
    fetch.mockResolvedValue(jsonResponse(
      { exc: '[...]', exc_type: 'CSRFTokenError' },
      { status: 417 },
    ))
    try {
      await call('any.method')
      throw new Error('expected call() to throw')
    } catch (err) {
      expect(err.message).toBe('CSRFTokenError')
      expect(err.excType).toBe('CSRFTokenError')
    }
  })

  it('throws on a non-2xx response even when the body has no exc', async () => {
    // E.g. an HTTP 500 from nginx with an empty JSON body.
    fetch.mockResolvedValue(jsonResponse({}, { status: 500 }))
    try {
      await call('any.method')
      throw new Error('expected call() to throw')
    } catch (err) {
      expect(err.status).toBe(500)
    }
  })
})
