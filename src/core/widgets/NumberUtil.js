/**
 * Number text normalization for form input.
 *
 * Extracted next to LabelAnimationUtil.js and RepeaterUtil.js, on the same
 * reasoning: the number text boxes live in .vue files this jest config cannot
 * import, and the conversion is the one part that can be arithmetically wrong.
 */

/**
 * Convert a number text to US format ("1.5"), whatever separator the user's
 * locale would have them type. Anything that does not look like a number is
 * returned unchanged, and non-strings (a real number is already US formatted)
 * pass through untouched.
 *
 * The reason this exists: the number text boxes must not render their input as
 * <input type="number">. The browser renders and accepts the decimal separator
 * of its own locale ("," on de-DE, "." on en-US), so the same prototype reads
 * differently per nation, and a "." entry can even be rejected and sanitized
 * to empty. With type="text" the widget owns the text, and this function keeps
 * the stored, emitted and recorded values in one format.
 *
 * The last occurring separator is the decimal mark, which is the only rule
 * that reads both "1.234,56" (European, -> 1234.56) and "1,234.56" (US
 * grouped, -> 1234.56) correctly. The ambiguous "1.234" stays "1.234" and
 * "1,5" while typing becomes "1.5" immediately.
 */
export function toUSNumberString (value) {
    if (typeof value !== 'string') {
        return value
    }
    if (!/^-?[0-9.,]+$/.test(value)) {
        return value
    }
    const lastComma = value.lastIndexOf(',')
    const lastDot = value.lastIndexOf('.')
    if (lastComma > lastDot) {
        /**
         * ',' is the decimal mark, every '.' is a thousands separator.
         */
        return value.split('.').join('').split(',').join('.')
    }
    /**
     * '.' is the decimal mark (or there is none at all), every ',' is a
     * thousands separator.
     */
    return value.split(',').join('')
}
