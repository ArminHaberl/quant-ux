import {
    getEventAnimations,
    expandAnimations,
    getFrameStyle,
    getEndStyle
} from '../../src/core/engines/ScriptAnimationReplay'
import { applyGroupAnimation } from '../../src/core/engines/ScriptAnimations'

/**
 * The player cannot be mounted by this jest config (no vue-jest transform), so
 * everything below drives the module the player drives: given the event it
 * recorded and the model it renders, what style belongs in which slot.
 */
function createModel () {
    return {
        screens: { s1: { id: 's1', name: 'a', style: {}, children: ['w1', 'w2', 'w3'] } },
        widgets: {
            w1: { id: 'w1', name: 'one', style: {} },
            w2: { id: 'w2', name: 'two', style: { display: 'none' } },
            w3: { id: 'w3', name: 'three', style: { background: '#FF0000' } }
        },
        groups: {
            g1: { id: 'g1', name: 'g', children: ['w1', 'w2', 'w3'] },
            g2: { id: 'g2', name: 'sub', children: ['w3'] },
            g3: { id: 'g3', name: 'outer', children: ['w1'], groups: ['g2'] },
            gone: { id: 'gone', name: 'gone', children: ['nope'] }
        }
    }
}

/**
 * Put the children on the canvas. createModel() leaves them off it, so that the
 * tests which do not care about the order keep the declaration order.
 */
function placeChildren (model, positions) {
    Object.keys(positions).forEach(id => {
        model.widgets[id].x = positions[id].x
        model.widgets[id].y = positions[id].y
    })
}

/**
 * The bare minimum applyGroupAnimation() needs: an animation wrapper for every
 * widget on the rendered screen, and a factory that hands back a tween.
 */
function liveRenderFactory (model) {
    return {
        getAnimationWrapper: id => (model.widgets[id] ? { id: id } : null),
        updateWidget: () => {}
    }
}

function liveAnimationFactory () {
    return {
        createWidgetAnimation: (widget, event) => ({ run: () => {}, onEnd: () => {} })
    }
}

function scriptEvent (animations) {
    return {
        type: 'ScriptEffect',
        id: 'e1',
        state: { type: 'script', value: { dataChanges: [], widgetChanges: [], animations: animations } }
    }
}

describe('ScriptAnimationReplay.getEventAnimations', () => {

    /**
     * Readings made before animations were recorded carry no field at all.
     * They have to replay exactly as they did before this module existed
     * rather than throw on the way in.
     */
    test('a recording without an animations field animates nothing', () => {
        const event = {
            type: 'ScriptEffect',
            id: 'e1',
            state: { type: 'script', value: { dataChanges: [], widgetChanges: [{ id: 'w1', key: 'style', value: {} }] } }
        }
        expect(getEventAnimations(event)).toEqual([])
    })

    test('an event of another kind is not looked at', () => {
        expect(getEventAnimations({ type: 'WidgetClick', state: { type: 'script', value: { animations: [{}] } } })).toEqual([])
        expect(getEventAnimations({ type: 'ScreenLoaded' })).toEqual([])
        expect(getEventAnimations(null)).toEqual([])
    })

    test('a script state without a value animates nothing', () => {
        expect(getEventAnimations({ type: 'ScriptEffect', state: { type: 'script' } })).toEqual([])
        expect(getEventAnimations({ type: 'ScriptEffect', state: { type: 'value', value: { animations: [{}] } } })).toEqual([])
    })

    test('a malformed field animates nothing', () => {
        expect(getEventAnimations({ type: 'ScriptEffect', state: { type: 'script', value: { animations: 'fadeIn' } } })).toEqual([])
    })

    test('the recorded animations are handed back as they were stored', () => {
        const animations = [{ type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 }]
        expect(getEventAnimations(scriptEvent(animations))).toEqual(animations)
    })
})

describe('ScriptAnimationReplay.expandAnimations', () => {

    test('no animations expand to no schedules', () => {
        expect(expandAnimations(createModel(), undefined)).toEqual([])
        expect(expandAnimations(createModel(), [])).toEqual([])
    })

    test('a widget animation becomes one schedule with no delay', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 300 }
        ])
        expect(schedules).toEqual([{ id: 'w1', animation: 'fadeIn', duration: 300, delay: 0 }])
    })

    /**
     * The group is fanned out in the model's declaration order, which is what
     * applyGroupAnimation() animates, so the frames land on the same widgets
     * the live run moved and in the same order.
     */
    test('a group reveal is fanned out and staggered by index times step', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w2', 'w3'])
        expect(schedules.map(s => s.delay)).toEqual([0, 60, 120])
        expect(schedules.every(s => s.duration === 300)).toBe(true)
    })

    test('a group typewriter staggers like a reveal', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'typewriter', duration: 300, step: 80 }
        ])
        expect(schedules.map(s => s.delay)).toEqual([0, 80, 160])
    })

    test('a group fade has no stagger', () => {
        const fadeIn = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'fadeIn', duration: 250, step: 60 }
        ])
        const fadeOut = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'fadeOut', duration: 250, step: 60 }
        ])
        expect(fadeIn.map(s => s.delay)).toEqual([0, 0, 0])
        expect(fadeOut.map(s => s.delay)).toEqual([0, 0, 0])
    })

    /**
     * A child that is not in the model is dropped, but it still occupies its
     * place in the count. Shifting the index would silently retime every
     * widget after it, and the recorded display changes and the frames would
     * no longer line up.
     */
    test('a child that is missing keeps its place in the stagger', () => {
        const model = createModel()
        model.groups.g1.children = ['w1', 'nope', 'w3']
        const schedules = expandAnimations(model, [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w3'])
        expect(schedules.map(s => s.delay)).toEqual([0, 120])
    })

    test('sub group children are fanned out too', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g3', animation: 'reveal', duration: 300, step: 60 }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w3'])
        expect(schedules.map(s => s.delay)).toEqual([0, 60])
    })

    /**
     * The original defect: QGroup.animate() did not record an order, so
     * expandAnimations() resolved the children in the declaration order of
     * model.groups[id].children and every recording made before the order was
     * added would silently switch to the screen order the API now defaults to.
     * A recording has to keep the order it was made with.
     */
    test('a recording without an order replays in the declaration order', () => {
        const model = createModel()
        placeChildren(model, { w1: { x: 0, y: 300 }, w2: { x: 0, y: 100 }, w3: { x: 0, y: 200 } })
        const schedules = expandAnimations(model, [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60 }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w2', 'w3'])
        expect(schedules.map(s => s.delay)).toEqual([0, 60, 120])
    })

    test('a recording with the screen order replays top to bottom', () => {
        const model = createModel()
        placeChildren(model, { w1: { x: 0, y: 300 }, w2: { x: 0, y: 100 }, w3: { x: 0, y: 200 } })
        const schedules = expandAnimations(model, [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60, order: 'screen' }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w2', 'w3', 'w1'])
        expect(schedules.map(s => s.delay)).toEqual([0, 60, 120])
    })

    test('a recording asked for the model order keeps the declaration order', () => {
        const model = createModel()
        placeChildren(model, { w1: { x: 0, y: 300 }, w2: { x: 0, y: 100 }, w3: { x: 0, y: 200 } })
        const schedules = expandAnimations(model, [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 60, order: 'model' }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w2', 'w3'])
    })

    /**
     * The live run and the replay are two implementations of one fan out. If
     * they ever disagree about the delays, the recording plays back a sequence
     * that never happened, so they are compared against each other here rather
     * than each being pinned on its own.
     */
    test('the replay and the live run schedule the same delays', () => {
        const model = createModel()
        placeChildren(model, { w1: { x: 30, y: 300 }, w2: { x: 0, y: 100 }, w3: { x: 10, y: 200 } })
        const delta = { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 70, order: 'screen' }

        const scheduled = applyGroupAnimation(model, liveRenderFactory(model), liveAnimationFactory(), delta)
        const replayed = expandAnimations(model, [delta])

        expect(replayed.map(s => [s.id, s.delay])).toEqual(scheduled.map(s => [s.id, s.delay]))
    })

    /**
     * applyWidgetAnimation() refuses to run an animation it does not know, so
     * a replay that faded anyway would show something the live run never did.
     */
    test('an unknown widget animation is skipped', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'WidgetAnimation', id: 'w1', animation: 'zoomIn', duration: 300 }
        ])
        expect(schedules).toEqual([])
    })

    /**
     * applyGroupAnimation() has no such refusal: anything that is not a fadeOut
     * or a staggered animation ends up in its fadeIn branch. The replay has to
     * make the same call, or a group animation from a newer API would play back
     * as nothing at all.
     */
    test('an unknown group animation falls back to a fade like the live run', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'wobble', duration: 300, step: 60 }
        ])
        expect(schedules.map(s => s.id)).toEqual(['w1', 'w2', 'w3'])
        expect(schedules.map(s => s.delay)).toEqual([0, 0, 0])
    })

    test('a group that does not exist animates nothing', () => {
        expect(expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'nope', animation: 'reveal', duration: 300, step: 60 }
        ])).toEqual([])
    })

    test('a widget that does not exist animates nothing', () => {
        expect(expandAnimations(createModel(), [
            { type: 'WidgetAnimation', id: 'nope', animation: 'fadeIn', duration: 300 }
        ])).toEqual([])
    })

    test('a delta of another kind animates nothing', () => {
        expect(expandAnimations(createModel(), [
            { type: 'Widget', id: 'w1', key: 'style', style: {} }
        ])).toEqual([])
    })

    /**
     * The API writes both fields, but a hand written or truncated event must
     * not produce NaN delays or a division by zero in the frame maths.
     */
    test('a duration of zero lands on the end value at once', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn' }
        ])
        expect(schedules[0].duration).toBe(0)
        expect(getFrameStyle(0, schedules[0], {})).toEqual({ display: 'block', opacity: 1 })
    })

    test('a missing step staggers nothing instead of producing NaN', () => {
        const schedules = expandAnimations(createModel(), [
            { type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300 }
        ])
        expect(schedules.map(s => s.delay)).toEqual([0, 0, 0])
    })
})

describe('ScriptAnimationReplay.getFrameStyle', () => {

    const orgStyle = { background: '#FF0000' }

    test('a fade in starts invisible and becomes visible', () => {
        const schedule = { id: 'w1', animation: 'fadeIn', duration: 300, delay: 0 }
        expect(getFrameStyle(0, schedule, orgStyle)).toEqual({ background: '#FF0000', display: 'block', opacity: 0 })
        expect(getFrameStyle(150, schedule, orgStyle).opacity).toBeCloseTo(0.5, 5)
        expect(getFrameStyle(300, schedule, orgStyle).opacity).toBe(1)
        expect(getFrameStyle(900, schedule, orgStyle).opacity).toBe(1)
    })

    /**
     * display:block has to be on every frame, not only the first: the recorded
     * widgetChange of a fadeOut says display:none from the event that
     * triggered it, and it is applied to the DOM before these frames are.
     */
    test('a fade out stays visible until it has faded', () => {
        const schedule = { id: 'w1', animation: 'fadeOut', duration: 300, delay: 0 }
        expect(getFrameStyle(0, schedule, orgStyle).display).toBe('block')
        expect(getFrameStyle(150, schedule, orgStyle).display).toBe('block')
        expect(getFrameStyle(150, schedule, orgStyle).opacity).toBeCloseTo(0.5, 5)
    })

    test('a fade out hides the widget once it has faded', () => {
        const schedule = { id: 'w1', animation: 'fadeOut', duration: 300, delay: 0 }
        expect(getFrameStyle(300, schedule, orgStyle)).toEqual({ background: '#FF0000', display: 'none', opacity: 0 })
        expect(getFrameStyle(6000, schedule, orgStyle).display).toBe('none')
    })

    /**
     * A widget that is faded in was often display:none to begin with, and
     * nothing else in the frame would override that: the style is merged over
     * the widget's own style, so display has to be written explicitly.
     */
    test('a fade in makes a hidden widget visible', () => {
        const schedule = { id: 'w2', animation: 'fadeIn', duration: 300, delay: 0 }
        const style = getFrameStyle(0, schedule, { display: 'none' })
        expect(style.display).toBe('block')
        expect(style.opacity).toBe(0)
    })

    test('a delay holds the widget at the start of the animation', () => {
        const schedule = { id: 'w1', animation: 'fadeIn', duration: 300, delay: 120 }
        expect(getFrameStyle(0, schedule, orgStyle).opacity).toBe(0)
        expect(getFrameStyle(120, schedule, orgStyle).opacity).toBe(0)
        expect(getFrameStyle(270, schedule, orgStyle).opacity).toBeCloseTo(0.5, 5)
        expect(getFrameStyle(420, schedule, orgStyle).opacity).toBe(1)
    })

    test('every frame carries an opacity, whatever the widget started with', () => {
        const schedules = [
            { id: 'w1', animation: 'fadeIn', duration: 300, delay: 0 },
            { id: 'w1', animation: 'fadeOut', duration: 300, delay: 0 },
            { id: 'w1', animation: 'typewriter', duration: 300, delay: 0 },
            { id: 'w1', animation: 'reveal', duration: 300, delay: 0 }
        ]
        schedules.forEach(schedule => {
            [0, 150, 300, 900].forEach(elapsed => {
                const style = getFrameStyle(elapsed, schedule, {})
                expect(typeof style.opacity).toBe('number')
            })
        })
    })

    /**
     * The player fills the gaps of a recorded Animation event from the last
     * state. This module cannot: each frame stands on its own, so it has to
     * carry the widget's own style with it or a fade would strip the widget
     * down to an opacity.
     */
    test('the widget style is merged under the animated keys', () => {
        const schedule = { id: 'w3', animation: 'fadeIn', duration: 300, delay: 0 }
        expect(getFrameStyle(150, schedule, { background: '#FF0000', borderTopColor: 'red' })).toEqual({
            background: '#FF0000',
            borderTopColor: 'red',
            display: 'block',
            opacity: 0.5
        })
    })

    test('a typewriter fades like the widgets that cannot type', () => {
        const schedule = { id: 'w1', animation: 'typewriter', duration: 300, delay: 0 }
        expect(getFrameStyle(150, schedule, orgStyle)).toEqual(getFrameStyle(150, {
            id: 'w1', animation: 'fadeIn', duration: 300, delay: 0
        }, orgStyle))
    })
})

describe('ScriptAnimationReplay.getEndStyle', () => {

    test('a fade in ends visible', () => {
        const style = getEndStyle({ id: 'w1', animation: 'fadeIn', duration: 300, delay: 60 }, { display: 'none' })
        expect(style).toEqual({ display: 'block', opacity: 1 })
    })

    test('a fade out ends hidden', () => {
        const style = getEndStyle({ id: 'w1', animation: 'fadeOut', duration: 300, delay: 0 }, {})
        expect(style).toEqual({ display: 'none', opacity: 0 })
    })

    test('the end style is the frame at the end of the animation', () => {
        const schedule = { id: 'w1', animation: 'fadeOut', duration: 300, delay: 60 }
        const orgStyle = { background: '#FF0000' }
        expect(getEndStyle(schedule, orgStyle)).toEqual(getFrameStyle(360, schedule, orgStyle))
    })

    test('a zero duration ends on the end value', () => {
        expect(getEndStyle({ id: 'w1', animation: 'fadeIn', duration: 0, delay: 0 }, {})).toEqual({ display: 'block', opacity: 1 })
        expect(getEndStyle({ id: 'w1', animation: 'fadeOut', duration: 0, delay: 0 }, {})).toEqual({ display: 'none', opacity: 0 })
    })
})
