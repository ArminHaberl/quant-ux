/**
 * Paging math for common/Table.vue.
 *
 * The table used to render one <tr> per row for the complete data volume
 * (the session table of the Test tab), and the half built pagination of
 * createPagging() never sliced the rows. The slicing math lives in
 * src/common/TableUtil.js so it can be tested without mounting the .vue
 * component (specs cannot import .vue files).
 */
import * as TableUtil from '../../src/common/TableUtil'

test('Test TableUtil.getPageCount() > ceil, at least one page', () => {
  expect(TableUtil.getPageCount(0, 25)).toBe(1)
  expect(TableUtil.getPageCount(1, 25)).toBe(1)
  expect(TableUtil.getPageCount(25, 25)).toBe(1)
  expect(TableUtil.getPageCount(26, 25)).toBe(2)
  expect(TableUtil.getPageCount(100, 25)).toBe(4)
  // no page size or a broken one: one page
  expect(TableUtil.getPageCount(100, 0)).toBe(1)
  expect(TableUtil.getPageCount(100)).toBe(1)
})

test('Test TableUtil.getPagedRows() > slices the current page', () => {
  const rows = []
  for (let i = 0; i < 60; i++) {
    rows.push({ id: i })
  }

  // first page
  let page = TableUtil.getPagedRows(rows, 0, 25)
  expect(page.length).toBe(25)
  expect(page[0].id).toBe(0)
  expect(page[24].id).toBe(24)

  // second page
  page = TableUtil.getPagedRows(rows, 25, 25)
  expect(page.length).toBe(25)
  expect(page[0].id).toBe(25)

  // last partial page
  page = TableUtil.getPagedRows(rows, 50, 25)
  expect(page.length).toBe(10)
  expect(page[0].id).toBe(50)
  expect(page[9].id).toBe(59)

  // paging disabled (no size): every row
  expect(TableUtil.getPagedRows(rows, 0).length).toBe(60)
})

test('Test TableUtil.clampPagePointer() > keeps the pointer on a valid page when data shrinks', () => {
  // still in range
  expect(TableUtil.clampPagePointer(25, 60, 25)).toBe(25)
  // data shrinks below the pointer: jump to the last page
  expect(TableUtil.clampPagePointer(75, 60, 25)).toBe(50)
  expect(TableUtil.clampPagePointer(50, 60, 25)).toBe(50)
  // empty data
  expect(TableUtil.clampPagePointer(25, 0, 25)).toBe(0)
  // never negative
  expect(TableUtil.clampPagePointer(-25, 60, 25)).toBe(0)
})

test('Test TableUtil.getPageWindow() > centers the current page and clamps to the first and last', () => {
  // 20 pages, window 7
  const total = 100
  const ipp = 5

  // first page: [0..6]
  expect(TableUtil.getPageWindow(0, total, ipp)).toEqual([0, 1, 2, 3, 4, 5, 6])

  // centered page: [6..12]
  expect(TableUtil.getPageWindow(45, total, ipp)).toEqual([6, 7, 8, 9, 10, 11, 12])

  // last page: [13..19]
  expect(TableUtil.getPageWindow(95, total, ipp)).toEqual([13, 14, 15, 16, 17, 18, 19])

  // fewer pages than the window: all pages
  expect(TableUtil.getPageWindow(0, 15, ipp)).toEqual([0, 1, 2])

  // a pointer beyond the data does not explode (setValue clamps, but be safe)
  expect(TableUtil.getPageWindow(999, total, ipp)).toEqual([13, 14, 15, 16, 17, 18, 19])
})
