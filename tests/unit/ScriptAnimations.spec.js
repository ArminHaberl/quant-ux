import * as ScriptAnimations from '../../src/core/engines/ScriptAnimations'

/**
 * Fakes. The point of ScriptAnimations is the order of operations and the values
 * it hands the animation engine, so the spec records calls instead of running
 * anything. No requestAnimationFrame and therefore no jsdom.
 */
function harness(options) {
    const opts = options || {}
    const live = opts.live || []
    /**
     * Ids in here come back as widgets that can type, with the text they hold.
     * Everything in live comes back as a widget that cannot.
     * Anything in boxes comes back from getAnimationWrapper but not from
     * getUIWidgetByID, which is how RenderFactory treats the pure DOM widget
     * types: a div in _widgetNodes with no entry in _uiWidgets.
     */
    const labels = opts.labels || {}
    const boxes = opts.boxes || []

    const model = {
        screens: { s1: { id: 's1', name: 'a', style: {}, children: ['w1', 'w2', 'w3'] } },
        widgets: {
            w1: { id: 'w1', name: 'one', style: {} },
            w2: { id: 'w2', name: 'two', style: { display: 'none' } },
            w3: { id: 'w3', name: 'three', style: {} }
        },
        groups: { g1: { id: 'g1', name: 'g', children: ['w1', 'w2', 'w3'] } }
    }
    if (opts.duration != null) {
        model.widgets.w1.props = { duration: opts.duration }
    }

    const typed = []
    const rendered = []
    const events = []

    const boxWidget = (id) => ({ id: id, _isPureDom: true })

    const renderFactory = {
        /**
         * The wrong accessor answers "no widget" for a pure DOM one. Left in
         * place so a regression to it fails a test rather than passing quietly.
         */
        getUIWidgetByID: (id) => {
            if (Object.prototype.hasOwnProperty.call(labels, id)) {
                return { id: id, getValue: () => labels[id] }
            }
            return live.indexOf(id) >= 0 ? { id: id } : null
        },
        getAnimationWrapper: (id) => {
            if (Object.prototype.hasOwnProperty.call(labels, id)) {
                return {
                    id: id,
                    getValue: () => labels[id],
                    startChatAnimation: (txt, duration, delay) => typed.push({ id: id, txt, duration, delay })
                }
            }
            if (boxes.indexOf(id) >= 0) {
                return boxWidget(id)
            }
            return live.indexOf(id) >= 0 ? { id: id } : null
        },
        updateWidget: (element) => rendered.push(element.id)
    }

    const animationFactory = {
        createWidgetAnimation: (widget, event) => {
            events.push({ widget: widget.id, event: event })
            let endCallback = null
            return {
                run: () => { if (opts.autoEnd) { if (endCallback) endCallback() } },
                onEnd: (fct) => { endCallback = fct }
            }
        }
    }

    return { model, renderFactory, animationFactory, rendered, events, typed }
}

describe('ScriptAnimations.isScriptAnimation', () => {
    test('claims both animation delta types', () => {
        expect(ScriptAnimations.isScriptAnimation({ type: 'WidgetAnimation' })).toBe(true)
        expect(ScriptAnimations.isScriptAnimation({ type: 'GroupAnimation' })).toBe(true)
    })

    /**
     * Everything else has to reach ScriptToModel, which merges it into the model.
     * Misrouting a style delta would silently stop setting styles.
     */
    test('leaves the ordinary style and prop deltas alone', () => {
        expect(ScriptAnimations.isScriptAnimation({ type: 'Widget', key: 'style' })).toBe(false)
        expect(ScriptAnimations.isScriptAnimation({ type: 'Widget', key: 'props' })).toBe(false)
        expect(ScriptAnimations.isScriptAnimation({ type: 'Screen', key: 'style' })).toBe(false)
    })
})

describe('ScriptAnimations widget fades', () => {

    /**
     * An element that is still display:none has no box, so there is nothing to
     * fade. The display write has to land first and it has to be synchronous.
     */
    test('fadeIn writes display before it starts the tween', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        const order = []
        h.renderFactory.updateWidget = (element) => {
            order.push('display:' + element.style.display)
        }
        h.animationFactory.createWidgetAnimation = () => ({
            run: () => order.push('tween'),
            onEnd: () => {}
        })

        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 })

        expect(order).toEqual(['display:block', 'tween'])
    })

    /**
     * opacity:0 in the model would re-hide the element on every re-render, since
     * _set_opacity adds MatcHidden, which is display:none, at exactly zero.
     */
    test('fadeIn never puts opacity in the model', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 })
        expect(h.model.widgets.w1.style).toEqual({ display: 'block' })
    })

    /**
     * RenderFactory.createWidgetAnimation overwrites from.style with the widget's
     * current animated style, and Animation fills an unspecified value in from
     * _defaultAnimValues, where opacity is 1. A fade in then interpolates 1 to 1
     * and does nothing, with no error anywhere.
     */
    test('fadeIn asks for an explicit from of zero', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 })
        expect(h.events[0].event.from.style).toEqual({ opacity: 0 })
        expect(h.events[0].event.to.style).toEqual({ opacity: 1 })
    })

    test('fadeOut asks for an explicit from of one', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeOut', duration: 300 })
        expect(h.events[0].event.from.style).toEqual({ opacity: 1 })
        expect(h.events[0].event.to.style).toEqual({ opacity: 0 })
    })

    /**
     * _set_opacity adds MatcHidden on the last frame, when the interpolated
     * value reaches exactly 0, so the element is already display:none. The model
     * catches up in onEnd, which is what isHidden() and toggle() read.
     */
    test('fadeOut hides the element only once the tween has ended', () => {
        const h = harness({ live: ['w1'] })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeOut', duration: 300 })
        expect(h.model.widgets.w1.style.display).toBeUndefined()
    })

    test('fadeOut hides the element in onEnd', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeOut', duration: 300 })
        expect(h.model.widgets.w1.style.display).toBe('none')
    })

    /**
     * The duration has to arrive as a number. Animation.defaultAnimationDuration
     * is read but never assigned, so an undefined duration makes run() take its
     * zero branch and render the end value in a single frame, which looks
     * exactly like no animation at all.
     */
    test('the duration reaches the animation as a number', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 450 })
        expect(h.events[0].event.duration).toBe(450)
    })

    test('a widget that is not on the current screen still ends up visible', () => {
        const h = harness({ live: [] })
        const scheduled = ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 })
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(scheduled[0].animated).toBe(false)
        expect(h.events.length).toBe(0)
    })

    test('a widget that is not on the current screen still ends up hidden', () => {
        const h = harness({ live: [] })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeOut', duration: 300 })
        expect(h.model.widgets.w1.style.display).toBe('none')
    })

    test('an unknown animation animates nothing', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        const scheduled = ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'zoomIn', duration: 300 })
        expect(scheduled).toEqual([])
    })
})

describe('ScriptAnimations group animations', () => {

    function reveal(h, step) {
        return ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: step })
    }

    /**
     * The regression that made the first version of this snap instead of fading:
     * the group path passed the duration straight through as undefined.
     */
    test('a reveal fades each child rather than snapping it in', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        reveal(h, 60)
        h.events.forEach(e => {
            expect(typeof e.event.duration).toBe('number')
            expect(e.event.duration).toBe(300)
        })
    })

    test('a reveal fades every child in', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        const scheduled = reveal(h, 60)
        expect(scheduled.map(s => s.id)).toEqual(['w1', 'w2', 'w3'])
        expect(scheduled.every(s => s.animation === 'fadeIn')).toBe(true)
    })

    test('a reveal staggers by index times the step', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        reveal(h, 80)
        expect(h.events.map(e => e.event.delay)).toEqual([0, 80, 160])
    })

    test('a reveal keeps the model order, not the live order', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        reveal(h, 60)
        expect(h.events.map(e => e.widget)).toEqual(['w1', 'w2', 'w3'])
    })

    test('a reveal makes every child visible', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        reveal(h, 60)
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(h.model.widgets.w2.style.display).toBe('block')
        expect(h.model.widgets.w3.style.display).toBe('block')
    })

    test('a group fadeIn is a reveal with no stagger', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'fadeIn', duration: 250, step: 60 })
        expect(h.events.map(e => e.event.delay)).toEqual([0, 0, 0])
        expect(h.events.map(e => e.event.duration)).toEqual([250, 250, 250])
        expect(h.model.widgets.w2.style.display).toBe('block')
    })

    test('a group fadeOut fades every child down and then hides them', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'fadeOut', duration: 300, step: 60 })
        expect(h.events.map(e => e.event.to.style)).toEqual([{ opacity: 0 }, { opacity: 0 }, { opacity: 0 }])
        expect(h.model.widgets.w1.style.display).toBe('none')
        expect(h.model.widgets.w2.style.display).toBe('none')
        expect(h.model.widgets.w3.style.display).toBe('none')
    })

    /**
     * Only the rendered screen is live, so the children that are not up fall
     * back to the instant change. A reveal that quietly did nothing for half the
     * group would look broken rather than skipped.
     */
    test('children that are not on the current screen still get shown', () => {
        const h = harness({ live: ['w2'], autoEnd: true })
        const scheduled = reveal(h, 60)
        expect(scheduled.map(s => s.id)).toEqual(['w2'])
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(h.model.widgets.w3.style.display).toBe('block')
    })

    test('children that are not on the current screen still get hidden on fadeOut', () => {
        const h = harness({ live: ['w2'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'fadeOut', duration: 300, step: 60 })
        expect(h.model.widgets.w1.style.display).toBe('none')
        expect(h.model.widgets.w3.style.display).toBe('none')
    })

describe('ScriptAnimations pure DOM widgets', () => {

    /**
     * RenderFactory keeps two registries. Class based widgets (Label, TextBox)
     * are in _uiWidgets; the pure DOM ones (Box, Button, Image, Icon) only ever
     * get a div in _widgetNodes. getUIWidgetByID answers "no widget" for a Box,
     * so using it here made every pure DOM element look like it was on another
     * screen: it got the instant display write, a warning, and no fade at all.
     */
    test('a pure DOM widget fades in', () => {
        const h = harness({ boxes: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 })
        expect(h.events.length).toBe(1)
        expect(h.events[0].widget).toBe('w1')
        expect(h.events[0].event.from.style).toEqual({ opacity: 0 })
        expect(h.model.widgets.w1.style.display).toBe('block')
    })

    test('a pure DOM widget fades out and is only hidden at the end', () => {
        const h = harness({ boxes: ['w1'] })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeOut', duration: 300 })
        expect(h.events.length).toBe(1)
        expect(h.model.widgets.w1.style.display).toBeUndefined()
    })

    test('a pure DOM widget is not reported as being on another screen', () => {
        const h = harness({ boxes: ['w1', 'w2'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 })
        /**
         * w3 is genuinely not rendered. w1 and w2 are, and were being lumped in
         * with it.
         */
        expect(h.events.map(e => e.widget)).toEqual(['w1', 'w2'])
    })

    test('a pure DOM widget is staggered like any other', () => {
        const h = harness({ boxes: ['w1', 'w2'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 })
        expect(h.events.map(e => e.event.delay)).toEqual([0, 60])
    })

    /**
     * A synthesised UIWidget wrapper has no startChatAnimation, so a typewriter
     * has to fall through to fadeIn for a Box rather than trying to type it.
     */
    test('a typewriter fades a pure DOM widget instead of typing it', () => {
        const h = harness({ boxes: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'typewriter', duration: 300 })
        expect(h.typed.length).toBe(0)
        expect(h.events.length).toBe(1)
        expect(h.events[0].event.to.style).toEqual({ opacity: 1 })
    })

    test('a group of a label and a box types the label and fades the box', () => {
        const h = harness({ live: ['w2'], boxes: ['w3'], labels: { w1: 'Hello' }, autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'typewriter', duration: 300, step: 80 })
        expect(h.typed.map(t => t.id)).toEqual(['w1'])
        expect(h.events.map(e => e.widget)).toEqual(['w2', 'w3'])
        expect(h.typed[0].delay).toBe(0)
        expect(h.events.map(e => e.event.delay)).toEqual([80, 160])
    })

    /**
     * The fallback is for a widget that really is on another screen, which
     * clearUiWidgets empties all three registries for.
     */
    test('a widget with no wrapper at all still gets the instant change', () => {
        const h = harness({ live: ['w2'], autoEnd: true })
        ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 })
        expect(h.events.map(e => e.widget)).toEqual(['w2'])
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(h.model.widgets.w3.style.display).toBe('block')
    })
})

describe('ScriptAnimations typewriter', () => {

    function typewriterGroup(h, step) {
        return ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'g1', animation: 'typewriter', duration: 300, step: step })
    }

    /**
     * A label types, everything else fades. Detected by capability, so a widget
     * that gains a text animation later joins without another branch here.
     */
    test('a group typewriter types the labels and fades the rest', () => {
        const h = harness({ live: ['w2', 'w3'], labels: { w1: 'Hello' }, autoEnd: true })
        typewriterGroup(h, 60)
        expect(h.typed.map(t => t.id)).toEqual(['w1'])
        expect(h.events.map(e => e.widget)).toEqual(['w2', 'w3'])
    })

    /**
     * The text is whatever the label currently shows, so a label bound to a
     * value types that value rather than the literal text authored in the
     * designer. The typing has to be over the text it is actually typing.
     */
    test('it types the text the label currently holds', () => {
        const h = harness({ live: ['w2', 'w3'], labels: { w1: 'the reply' }, autoEnd: true })
        typewriterGroup(h, 60)
        expect(h.typed[0].txt).toBe('the reply')
    })

    test('it staggers labels and non labels alike', () => {
        const h = harness({ live: ['w2', 'w3'], labels: { w1: 'Hi' }, autoEnd: true })
        typewriterGroup(h, 100)
        expect(h.typed[0].delay).toBe(0)
        expect(h.events.map(e => e.event.delay)).toEqual([100, 200])
    })

    /**
     * One duration has to mean the same wall clock time for the typing and for
     * the fade, so the script's duration wins over the label's own setting. The
     * label is given a rate rather than a time because a rate depends on how
     * much there is to type, so it is converted here.
     */
    test('the script duration reaches the typing as a converted rate', () => {
        const h = harness({ live: ['w2'], labels: { w1: 'abcdefghij' }, autoEnd: true })
        typewriterGroup(h, 60)
        /**
         * 10 characters over 300ms is 18 frames, which at 10 frames per
         * character means a rate of 10 * 10 / 18.
         */
        expect(h.typed[0].duration).toBeCloseTo(10 * 10 / 18, 5)
    })

    test('the script duration overrides a duration on the label', () => {
        const h = harness({ live: ['w2'], labels: { w1: 'Hi' }, duration: 99, autoEnd: true })
        typewriterGroup(h, 60)
        /**
         * Nothing like 99, which is the label's own frame based rate. The script
         * asked for 300ms over 2 characters.
         */
        expect(h.typed[0].duration).not.toBe(99)
        expect(h.typed[0].duration).toBeCloseTo(2 * 10 / (300 * 0.06), 5)
    })

    test('a label with no duration of its own still gets a usable one', () => {
        const h = harness({ live: ['w2'], labels: { w1: 'Hi' }, autoEnd: true })
        typewriterGroup(h, 60)
        expect(typeof h.typed[0].duration).toBe('number')
        expect(h.typed[0].duration).toBeGreaterThan(0)
    })

    test('the same duration drives the typing and the fade', () => {
        const h = harness({ live: ['w2'], labels: { w1: 'Hi' }, autoEnd: true })
        typewriterGroup(h, 60)
        expect(h.events[0].event.duration).toBe(300)
        /**
         * 300ms of typing for 2 characters, so the rate has to be high.
         */
        expect(h.typed[0].duration).toBeGreaterThan(1)
    })

    /**
     * The rate depends on the length, so the conversion has to see the text it is
     * about to type rather than a length passed in separately. Both land on the
     * same number of frames, which is what makes one duration mean one wall
     * clock time whether the answer is twenty characters or two thousand.
     */
    test('a longer label gets a higher rate for the same duration', () => {
        const short = harness({ live: [], labels: { w1: 'ab' }, autoEnd: true })
        typewriterGroup(short, 60)
        const long = harness({ live: [], labels: { w1: 'a'.repeat(100) }, autoEnd: true })
        typewriterGroup(long, 60)
        expect(long.typed[0].duration).toBeGreaterThan(short.typed[0].duration)
        /**
         * Twice the length is twice the rate, since the frame count is fixed.
         */
        expect(long.typed[0].duration / short.typed[0].duration).toBeCloseTo(50, 5)
    })

    /**
     * A label that is display:none has no box, so there is nothing to type into
     * either. Same first step as a fade in.
     */
    test('it makes the label visible before typing it', () => {
        const h = harness({ live: ['w2'], labels: { w1: 'Hi' }, autoEnd: true })
        h.model.widgets.w1.style.display = 'none'
        typewriterGroup(h, 60)
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(h.typed.length).toBe(1)
    })

    test('a label that is not on the current screen is just shown', () => {
        const h = harness({ live: ['w2'], autoEnd: true })
        const scheduled = typewriterGroup(h, 60)
        expect(scheduled.filter(s => s.typed)).toEqual([])
        expect(h.model.widgets.w1.style.display).toBe('block')
        expect(h.model.widgets.w3.style.display).toBe('block')
    })

    test('a group of only labels types them all', () => {
        const h = harness({ live: [], labels: { w1: 'a', w2: 'b', w3: 'c' }, autoEnd: true })
        typewriterGroup(h, 60)
        expect(h.typed.map(t => t.id)).toEqual(['w1', 'w2', 'w3'])
        expect(h.events.length).toBe(0)
    })

    test('a group with no labels is just a reveal', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        typewriterGroup(h, 60)
        expect(h.typed.length).toBe(0)
        expect(h.events.map(e => e.event.delay)).toEqual([0, 60, 120])
    })
})

describe('ScriptAnimations single element typewriter', () => {

    test('a label types with no stagger', () => {
        const h = harness({ labels: { w1: 'Hello' }, autoEnd: true })
        const scheduled = ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'typewriter', duration: 300 })
        /**
         * Five characters over 300ms is 18 frames, so a rate of 5 * 10 / 18.
         */
        expect(h.typed).toEqual([{ id: 'w1', txt: 'Hello', duration: 5 * 10 / 18, delay: 0 }])
        expect(scheduled[0].typed).toBe(true)
    })

    test('anything else falls back to fadeIn', () => {
        const h = harness({ live: ['w1'], autoEnd: true })
        ScriptAnimations.applyWidgetAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'WidgetAnimation', id: 'w1', animation: 'typewriter', duration: 300 })
        expect(h.typed.length).toBe(0)
        expect(h.events[0].event.from.style).toEqual({ opacity: 0 })
        expect(h.events[0].event.to.style).toEqual({ opacity: 1 })
        expect(h.model.widgets.w1.style.display).toBe('block')
    })
})

    test('an unknown group animates nothing', () => {
        const h = harness({ live: ['w1', 'w2', 'w3'], autoEnd: true })
        const scheduled = ScriptAnimations.applyGroupAnimation(h.model, h.renderFactory, h.animationFactory,
            { type: 'GroupAnimation', id: 'nope', animation: 'reveal', duration: 300, step: 60 })
        expect(scheduled).toEqual([])
    })
})
