/**
 * The frame list behind a Label's "chat" animation, which types its text out.
 *
 * Extracted from Label.vue because that is a .vue file and this jest config has
 * no vue-jest transform, so anything in there is untestable. This is the one
 * part of the animation that can be arithmetically wrong, so it is the part
 * worth having a spec for. What is left in Label.vue is the rAF loop, which a
 * spec cannot reach either way.
 */

/**
 * Frames per character, at a duration of 1. The "duration" setting is therefore
 * not milliseconds: bigger means slower, and 3 lands at roughly 3 characters per
 * frame, about 200 characters a second. That is the number the palette entry for
 * the "Animated Label" uses.
 */
const FRAMES_PER_CHAR_AT_UNIT_DURATION = 10

/**
 * Frames per millisecond, at 60 fps. Used only to turn a wall clock duration
 * into the rate above, so that a script can ask for "type this over 2 seconds"
 * without the label knowing what a rate is.
 */
const FRAMES_PER_MS = 0.06

/**
 * Used when a label is animated but carries no duration. Without it
 * durationPerChar becomes NaN, the frame count becomes NaN, the loop never
 * runs, and the text appears all at once, which looks like no animation at all.
 */
export const DEFAULT_DURATION = 3

/**
 * The strings to show, one per frame, ending with the whole text.
 */
export function buildChatSteps (txt, duration) {
    const text = txt != null ? String(txt) : ''
    if (text.length === 0) {
        return []
    }

    const rate = toDuration(duration)
    /**
     * A very slow duration can round the frame count down to nothing, which
     * would leave the loop dividing by zero. One frame still shows something.
     */
    const frames = Math.max(1, Math.round(text.length * FRAMES_PER_CHAR_AT_UNIT_DURATION / rate))

    const steps = []
    for (let i = 0; i < frames; i++) {
        const chars = Math.floor(i * text.length / frames)
        steps.push(text.slice(0, chars))
    }
    steps.push(text)
    return steps
}

/**
 * The duration for a label, falling back to the default when it is missing or
 * is not a usable number.
 */
export function toDuration (duration) {
    const value = duration * 1
    if (!isFinite(value) || value <= 0) {
        return DEFAULT_DURATION
    }
    return value
}

/**
 * The duration to hand a label, from the model, for a script that types it.
 *
 * The speed stays the designer's to set, so a script that asks for a typewriter
 * does not need to know the units.
 */
export function getLabelDuration (widget) {
    if (widget && widget.props && widget.props.duration != null) {
        return toDuration(widget.props.duration)
    }
    return DEFAULT_DURATION
}

/**
 * The rate that types `txt` over `durationMs` milliseconds, or null when that
 * cannot be worked out.
 *
 * A script speaks in milliseconds and the label speaks in rate, and the rate
 * depends on how much there is to type, so the conversion has to happen here.
 * buildChatSteps gives frames = length * 10 / rate, so for the frames to take
 * durationMs the rate is length * 10 / (durationMs * frames per ms).
 */
export function rateForDuration (txt, durationMs) {
    const text = txt != null ? String(txt) : ''
    const ms = durationMs * 1
    if (text.length === 0 || !isFinite(ms) || ms <= 0) {
        return null
    }
    return (text.length * FRAMES_PER_CHAR_AT_UNIT_DURATION) / (ms * FRAMES_PER_MS)
}

/**
 * The rate a scripted typewriter should use: the duration the script asked for,
 * and otherwise whatever the label was configured with.
 *
 * This is what makes one `duration` mean the same thing for the typing and for
 * the fade of the elements that are not labels.
 */
export function resolveTypewriterDuration (txt, durationMs, widget) {
    const rate = rateForDuration(txt, durationMs)
    if (rate != null) {
        return rate
    }
    return getLabelDuration(widget)
}
