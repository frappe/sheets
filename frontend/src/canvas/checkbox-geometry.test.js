import { describe, it, expect } from 'vitest'
import { checkboxRect, CHECKBOX } from './checkbox-geometry.js'

describe('checkboxRect', () => {
  it('centres the box in the cell', () => {
    const { x, y, size } = checkboxRect(100, 40)
    expect(x).toBe((100 - size) / 2)
    expect(y).toBe((40 - size) / 2)
  })

  it('caps the size at maxSize on a tall cell', () => {
    expect(checkboxRect(100, 100).size).toBe(CHECKBOX.maxSize)
  })

  it('shrinks to fit a short row', () => {
    expect(checkboxRect(100, 12).size).toBe(12 - CHECKBOX.margin)
  })
})
