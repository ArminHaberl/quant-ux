/**
 * Helpers that take big, read-only data out of Vue 2's reach.
 *
 * Vue observes every object stored in data or props deeply: one observer,
 * one Dep and one getter/setter pair per property. For the raw event log
 * and the pre-computed analytics rows that multiplies their memory several
 * times, and every assignment re-walks the whole structure. Vue's observer
 * bails out on non-extensible values, so frozen objects are skipped
 * entirely - freezing read-only data removes that overhead without any
 * consumer noticing. Everything that is mutated in place (the session
 * annotations, the test settings) must never be frozen.
 */

/**
 * Freezes every item of an array, but not the array itself: the arrays
 * stay sortable in place (DataFrame.sortBy() reorders the wrapped array),
 * while the event objects become immutable.
 */
export function freezeItems (items) {
    if (Array.isArray(items)) {
        for (let i = 0; i < items.length; i++) {
            Object.freeze(items[i])
        }
    }
    return items
}

/**
 * Freezes a freshly built result object recursively (objects and arrays).
 * Used for structures that are rebuilt from scratch on every change, like
 * the survey table, so the whole subtree stays unobserved.
 */
export function deepFreeze (obj) {
    if (obj && typeof obj === 'object' && !Object.isFrozen(obj)) {
        Object.freeze(obj)
        for (const key in obj) {
            deepFreeze(obj[key])
        }
    }
    return obj
}
