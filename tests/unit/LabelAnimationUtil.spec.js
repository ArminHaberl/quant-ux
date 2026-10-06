import {
    buildChatSteps, getLabelDuration, toDuration, rateForDuration,
    resolveTypewriterDuration, DEFAULT_DURATION
} from '../../src/core/widgets/LabelAnimationUtil'

/**
 * These are the frames of the "chat" animation that types a label's text out.
 * The number is frames per character at a duration of 1, so a duration of 3
 * lands at roughly 3 characters per frame, which is what the "Animated Label"
 * palette entry uses.
 */
const FRAMES_PER_CHAR_AT_ONE = 10

describe('buildChatSteps', () => {

    test('ends with the whole text', () => {
        const steps = buildChatSteps('Hello', 3)
        expect(steps[steps.length - 1]).toBe('Hello')
    })

    test('starts from nothing', () => {
        expect(buildChatSteps('Hello', 3)[0]).toBe('')
    })

    test('advances one character per FRAMES_PER_CHAR frames', () => {
        const text = 'abcdefghij'
        const steps = buildChatSteps(text, 1)
        /**
         * 10 characters at 10 frames per character is 100 frames of progress,
         * plus the full text. So the first character appears on frame 10, and
         * frame 50 is the halfway point.
         */
        expect(steps.length).toBe(101)
        expect(steps[1]).toBe('')
        expect(steps[10]).toBe('a')
        expect(steps[50]).toBe('abcde')
    })

    test('never shows more than the text has', () => {
        const steps = buildChatSteps('short', 3)
        steps.forEach(s => expect(s.length).toBeLessThanOrEqual(5))
    })

    test('every step grows or stays the same', () => {
        const steps = buildChatSteps('a longer sentence to type out', 4)
        for (let i = 1; i < steps.length; i++) {
            expect(steps[i].length).toBeGreaterThanOrEqual(steps[i - 1].length)
        }
    })

    /**
     * The defect this extraction was written for. durationPerChar was
     * 1 / (duration * 3), so an undefined duration made it NaN, the frame count
     * NaN, the loop never ran and the text appeared all at once, which looks
     * like no animation at all.
     */
    test('a missing duration animates instead of snapping', () => {
        const steps = buildChatSteps('Hello', undefined)
        expect(steps.length).toBeGreaterThan(2)
        expect(steps[steps.length - 1]).toBe('Hello')
    })

    test.each([[undefined], [null], [0], [-1], [NaN], ['nonsense'], [{}]])(
        'falls back to the default for %p', (duration) => {
            expect(buildChatSteps('Hello', duration).length)
                .toBe(buildChatSteps('Hello', DEFAULT_DURATION).length)
        })

    /**
     * A very slow duration rounds the frame count down to zero, and the old code
     * then divided by framesPerChar, which is 0.
     */
    test('a very slow duration still produces a usable frame list', () => {
        const steps = buildChatSteps('Hello', 100000)
        expect(steps.length).toBeGreaterThanOrEqual(2)
        expect(steps[steps.length - 1]).toBe('Hello')
    })

    test('has nothing to show for empty text', () => {
        expect(buildChatSteps('', 3)).toEqual([])
    })

    test.each([[undefined], [null], ['']])('has nothing to show for %p', (text) => {
        expect(buildChatSteps(text, 3)).toEqual([])
    })

    test('coerces a number to text', () => {
        expect(buildChatSteps(42, 3)[buildChatSteps(42, 3).length - 1]).toBe('42')
    })

    test('a single character still animates', () => {
        const steps = buildChatSteps('a', 3)
        expect(steps[steps.length - 1]).toBe('a')
        expect(steps.length).toBeGreaterThanOrEqual(2)
    })
})

describe('toDuration', () => {
    test('passes a usable number through', () => {
        expect(toDuration(7)).toBe(7)
        expect(toDuration('4')).toBe(4)
    })

    test('falls back to the default when unusable', () => {
        expect(toDuration(undefined)).toBe(DEFAULT_DURATION)
        expect(toDuration(0)).toBe(DEFAULT_DURATION)
        expect(toDuration(-2)).toBe(DEFAULT_DURATION)
        expect(toDuration(Infinity)).toBe(DEFAULT_DURATION)
    })
})

describe('getLabelDuration', () => {
    /**
     * Typing speed is the designer's to set, so a script that asks for a
     * typewriter reads the label's own setting rather than supplying one.
     */
    test('reads the duration off the widget', () => {
        expect(getLabelDuration({ props: { duration: 6 } })).toBe(6)
    })

    test('falls back when the widget has no duration', () => {
        expect(getLabelDuration({ props: {} })).toBe(DEFAULT_DURATION)
        expect(getLabelDuration({})).toBe(DEFAULT_DURATION)
        expect(getLabelDuration(null)).toBe(DEFAULT_DURATION)
    })

    test('falls back when the duration on the widget is unusable', () => {
        expect(getLabelDuration({ props: { duration: 0 } })).toBe(DEFAULT_DURATION)
    })
})

describe('the rate constant', () => {
    test('is the frames per character at a duration of one', () => {
        const text = 'x'.repeat(100)
        const steps = buildChatSteps(text, 1)
        /**
         * 100 frames of progress plus the full text, at 10 per character.
         */
        expect(steps.length).toBe(100 * FRAMES_PER_CHAR_AT_ONE + 1)
    })
})

describe('rateForDuration', () => {
    /**
     * A script speaks in milliseconds and the label speaks in rate, and the rate
     * depends on how much there is to type, so the two have to be converted.
     * Frames are what actually take the time, 60 a second.
     */
    function framesFor(txt, ms) {
        return buildChatSteps(txt, rateForDuration(txt, ms)).length
    }

    test('lands on the requested wall clock time', () => {
        expect(framesFor('abcdefghij', 3000)).toBe(181)
    })

    test('takes the same time whatever the length', () => {
        /**
         * The frame count is fixed by the duration, so a longer answer types
         * faster per character rather than taking longer.
         */
        expect(framesFor('ab', 2000)).toBe(121)
        expect(framesFor('a'.repeat(2000), 2000)).toBe(121)
    })

    test('a longer text needs a higher rate for the same time', () => {
        expect(rateForDuration('a'.repeat(100), 3000))
            .toBeGreaterThan(rateForDuration('ab', 3000))
    })

    test('scales linearly with the length', () => {
        expect(rateForDuration('a'.repeat(100), 3000) / rateForDuration('ab', 3000))
            .toBeCloseTo(50, 5)
    })

    test('scales inversely with the duration', () => {
        expect(rateForDuration('abcd', 6000) / rateForDuration('abcd', 3000))
            .toBeCloseTo(0.5, 5)
    })

    test('returns null when there is nothing to type', () => {
        expect(rateForDuration('', 3000)).toBeNull()
        expect(rateForDuration(null, 3000)).toBeNull()
    })

    test.each([[0], [-1], [NaN], [undefined], ['soon']])(
        'returns null for a duration of %p', (ms) => {
            expect(rateForDuration('abcd', ms)).toBeNull()
        })
})

describe('resolveTypewriterDuration', () => {
    /**
     * One duration has to mean the same wall clock time for the typing and for
     * the fade, so a script's duration wins over the label's own setting.
     */
    test('uses the duration the script asked for', () => {
        expect(resolveTypewriterDuration('abcd', 3000, { props: { duration: 99 } }))
            .toBe(rateForDuration('abcd', 3000))
    })

    test('falls back to the label setting when the script gives no duration', () => {
        expect(resolveTypewriterDuration('abcd', undefined, { props: { duration: 7 } })).toBe(7)
    })

    test('falls back to the label setting when the script duration is unusable', () => {
        expect(resolveTypewriterDuration('abcd', 0, { props: { duration: 7 } })).toBe(7)
    })

    test('falls back to the default when neither is usable', () => {
        expect(resolveTypewriterDuration('abcd', undefined, {})).toBe(DEFAULT_DURATION)
    })

    test('falls back rather than dividing by an empty length', () => {
        expect(resolveTypewriterDuration('', 3000, { props: { duration: 7 } })).toBe(7)
    })
})
