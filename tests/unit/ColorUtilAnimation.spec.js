import * as ColorUtil from '../../src/core/code/ColorUtil'
import Animation from '../../src/core/Animation'

/**
 * getGradientCSS used `value + ");"` instead of `+=`. The closing paren was
 * computed and thrown away, so every caller produced unterminated CSS:
 *   "linear-gradient" + "(90deg,#fff 0% ,#000 100% "
 * which a browser drops, so no gradient rendered at all.
 */
test('ColorUtil.getGradientCSS() > closes the parenthesis', () => {
    const result = ColorUtil.getGradientCSS({
        direction: 90,
        colors: [{ c: '#ffffff', p: 0 }, { c: '#000000', p: 100 }]
    })
    expect(result.startsWith('(')).toBe(true)
    expect(result.endsWith(');')).toBe(true)
    expect(result).toBe('(90deg,#ffffff 0% ,#000000 100% );')
})

test('ColorUtil.getGradientCSS() > output is balanced', () => {
    const result = ColorUtil.getGradientCSS({
        direction: 45,
        colors: [{ c: '#123456', p: 0 }, { c: '#abcdef', p: 50 }, { c: '#fedcba', p: 100 }]
    })
    const open = (result.match(/\(/g) || []).length
    const close = (result.match(/\)/g) || []).length
    expect(open).toBe(close)
})

test('ColorUtil.getGradientCSS() > sorts colors by percentage', () => {
    const result = ColorUtil.getGradientCSS({
        direction: 0,
        colors: [{ c: '#000000', p: 100 }, { c: '#ff0000', p: 0 }]
    })
    expect(result).toBe('(0deg,#ff0000 0% ,#000000 100% );')
})

/**
 * The inverse map is consulted when navigating backwards (Simulator.vue sets
 * backLine.animation = inverse). "fadeInt" matched no createScreen_* factory,
 * so renderTransition fell through to a branch that skips removeScreen and
 * the ScreenLoaded event: the old screen stayed in the DOM and the replay
 * recorded nothing.
 */
test('Animation > fadeOut maps to a real animation factory', () => {
    const animation = new Animation()
    expect(animation.getInverseAnimation('fadeOut')).toBe('fadeIn')
})

test('Animation > every inverse value resolves to a createScreen_ factory', () => {
    const animation = new Animation()
    Object.keys(animation._inverse).forEach((key) => {
        const inverse = animation.getInverseAnimation(key)
        expect(typeof inverse).toBe('string')
        expect(typeof animation['createScreen_' + inverse]).toBe('function')
    })
})