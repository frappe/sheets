import { describe, it, expect } from 'vitest'
import { autoCloseKey } from './formula-autoclose.js'

describe('autoCloseKey', () => {
  it('leaves plain text alone (no leading =)', () => {
    expect(autoCloseKey('(', 'note (', 6, 6)).toBeNull()
  })

  it('inserts a matching ) and keeps the caret inside', () => {
    expect(autoCloseKey('(', '=SUM', 4, 4)).toEqual({ value: '=SUM()', caret: 5 })
  })

  it('wraps a selection when ( is typed over it', () => {
    // caret span covers "A1" in "=A1"
    expect(autoCloseKey('(', '=A1', 1, 3)).toEqual({ value: '=(A1)', caret: 2 })
  })

  it('steps over an existing ) instead of duplicating it', () => {
    expect(autoCloseKey(')', '=SUM()', 5, 5)).toEqual({ value: '=SUM()', caret: 6 })
  })

  it('does not step over when the next char is not )', () => {
    expect(autoCloseKey(')', '=SUM(1', 6, 6)).toBeNull()
  })

  it('Backspace clears an empty () pair', () => {
    expect(autoCloseKey('Backspace', '=SUM()', 5, 5)).toEqual({ value: '=SUM', caret: 4 })
  })

  it('Backspace is left to native handling when the pair is not empty', () => {
    expect(autoCloseKey('Backspace', '=SUM(1)', 6, 6)).toBeNull()
  })

  it('returns null for ) / Backspace when there is a selection', () => {
    expect(autoCloseKey(')', '=SUM()', 4, 6)).toBeNull()
    expect(autoCloseKey('Backspace', '=SUM()', 4, 6)).toBeNull()
  })

  it('returns null for keys it does not handle', () => {
    expect(autoCloseKey('a', '=SUM', 4, 4)).toBeNull()
  })
})
