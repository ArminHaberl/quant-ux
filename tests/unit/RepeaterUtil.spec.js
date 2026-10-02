import * as RepeaterUtil from '../../src/core/widgets/RepeaterUtil'

/**
 * rows was not clamped, so a container too short to hold even one row
 * produced rows = 0 and the repeater rendered nothing at all.
 */
test('RepeaterUtil.calculateGrid() > clamps rows to at least 1', () => {
    const container = { x: 0, y: 0, w: 200, h: 20 }
    const child = { x: 0, y: 0, w: 200, h: 200 }
    const result = RepeaterUtil.calculateGrid(container, child, 10, 10)
    expect(result.rows).toBe(1)
})

/**
 * The vertical branch divided by (rows - 1) with no guard while the
 * horizontal branch already had Math.max(1, columns - 1). With rows === 1
 * that produced Infinity, and Repeater computes
 * r * boundingBox.h + r * grid.spacingY, so 0 * Infinity = NaN and the
 * children were positioned at "NaNpx".
 */
test('RepeaterUtil.calculateGrid() > does not produce Infinity spacing for a single row', () => {
    /**
     * One 100 tall child in a 150 tall container: rows is 1 and 50px of
     * space is left over. The old code computed 50 / (rows - 1) = 50 / 0.
     */
    const container = { x: 0, y: 0, w: 200, h: 150 }
    const child = { x: 0, y: 0, w: 200, h: 100 }
    const result = RepeaterUtil.calculateGrid(container, child, -1, -1)
    expect(result.rows).toBe(1)
    expect(Number.isFinite(result.spacingY)).toBe(true)
    expect(Number.isNaN(result.spacingY)).toBe(false)
    expect(result.spacingY).toBe(50)
})

test('RepeaterUtil.calculateGrid() > does not produce Infinity spacing for a single column', () => {
    const container = { x: 0, y: 0, w: 200, h: 400 }
    const child = { x: 0, y: 0, w: 200, h: 100 }
    const result = RepeaterUtil.calculateGrid(container, child, -1, 10)
    expect(result.columns).toBe(1)
    expect(Number.isFinite(result.spacingX)).toBe(true)
})

test('RepeaterUtil.calculateGrid() > spreads a multi row grid evenly', () => {
    /**
     * 4 children of 50 in a 200 tall container leaves 0 rest height, so
     * spacing stays 0 and rows is 4.
     */
    const container = { x: 0, y: 0, w: 200, h: 200 }
    const child = { x: 0, y: 0, w: 200, h: 50 }
    const result = RepeaterUtil.calculateGrid(container, child, 0, 0)
    expect(result.rows).toBe(4)
    expect(result.spacingY).toBe(0)
})