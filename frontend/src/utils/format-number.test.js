import { describe, it, expect } from 'vitest'
import { parseNumberFmt, buildNumberFmt, applyNumberFmt } from './format-number.js'

describe('parseNumberFmt', () => {
  it('returns empty fields for falsy input', () => {
    expect(parseNumberFmt('')).toEqual({ type: '', variant: '', decimals: null })
    expect(parseNumberFmt(null)).toEqual({ type: '', variant: '', decimals: null })
    expect(parseNumberFmt(undefined)).toEqual({ type: '', variant: '', decimals: null })
  })

  it('parses bare type', () => {
    expect(parseNumberFmt('number')).toEqual({ type: 'number', variant: '', decimals: null })
    expect(parseNumberFmt('currency')).toEqual({ type: 'currency', variant: '', decimals: null })
  })

  it('parses legacy two-part `type:N` as decimals-only (no variant)', () => {
    expect(parseNumberFmt('number:3')).toEqual({ type: 'number', variant: '', decimals: 3 })
    expect(parseNumberFmt('currency:0')).toEqual({ type: 'currency', variant: '', decimals: 0 })
  })

  it('parses two-part `type:variant` as variant-only', () => {
    expect(parseNumberFmt('currency:INR')).toEqual({ type: 'currency', variant: 'INR', decimals: null })
    expect(parseNumberFmt('date:dmy')).toEqual({ type: 'date', variant: 'dmy', decimals: null })
  })

  it('parses three-part `type:variant:N`', () => {
    expect(parseNumberFmt('currency:INR:2')).toEqual({ type: 'currency', variant: 'INR', decimals: 2 })
    expect(parseNumberFmt('number:in:0')).toEqual({ type: 'number', variant: 'in', decimals: 0 })
  })

  it('handles empty decimals slot in three-part form', () => {
    expect(parseNumberFmt('currency:INR:')).toEqual({ type: 'currency', variant: 'INR', decimals: null })
  })
})

describe('buildNumberFmt', () => {
  it('returns empty string for no type', () => {
    expect(buildNumberFmt('', '', null)).toBe('')
    expect(buildNumberFmt(null, 'INR', 2)).toBe('')
  })

  it('emits bare type when no variant + no decimals', () => {
    expect(buildNumberFmt('number', '', null)).toBe('number')
  })

  it('emits legacy `type:N` when decimals-only (backwards-compat)', () => {
    expect(buildNumberFmt('number', '', 3)).toBe('number:3')
    expect(buildNumberFmt('currency', '', 0)).toBe('currency:0')
  })

  it('emits `type:variant` when variant-only', () => {
    expect(buildNumberFmt('currency', 'INR', null)).toBe('currency:INR')
    expect(buildNumberFmt('date', 'dmy', null)).toBe('date:dmy')
  })

  it('emits `type:variant:N` when both', () => {
    expect(buildNumberFmt('currency', 'INR', 2)).toBe('currency:INR:2')
    expect(buildNumberFmt('number', 'in', 0)).toBe('number:in:0')
  })

  it('round-trips through parseNumberFmt', () => {
    for (const fmt of ['number', 'number:3', 'currency:USD:2', 'currency:INR', 'date:dmy', 'number:in:0']) {
      const { type, variant, decimals } = parseNumberFmt(fmt)
      expect(buildNumberFmt(type, variant, decimals)).toBe(fmt)
    }
  })
})

describe('applyNumberFmt — backwards-compat baseline', () => {
  // These pin the existing behaviour from before the grammar extension.
  // New variant renderers land in subsequent commits — until then, an
  // unknown variant just falls through to the default for that type.
  it('returns value unchanged when no format', () => {
    expect(applyNumberFmt('hello', '')).toBe('hello')
    expect(applyNumberFmt(42, null)).toBe(42)
  })

  it('text passes value through as string', () => {
    expect(applyNumberFmt(42, 'text')).toBe('42')
    expect(applyNumberFmt(null, 'text')).toBe('')
  })

  it('number applies decimals', () => {
    expect(applyNumberFmt(1234.5, 'number:2')).toBe((1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  })

  it('currency defaults to USD with 2 decimals', () => {
    // Locale-sensitive output; just assert it contains the USD symbol and the integer part.
    const out = applyNumberFmt(1234, 'currency')
    expect(out).toMatch(/\$/)
    expect(out).toContain('1,234')
  })

  it('legacy currency:N still works', () => {
    expect(applyNumberFmt(10, 'currency:0')).toBe('$10')
  })

  it('percentage scales x100 and appends %', () => {
    expect(applyNumberFmt(0.25, 'percentage')).toBe('25.00%')
    expect(applyNumberFmt(0.5,  'percentage:0')).toBe('50%')
  })

  it('non-numeric value with numeric format passes through', () => {
    expect(applyNumberFmt('abc', 'number')).toBe('abc')
    expect(applyNumberFmt('abc', 'currency')).toBe('abc')
  })
})
