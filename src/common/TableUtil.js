/**
 * Pure helpers for common/Table.vue pagination.
 *
 * common/Table.vue used to render one <tr> per session without any paging:
 * with many sessions the Screen Recordings table rebuilt thousands of DOM
 * nodes on every render, and the half-built paging scaffold of the table
 * (createPagging()/setPos()) never sliced the rows, so enabling it changed
 * nothing. The slicing math lives here so a jest spec (which cannot import
 * a .vue file) can test it.
 */

/**
 * Number of pages for a given data volume. Always at least one.
 */
export function getPageCount (total, itemsPerPage) {
    if (!itemsPerPage || itemsPerPage <= 0) {
        return 1
    }
    return Math.max(1, Math.ceil(total / itemsPerPage))
}

/**
 * The rows visible on the page that starts at itemPointer. itemPointer
 * always points at the first row of a page.
 */
export function getPagedRows (rows, itemPointer, itemsPerPage) {
    if (!itemsPerPage || itemsPerPage <= 0) {
        return rows.slice()
    }
    return rows.slice(itemPointer, itemPointer + itemsPerPage)
}

/**
 * Clamps a page pointer so it sits on a page boundary within the data.
 * Used when the data shrinks (delete, refetch) while the table is open.
 */
export function clampPagePointer (itemPointer, total, itemsPerPage) {
    const count = getPageCount(total, itemsPerPage)
    const maxPointer = (count - 1) * itemsPerPage
    if (itemPointer > maxPointer) {
        return maxPointer
    }
    if (itemPointer < 0) {
        return 0
    }
    return itemPointer
}

/**
 * Page indices to render in the pagination bar: current page, its
 * neighbours and always the first and last page, without ever going
 * below zero or above the last page. With 500 pages that keeps the bar
 * at windowSize entries instead of 500 <li> nodes.
 */
export function getPageWindow (itemPointer, total, itemsPerPage, windowSize = 7) {
    const count = getPageCount(total, itemsPerPage)
    const currentZeroBased = itemsPerPage > 0 ? Math.floor(itemPointer / itemsPerPage) : 0
    const current = Math.min(currentZeroBased, count - 1)

    const half = Math.max(0, Math.floor((windowSize - 1) / 2))
    let start = current - half
    let end = start + Math.max(0, windowSize - 1)
    if (start < 0) {
        end -= start
        start = 0
    }
    if (end > count - 1) {
        start -= end - (count - 1)
        end = count - 1
    }
    if (start < 0) {
        start = 0
    }

    const pages = []
    for (let i = start; i <= end; i++) {
        pages.push(i)
    }
    return pages
}
