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

test('Test TableUtil.getPageIndexes() > the row indexes of one page', () => {
  const total = 60

  // first page
  expect(TableUtil.getPageIndexes(total, 0, 25)).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24
  ])

  // last partial page
  expect(TableUtil.getPageIndexes(total, 50, 25)).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59])

  // pointer at the end: empty page
  expect(TableUtil.getPageIndexes(total, 60, 25)).toEqual([])

  // no page size: every index (tables without paging)
  expect(TableUtil.getPageIndexes(3, 0).length).toBe(3)

  // parallel arrays slice in lockstep: rows, labels, ids, tasks
  const rows = ['a', 'b', 'c', 'd', 'e']
  const labels = ['A', 'B', 'C', 'D', 'E']
  const page = TableUtil.getPageIndexes(rows.length, 2, 2)
  expect(page.map(i => rows[i])).toEqual(['c', 'd'])
  expect(page.map(i => labels[i])).toEqual(['C', 'D'])
})

test('Test TableUtil.matchesSearch() > case insensitive contains over all values', () => {
  const row = {
    session: 's10004_28487',
    user: 'User B',
    label: 'Test 2',
    taskNames: ['Go to second screen', 'Abrir e fechar menu'],
    taskSuccess: 1,
    duration: 42
  }

  // empty or blank query matches everything
  expect(TableUtil.matchesSearch(row, '')).toBe(true)
  expect(TableUtil.matchesSearch(row, '   ')).toBe(true)
  expect(TableUtil.matchesSearch(row, null)).toBe(true)

  // case insensitive substring over string values
  expect(TableUtil.matchesSearch(row, 'user b')).toBe(true)
  expect(TableUtil.matchesSearch(row, 's10004')).toBe(true)
  expect(TableUtil.matchesSearch(row, 'USER B')).toBe(true)

  // nested arrays (the task names) are searched too
  expect(TableUtil.matchesSearch(row, 'abrir')).toBe(true)
  expect(TableUtil.matchesSearch(row, 'second screen')).toBe(true)

  // numbers are stringified
  expect(TableUtil.matchesSearch(row, '42')).toBe(true)
  expect(TableUtil.matchesSearch(row, '421')).toBe(false)

  // misses
  expect(TableUtil.matchesSearch(row, 'nowhere')).toBe(false)
  expect(TableUtil.matchesSearch(null, 'x')).toBe(false)
})

