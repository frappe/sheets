import { describe, it, expect } from 'vitest'
import { parseAcToken, parseSignatureContext, describeSignature } from './formula-ac.js'

describe('parseAcToken', () => {
  it('finds the function name being typed', () => {
    expect(parseAcToken('=SU', 3)).toEqual({ tok: 'SU', tokStart: 1 })
  })
  it('finds a token after an operator', () => {
    expect(parseAcToken('=1+AV', 5)).toEqual({ tok: 'AV', tokStart: 3 })
  })
  it('returns null when the value is not a formula', () => {
    expect(parseAcToken('SUM', 3)).toBeNull()
  })
  it('returns null once inside the parens', () => {
    expect(parseAcToken('=SUM(', 5)).toBeNull()
  })
})

describe('parseSignatureContext', () => {
  it('reports the enclosing function and first argument', () => {
    expect(parseSignatureContext('=VLOOKUP(', 9)).toEqual({ fn: 'VLOOKUP', argIndex: 0 })
  })
  it('counts commas to find the active argument', () => {
    expect(parseSignatureContext('=VLOOKUP(A1, B1:C3, ', 20)).toEqual({ fn: 'VLOOKUP', argIndex: 2 })
  })
  it('resolves to the innermost nested call', () => {
    const v = '=IF(SUM(A1,'
    expect(parseSignatureContext(v, v.length)).toEqual({ fn: 'SUM', argIndex: 1 })
  })
  it('pops back to the outer call after a nested call closes', () => {
    const v = '=IF(SUM(A1,A2), '
    expect(parseSignatureContext(v, v.length)).toEqual({ fn: 'IF', argIndex: 1 })
  })
  it('ignores commas inside string literals', () => {
    const v = '=CONCAT("a, b", '
    expect(parseSignatureContext(v, v.length)).toEqual({ fn: 'CONCAT', argIndex: 1 })
  })
  it('returns null when the caret is not inside a known function', () => {
    expect(parseSignatureContext('=A1+', 4)).toBeNull()
  })
})

describe('describeSignature', () => {
  it('marks the active parameter', () => {
    const d = describeSignature('VLOOKUP', 1)
    expect(d.params[d.active]).toBe('table')
  })
  it('keeps the repeating param active past the last index', () => {
    const d = describeSignature('SUM', 3)   // SUM(number1, ...)
    expect(d.params[d.active]).toBe('number1')
  })
  it('returns no active param past a fixed arg list', () => {
    const d = describeSignature('ABS', 2)
    expect(d.active).toBe(-1)
  })
  it('returns null for an unknown function', () => {
    expect(describeSignature('NOPE', 0)).toBeNull()
  })
})
