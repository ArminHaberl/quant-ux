import ReplayStateIndex from '../../src/core/engines/ReplayStateIndex'
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
