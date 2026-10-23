import { toUSNumberString } from '../../src/core/widgets/NumberUtil'

/**
 * toUSNumberString() is the decimal separator policy of the number text
 * boxes: whatever the user's locale would have them type, the stored,
 * emitted and recorded value uses ".". The widgets cannot be mounted by this
 * jest config (no vue-jest transform), so the conversion lives here and the
 * .vue side only wires it up.
 */
describe('NumberUtil.toUSNumberString', () => {

    test('a German decimal becomes a US decimal', () => {
        expect(toUSNumberString('1,5')).toBe('1.5')
        expect(toUSNumberString('-0,5')).toBe('-0.5')
    })

    test('a US decimal is left alone', () => {
        expect(toUSNumberString('1.5')).toBe('1.5')
        expect(toUSNumberString('-2.25')).toBe('-2.25')
        expect(toUSNumberString('.5')).toBe('.5')
    })

    test('a European grouped number loses its grouping', () => {
        expect(toUSNumberString('1.234,56')).toBe('1234.56')
    })

    test('a US grouped number loses its grouping', () => {
        expect(toUSNumberString('1,234.56')).toBe('1234.56')
    })

    test('the last separator is the decimal mark', () => {
        expect(toUSNumberString('1,5')).toBe('1.5')
        expect(toUSNumberString('1.234')).toBe('1.234')
    })

    /**
     * The rewrite runs on every key press, so it also sees the intermediate
     * states of typing. "1," has to become "1." and not lose the separator.
     */
    test('intermediate typing states survive', () => {
        expect(toUSNumberString('1,')).toBe('1.')
        expect(toUSNumberString('1.')).toBe('1.')
    })

    test('an integer is left alone', () => {
        expect(toUSNumberString('42')).toBe('42')
        expect(toUSNumberString('-7')).toBe('-7')
    })

    test('text that is not a number passes through', () => {
        expect(toUSNumberString('Hello, world')).toBe('Hello, world')
        expect(toUSNumberString('1.5a')).toBe('1.5a')
        expect(toUSNumberString('1,5 6')).toBe('1,5 6')
        expect(toUSNumberString('')).toBe('')
        expect(toUSNumberString('-')).toBe('-')
    })

    test('non strings pass through, a number is already US formatted', () => {
        expect(toUSNumberString(null)).toBeNull()
        expect(toUSNumberString(undefined)).toBeUndefined()
        expect(toUSNumberString(1.5)).toBe(1.5)
    })
})
