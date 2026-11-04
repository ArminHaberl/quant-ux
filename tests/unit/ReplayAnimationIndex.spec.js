import ReplayAnimationIndex from '../../src/core/engines/ReplayAnimationIndex'

const factory = {
    getP: (t, delay, duration) => t > delay ? Math.min(1, (t - delay) / duration) : 0,
    getAnimationMixedStyle: (from, to, p) => ({ opacity: from.opacity + (to.opacity - from.opacity) * p }),
    getAnimationMixedPos: (from, to, p) => ({ x: from.x + (to.x - from.x) * p })
}
const model = { widgets: { w: { style: { opacity: 1 } } }, groups: {} }

/** The old player allocated an animation slot every 30ms for the entire session. */
test('long idle time uses sparse intervals and a normal animation can be scrubbed', async () => {
    const events = [{ type: 'Animation', time: 60000, screen: 's', animation: {
        id: 'w', duration: 300, from: { style: { opacity: 1 } }, to: { style: { opacity: 0 } }
    } }]
    const index = new ReplayAnimationIndex(events, model, 0, 86400000, factory, (s, p) => p)
    await index.build()
    expect(index.widgets.w.styles.length).toBe(3)
    expect(index.get(0).w.style.opacity).toBe(1)
    expect(index.get(60150).w.style.opacity).toBeCloseTo(0.5)
    expect(index.get(60300).w.style.opacity).toBe(0)
    expect(index.get(60400).w.style.opacity).toBe(1)
    expect(index.get(60000).w.style.opacity).toBe(1)
})

/** Script fades persist after ending but a later screen load resets the style. */
test('script animations persist, reset and seek backwards', async () => {
    const events = [
        { id: 'e', type: 'ScriptEffect', time: 300, state: { type: 'script', value: { animations: [
            { type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 }
        ] } } },
        { type: 'ScreenLoaded', time: 1200 }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 86400000, factory, (s, p) => p)
    await index.build()
    expect(index.get(450).w.style.opacity).toBeCloseTo(0.5)
    expect(index.get(900).w.style.display).toBe('none')
    expect(index.get(1200).w.style.opacity).toBe(1)
    expect(index.get(900).w.style.display).toBe('none')
    expect(index.get(0).w.style.opacity).toBe(1)
})

/** A later widget animation must temporarily override a persistent script fade. */
test('overlapping animations restore the earlier style and position after seeking', async () => {
    const events = [
        { id: 'fade', type: 'ScriptEffect', time: 0, state: { type: 'script', value: { animations: [
            { type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 }
        ] } } },
        { type: 'Animation', time: 600, screen: 's', animation: {
            id: 'w', duration: 300,
            from: { style: { opacity: 0 }, pos: { x: 0 } },
            to: { style: { opacity: 1 }, pos: { x: 100 } }
        } }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 3600000, factory, (s, p) => p)
    await index.build()
    expect(index.get(750).w.style.opacity).toBeCloseTo(0.5)
    expect(index.get(750).w.pos.x).toBe(50)
    expect(index.get(990).w.style.display).toBe('none')
    expect(index.get(990).w.pos._org).toBe(true)
    expect(index.get(750).w.pos.x).toBe(50)
})

/** A reload while a script fade was delayed used to show its starting frame again. */
test('resume snaps a delayed script animation to its final frame while preserving the reload gap', async () => {
    const events = [
        { id: 'fade', type: 'ScriptEffect', time: 0, state: { type: 'script', value: { animations: [
            { type: 'WidgetAnimation', id: 'w', animation: 'fadeIn', delay: 6000, duration: 300 }
        ] } } },
        { type: 'SessionReload', time: 300, state: { type: 'resume', value: {} } },
        { type: 'SessionResume', time: 3000, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: 1, finishText: false }],
            scriptChanges: [{ id: 'w', key: 'style', value: { display: 'block' } }]
        } } }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 10000, factory, (s, p) => p)
    await index.build()
    expect(index.get(300).w.style.opacity).toBe(0)
    expect(index.get(3000).w.style.opacity).toBe(1)
    expect(index.get(3000).w.style.display).toBe('block')
    expect(index.get(9000).w.style.opacity).toBe(1)
    expect(index.get(300).w.style.opacity).toBe(0)
})

/** A show after a fade must remain visible when the same session is restored. */
test('resume honours a later script style rather than the old animation', async () => {
    const events = [
        { type: 'ScriptEffect', time: 0, state: { type: 'script', value: { animations: [
            { type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 }
        ] } } },
        { type: 'SessionResume', time: 3000, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: null, finishText: false }],
            scriptChanges: [{ id: 'w', key: 'style', value: { display: 'block', opacity: 0.6 } }]
        } } }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 5000, factory, (s, p) => p)
    await index.build()
    expect(index.get(600).w.style.opacity).toBe(0)
    expect(index.get(3000).w.style.opacity).toBe(0.6)
    expect(index.get(3000).w.style.display).toBe('block')
    expect(index.get(600).w.style.opacity).toBe(0)
})

/** A later show without an explicit opacity must clear a previous fade-out. */
test('resume clears the old opacity when a script only writes display', async () => {
    const noOpacity = { widgets: { w: { style: {} } }, groups: {} }
    const events = [
        { type: 'ScriptEffect', time: 0, state: { type: 'script', value: { animations: [
            { type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 }
        ] } } },
        { type: 'SessionResume', time: 3000, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: null, finishText: false }],
            scriptChanges: [{ id: 'w', key: 'style', value: { display: 'block' } }]
        } } }
    ]
    const index = new ReplayAnimationIndex(events, noOpacity, 0, 5000, factory, (s, p) => p)
    await index.build()
    expect(index.get(600).w.style.opacity).toBe(0)
    expect(index.get(3000).w.style).toMatchObject({ display: 'block', opacity: 1 })
})

/** A script show after resuming must win even when the player is scrubbed directly to it. */
test('later script changes supersede restored animation styles and survive a screen load', async () => {
    const events = [
        { type: 'SessionResume', time: 300, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: 0, finishText: false }],
            scriptChanges: [{ id: 'w', key: 'style', value: { display: 'none' } }]
        } } },
        { type: 'ScriptEffect', time: 600, state: { type: 'script', value: { widgetChanges: [
            { id: 'w', key: 'style', value: { display: 'block', color: 'red' } }
        ] } } },
        { type: 'ScreenLoaded', time: 900 }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 2000, factory, (s, p) => p)
    await index.build()
    expect(index.get(300).w.style).toMatchObject({ display: 'none', opacity: 0 })
    expect(index.get(600).w.style).toMatchObject({ display: 'block', opacity: 1, color: 'red' })
    expect(index.get(900).w.style).toMatchObject({ display: 'block', opacity: 1, color: 'red' })
    expect(index.get(300).w.style).toMatchObject({ display: 'none', opacity: 0 })
})

/** A show following an animation in the same script must win after a resume. */
test('a later same-script visibility write wins over a new animation after reload', async () => {
    const events = [
        { type: 'SessionResume', time: 300, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: 1, finishText: false }], scriptChanges: []
        } } },
        { type: 'ScriptEffect', time: 600, state: { type: 'script', value: {
            widgetChanges: [
                { id: 'w', key: 'style', value: { display: 'none' } },
                { id: 'w', key: 'style', value: { display: 'block' } }
            ],
            animations: [{ type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 }]
        } } }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 2000, factory, (s, p) => p)
    await index.build()
    expect(index.get(600).w.style).toMatchObject({ display: 'block', opacity: 1 })
    expect(index.get(1200).w.style).toMatchObject({ display: 'block', opacity: 1 })
})

/** Multiple animations in one script must not lose a later hide after a reload. */
test('later writes after multiple same-script animations remain authoritative', async () => {
    const events = [
        { type: 'SessionResume', time: 300, state: { type: 'resume', value: {
            animationEffects: [{ id: 'w', opacity: 1, finishText: false }], scriptChanges: []
        } } },
        { type: 'ScriptEffect', time: 600, state: { type: 'script', value: {
            widgetChanges: [
                { id: 'w', key: 'style', value: { display: 'none' } },
                { id: 'w', key: 'style', value: { display: 'block' } },
                { id: 'w', key: 'style', value: { display: 'none' } }
            ],
            animations: [
                { type: 'WidgetAnimation', id: 'w', animation: 'fadeOut', duration: 300 },
                { type: 'WidgetAnimation', id: 'w', animation: 'fadeIn', duration: 300 }
            ]
        } } }
    ]
    const index = new ReplayAnimationIndex(events, model, 0, 2000, factory, (s, p) => p)
    await index.build()
    expect(index.get(600).w.style.display).toBe('none')
    expect(index.get(1200).w.style.display).toBe('none')
})
