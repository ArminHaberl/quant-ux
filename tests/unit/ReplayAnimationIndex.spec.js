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
