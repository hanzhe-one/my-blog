import { describe, expect, test } from 'bun:test'
import { clampDelta } from './clawd-drag.js'

describe('Clawd dragging viewport bounds', () => {
  const rect = { left: 100, top: 100, right: 180, bottom: 180 }
  test('allows free movement inside viewport', () => {
    expect(clampDelta(rect, 30, 40, 412, 915)).toEqual({ x: 30, y: 40 })
  })
  test('keeps the artwork inside every viewport edge', () => {
    expect(clampDelta(rect, -500, -500, 412, 915)).toEqual({ x: -94, y: -94 })
    expect(clampDelta(rect, 5000, 5000, 412, 915)).toEqual({ x: 226, y: 729 })
  })
  test('retains the exact designed location without movement', () => {
    expect(clampDelta(rect, 0, 0, 412, 915)).toEqual({ x: 0, y: 0 })
  })
})
