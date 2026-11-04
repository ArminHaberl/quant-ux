import ReplayStateIndex, { replayFrameTime } from '../../src/core/engines/ReplayStateIndex'
import { buildEventStates } from '../../src/core/engines/ScriptStateReplay'

const copy = value => JSON.parse(JSON.stringify(value))

/** The player previously cloned the entire model state for every recorded event. */
test('bounded checkpoints reproduce the original projection during forward and backward seeks', async () => {
    const defaults = { s: {
        input: { type: 'text', value: '' },
        dropdown: { type: 'select', value: '' },
        a: { type: 'radiobox.checked', value: true },
        b: { type: 'radiobox.checked', value: false }
    } }
    const events = [
        { id: '0', type: 'ScreenLoaded', screen: 's' },
        { id: '1', type: 'ScriptEffect', state: { type: 'script', value: {
            dataChanges: [{ path: 'form.name', value: 'Ada' }],
            widgetChanges: [{ id: 'input', key: 'style', value: { color: 'red' } }]
        } } },
        { id: '2', type: 'WidgetChange', widget: 'input', state: { type: 'text', value: 'typed' } },
        { id: '3', type: 'WidgetClick', widget: 'dropdown', state: { type: 'open', value: '' } },
        { id: '4', type: 'WidgetChange', widget: 'b', state: { type: 'radiobox.checked', value: true } },
        { id: '5', type: 'OverlayLoaded', overlay: 'popup' },
        { id: '6', type: 'ScreenScroll', state: { type: 'scroll', value: 20, children: [{ time: 1, value: 10 }] } },
        { id: '7', type: 'OverlayRemoved', overlay: 'popup' },
        { id: '8', type: 'ScreenLoaded', screen: 's', scrollTop: 5 }
    ]
    const expected = buildEventStates(copy(events), copy(defaults))
    const index = new ReplayStateIndex(copy(events), copy(defaults))
    await index.build()
    for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 4, 1, 8, 6, 7]) {
        const actual = index.get(i)
        const id = String(i)
        expect(actual.widgetStates).toEqual(expected.widgetStates[id])
        expect(actual.valueStates).toEqual(expected.valueStates[id])
        expect(actual.effects).toEqual(expected.scriptEffects[id])
        expect(actual.data).toEqual(expected.scriptData[id])
        expect(actual.touched).toEqual(expected.touchedWidgets[id])
        expect(actual.userValues).toEqual(expected.userValues[id])
        expect(actual.overlays).toEqual(expected.overlayStates[id])
        expect(actual.scroll).toEqual(expected.scrollStates[id])
    }
})

/** Recordings of 2,000 events were rejected and every event held a full snapshot. */
test('large sessions have bounded checkpoints and retain their final state', async () => {
    const events = Array.from({ length: 10000 }, (_, i) => ({
        id: String(i), screen: 's', widget: 'input', type: 'WidgetChange',
        state: { type: 'text', value: i }
    }))
    const index = new ReplayStateIndex(events, { s: { input: { type: 'text', value: '' } } })
    await index.build()
    expect(index.checkpoints.length).toBeLessThanOrEqual(64)
    expect(index.get(9999).widgetStates.input.value).toBe(9999)
    expect(index.get(100).widgetStates.input.value).toBe(100)
    expect(index.get(9998).widgetStates.input.value).toBe(9998)
})

/** A later nested data write must not mutate an earlier recorded script event. */
test('nested script data survives seeking before and after a change', async () => {
    const events = [
        { type: 'ScreenLoaded', screen: 's' },
        { type: 'ScriptEffect', screen: 's', state: { type: 'script', value: {
            dataChanges: [{ path: 'user', value: { name: 'Ada' } }]
        } } },
        { type: 'ScriptEffect', screen: 's', state: { type: 'script', value: {
            dataChanges: [{ path: 'user.name', value: 'Grace' }]
        } } }
    ]
    const index = new ReplayStateIndex(events, { s: {} })
    await index.build()
    expect(events[1].state.value.dataChanges[0].value.name).toBe('Ada')
    expect(index.get(2).data.user.name).toBe('Grace')
    expect(index.get(1).data.user.name).toBe('Ada')
    expect(index.get(2).data.user.name).toBe('Grace')
})

/** Reloading while typing lost the unfinished value and open overlay in replay. */
test('reload snapshots hold state during the gap and restore it when seeking', async () => {
    const events = [
        { type: 'ScreenLoaded', screen: 's', time: 10 },
        { type: 'ScreenScroll', screen: 's', time: 20, state: { type: 'scroll', value: 0.1 } },
        { type: 'SessionReload', screen: 's', time: 30, state: { type: 'resume', value: {
            widgets: [{ id: 'input', state: { type: 'text', value: 'unfinished' } }], overlays: ['dialog'], scroll: 0.4
        } } },
        { type: 'SessionResume', screen: 's', time: 100, state: { type: 'resume', value: {
            widgets: [{ id: 'input', state: { type: 'text', value: 'unfinished' } }], overlays: ['dialog'], scroll: 0.4
        } } },
        { type: 'WidgetChange', screen: 's', widget: 'input', time: 110, state: { type: 'text', value: 'finished' } }
    ]
    const index = new ReplayStateIndex(events, { s: { input: { type: 'text', value: '' } } })
    await index.build()
    expect(index.get(2).widgetStates.input.value).toBe('unfinished')
    expect(index.get(2).overlays).toEqual(['dialog'])
    expect(index.get(2).scroll.value).toBe(0.4)
    expect(index.get(4).widgetStates.input.value).toBe('finished')
    expect(index.get(3).widgetStates.input.value).toBe('unfinished')
    expect(index.get(0).widgetStates.input.value).toBe('')
    expect(replayFrameTime(events[2], 60, 10)).toBe(20)
    expect(replayFrameTime(events[3], 90, 10)).toBe(90)
})

/** A reload must project the script's final visibility without replaying the script. */
test('resume applies saved script effects only after the reload gap', async () => {
    const changes = [{ type: 'Widget', id: 'input', key: 'style', value: { display: 'none' } }]
    const events = [
        { type: 'ScreenLoaded', screen: 's' },
        { type: 'SessionReload', screen: 's', state: { type: 'resume', value: {} } },
        { type: 'SessionResume', screen: 's', state: { type: 'resume', value: { scriptChanges: changes } } }
    ]
    const index = new ReplayStateIndex(events, { s: { input: { type: 'text', value: '' } } })
    await index.build()
    expect(index.get(1).effects).toEqual({})
    expect(index.get(2).effects.input.style.display).toBe('none')
    expect(index.get(1).effects).toEqual({})
})

/**
 * A context menu paste fires the DOM input event but no keyup, so nothing
 * sampled the pasted value into the recorded composite series: the replay
 * read the stale focus-time sample and showed the field blank, although
 * the survey analytics carried the pasted value.
 */
test('a paste that missed the children series is replayed through a terminal child', async () => {
    const defaults = { s: { input: { type: 'text', value: '' } } }
    const events = [
        { type: 'ScreenLoaded', screen: 's', time: 10 },
        { type: 'WidgetChange', screen: 's', widget: 'input', time: 200, state: {
            type: 'text', value: 'pasted', children: [{ time: 100, value: '' }] } }
    ]
    const index = new ReplayStateIndex(copy(events), copy(defaults))
    await index.build()
    expect(index.get(1).widgetStates.input.children).toEqual([
        { time: 100, value: '' },
        { time: 200, value: 'pasted' }
    ])
    expect(index.get(1).valueStates.input).toEqual(index.get(1).widgetStates.input)

    /**
     * A series that already ends with the final value (what typing records)
     * must not gain a duplicate, and both projections stay in lockstep.
     */
    const typedEvents = [
        { id: '0', type: 'ScreenLoaded', screen: 's', time: 10 },
        { id: '1', type: 'WidgetChange', screen: 's', widget: 'input', time: 200, state: {
            type: 'text', value: 'abc', children: [{ time: 100, value: 'a' }, { time: 150, value: 'abc' }] } }
    ]
    const expected = buildEventStates(copy(typedEvents), copy(defaults))
    const typedIndex = new ReplayStateIndex(copy(typedEvents), copy(defaults))
    await typedIndex.build()
    expect(typedIndex.get(1).widgetStates.input.children).toEqual([
        { time: 100, value: 'a' },
        { time: 150, value: 'abc' }
    ])
    expect(typedIndex.get(1).widgetStates.input.children)
        .toEqual(expected.widgetStates['1'].input.children)
})

/**
 * A script that fills the form (rules, state rules) writes its values into
 * the replay's script data for the whole session, but nothing updates that
 * data channel when the recorded user types over it. The touched markers
 * that kept the script data replay from overwriting the typing are reset by
 * every ScreenLoaded, so after the user navigated away and back the player
 * re-applied the script's old value to the input at every frame, although
 * the live prototype kept the typed value and the re-render echoes of the
 * recording all carried it (ReplayStateIndex.js userValues).
 */
test('a user value outranks the script data replay across screen hops', async () => {
    const defaults = {
        s1: { seed: { type: 'text', value: '' } },
        s2: { seed: { type: 'text', value: '' } }
    }
    const events = [
        { id: '0', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: {
            dataChanges: [{ path: 'Random_Seed', value: 123456 }], widgetChanges: []
        } } },
        { id: '1', type: 'ScreenLoaded', screen: 's1' },
        { id: '2', type: 'WidgetInit', screen: 's1', widget: 'seed', state: { type: 'text', value: '123456' } },
        { id: '3', type: 'WidgetChange', screen: 's1', widget: 'seed', state: { type: 'text', value: '456' } },
        { id: '4', type: 'WidgetInit', screen: 's1', widget: 'seed', state: { type: 'text', value: '456' } },
        { id: '5', type: 'ScreenLoaded', screen: 's2' },
        { id: '6', type: 'ScreenLoaded', screen: 's1' },
        { id: '7', type: 'WidgetInit', screen: 's1', widget: 'seed', state: { type: 'text', value: '456' } }
    ]
    const expected = buildEventStates(copy(events), copy(defaults))
    const index = new ReplayStateIndex(copy(events), copy(defaults))
    await index.build()

    /**
     * The typing marks the widget for its screen, and the mark is not reset
     * by the screen loads.
     */
    expect(index.get(3).userValues.s1.seed).toBe(true)
    expect(index.get(6).touched).toEqual({})
    expect(index.get(6).userValues.s1.seed).toBe(true)
    expect(index.get(7).userValues.s1.seed).toBe(true)

    /**
     * The WidgetInit echo of the script prefill is not a user interaction,
     * and the mark is scoped to the screen that recorded it.
     */
    expect(index.get(2).userValues.s1 && index.get(2).userValues.s1.seed).toBeUndefined()
    expect(index.get(5).userValues.s2).toBeUndefined()

    expect(index.get(3).userValues).toEqual(expected.userValues['3'])
    expect(index.get(6).userValues).toEqual(expected.userValues['6'])
})
