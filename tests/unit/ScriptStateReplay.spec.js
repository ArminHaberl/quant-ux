import {
    buildEventStates,
    isLifecycleState,
    isValueState
} from '../../src/core/engines/ScriptStateReplay'

/**
 * buildEventStates() is the state projection the VideoPlayer replays from:
 * given the recorded events of a session it builds the per event lookup
 * tables for widget states, value states, script effects, script data,
 * touched widgets, overlays and scrolling.
 */
function defaultStates () {
    return {
        s1: {
            dd: { type: 'select', value: '' },
            input: { type: 'text', value: '' }
        }
    }
}

describe('ScriptStateReplay.isLifecycleState', () => {

    test('popup life cycle states are not value states', () => {
        expect(isLifecycleState({ type: 'open' })).toBe(true)
        expect(isLifecycleState({ type: 'openWithHover' })).toBe(true)
        expect(isLifecycleState({ type: 'close' })).toBe(true)
        expect(isLifecycleState({ type: 'popupScroll' })).toBe(true)
        expect(isLifecycleState({ type: 'hidden' })).toBe(true)
    })

    test('a value state is everything else', () => {
        expect(isValueState({ type: 'select', value: 'A' })).toBe(true)
        expect(isValueState({ type: 'text', value: 'A' })).toBe(true)
        expect(isValueState({ type: 'radiobox.checked', value: true })).toBe(true)
        expect(isValueState(null)).toBe(false)
        expect(isLifecycleState(null)).toBe(false)
    })
})

describe('ScriptStateReplay.buildEventStates', () => {

    /**
     * A user who opened a prefilled dropdown without changing it wiped the
     * prefill out of the replay. Opening and closing the popup logs states
     * that carry no value (openWithHover, close), which replaced the select
     * state that carried the prefilled value, and the events marked the
     * widget as touched, which stopped the script data binding replay from
     * re-applying the recorded value at every later frame. From the open
     * event on the player only had the placeholder of a freshly rendered
     * widget, although the recorded user never changed anything.
     */
    test('opening a prefilled dropdown without changing it keeps the prefill replayable', () => {
        const events = [
            { id: 'e1', type: 'ScriptEffect', screen: null, state: { type: 'script', value: { dataChanges: [{ path: 'x', value: 'A' }], widgetChanges: [] } } },
            { id: 'e2', type: 'SessionStart', screen: 's1' },
            { id: 'e3', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e4', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'openWithHover', value: { hover: -1 }, children: [] } },
            { id: 'e5', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'close', value: '' } },
            { id: 'e6', type: 'WidgetClick', screen: 's1', widget: 'btn' }
        ]
        const result = buildEventStates(events, defaultStates())

        /**
         * The popup life cycle events must not mark the widget as touched:
         * the script data binding replay keeps re-applying the recorded
         * value, which is what the live run showed.
         */
        expect(result.touchedWidgets['e4']['dd']).toBeUndefined()
        expect(result.touchedWidgets['e5']['dd']).toBeUndefined()
        expect(result.touchedWidgets['e6']['dd']).toBeUndefined()

        /**
         * And a value state survives the open and close, so the player can
         * still re-apply a value after the state timeline has moved on to
         * popup life cycle states.
         */
        expect(result.valueStates['e6']['dd']).toEqual({ type: 'select', value: '' })
        /**
         * The life cycle state itself is still replayed, so the popup opens
         * and closes on time.
         */
        expect(result.widgetStates['e6']['dd']).toEqual({ type: 'close', value: '' })

        /**
         * The script data of the run is carried forward to every later event.
         */
        expect(result.scriptData['e6']).toEqual({ x: 'A' })
    })

    test('a WidgetInit echo carries the prefill in the widget state map without marking it touched', () => {
        const events = [
            { id: 'e1', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: { dataChanges: [{ path: 'x', value: 'A' }], widgetChanges: [] } } },
            { id: 'e2', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e3', type: 'WidgetInit', screen: 's1', widget: 'dd', state: { type: 'select', value: 'A' } },
            { id: 'e4', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'openWithHover', value: { hover: -1 }, children: [] } },
            { id: 'e5', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'close', value: '' } }
        ]
        const result = buildEventStates(events, defaultStates())

        /**
         * The state timeline itself still moves on: the open event replaces
         * the widget state, exactly as it did before.
         */
        expect(result.widgetStates['e3']['dd']).toEqual({ type: 'select', value: 'A' })
        expect(result.widgetStates['e4']['dd']).toEqual({ type: 'openWithHover', value: { hover: -1 }, children: [] })

        /**
         * The echo is the recorder reporting a data binding change, not the
         * user touching anything, and the popup events do not count either.
         */
        expect(result.touchedWidgets['e3']['dd']).toBeUndefined()
        expect(result.touchedWidgets['e4']['dd']).toBeUndefined()
        expect(result.touchedWidgets['e5']['dd']).toBeUndefined()

        /**
         * The prefilled value survives the popup dance as the retained value
         * state, which is what the player re-applies at the open event and
         * after it.
         */
        expect(result.valueStates['e3']['dd']).toEqual({ type: 'select', value: 'A' })
        expect(result.valueStates['e4']['dd']).toEqual({ type: 'select', value: 'A' })
        expect(result.valueStates['e5']['dd']).toEqual({ type: 'select', value: 'A' })
    })

    /**
     * The ValidationError events log a state of type "value". TextBox replay
     * ignores that type entirely, so under the old single slot rule the event
     * evicted the text state that carried what the user had typed: after it,
     * only the live DOM still knew the value, and a re-render showed the
     * static label instead.
     */
    test('a validation state does not evict the text state of an input', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'input', state: { type: 'text', value: 'typed', options: { valid: false } } },
            { id: 'e3', type: 'ValidationError', screen: 's1', widget: 'input', state: { type: 'value', value: 'typed' } }
        ]
        const result = buildEventStates(events, defaultStates())

        /**
         * The life cycle event still is the widget state of its own and later
         * events, so the replay does not change what the widget was told.
         */
        expect(result.widgetStates['e3']['input']).toEqual({ type: 'value', value: 'typed' })

        /**
         * But the text state is retained and still available for events after
         * the validation dance.
         */
        expect(result.valueStates['e3']['input']).toEqual({ type: 'text', value: 'typed', options: { valid: false } })
    })

    test('a user interaction that carries a value marks the widget touched', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'input', state: { type: 'text', value: 'typed' } }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(result.touchedWidgets['e2']['input']).toBe(true)
    })

    test('a script value that arrives after a user interaction is carried by the WidgetInit echo', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'input', state: { type: 'text', value: 'typed' } },
            { id: 'e3', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: { dataChanges: [{ path: 'x', value: 'A' }], widgetChanges: [] } } },
            { id: 'e4', type: 'WidgetInit', screen: 's1', widget: 'input', state: { type: 'text', value: 'A' } }
        ]
        const result = buildEventStates(events, defaultStates())

        /**
         * Live, the data binding change replaced what the user had typed, so
         * the echo has to update the widget state even for a touched widget.
         */
        expect(result.widgetStates['e4']['input']).toEqual({ type: 'text', value: 'A' })
        expect(result.valueStates['e4']['input']).toEqual({ type: 'text', value: 'A' })

        /**
         * The user interaction before it stays marked touched, which keeps
         * protecting it from older script data.
         */
        expect(result.touchedWidgets['e4']['input']).toBe(true)
    })

    /**
     * The radio sibling sync mutates the state objects in place, and the
     * value states share those objects, so the uncheck reaches both tables.
     */
    test('the radio sibling sync unchecks the other boxes in both tables', () => {
        const defaults = {
            s1: {
                r1: { type: 'radiobox.checked', value: true },
                r2: { type: 'radiobox.checked', value: false }
            }
        }
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'r2', state: { type: 'radiobox.checked', value: true } }
        ]
        const result = buildEventStates(events, defaults)

        expect(result.widgetStates['e2']['r1'].value).toBe(false)
        expect(result.valueStates['e2']['r1'].value).toBe(false)
        expect(result.widgetStates['e2']['r2'].value).toBe(true)
        expect(result.touchedWidgets['e2']['r2']).toBe(true)
    })

    test('a later value state replaces an earlier retained one', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'dd', state: { type: 'select', value: 'A' } },
            { id: 'e3', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'openWithHover', value: { hover: -1 }, children: [] } },
            { id: 'e4', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'close', value: '' } },
            { id: 'e5', type: 'WidgetChange', screen: 's1', widget: 'dd', state: { type: 'select', value: 'B' } },
            { id: 'e6', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'openWithHover', value: { hover: -1 }, children: [] } }
        ]
        const result = buildEventStates(events, defaultStates())

        /**
         * The open at e6 evicts, and the value that has to survive is the
         * newest one, not the first.
         */
        expect(result.valueStates['e6']['dd']).toEqual({ type: 'select', value: 'B' })
    })

    test('script data accumulates across events and screens reset the touched widgets', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetChange', screen: 's1', widget: 'input', state: { type: 'text', value: 'typed' } },
            { id: 'e3', type: 'ScreenLoaded', screen: 's2' },
            { id: 'e4', type: 'WidgetClick', screen: 's2', widget: 'other' },
            { id: 'e5', type: 'ScreenLoaded', screen: 's1' }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(result.touchedWidgets['e2']['input']).toBe(true)
        expect(result.touchedWidgets['e3']).toEqual({})
        expect(result.touchedWidgets['e4']['input']).toBeUndefined()

        /**
         * A screen only replays the states of its own widgets, but the states
         * of s1 are kept while the session is on s2, so going back restores
         * them.
         */
        expect(result.widgetStates['e4']['input']).toBeUndefined()
        expect(result.widgetStates['e5']['input']).toEqual({ type: 'text', value: 'typed' })
        expect(result.valueStates['e5']['input']).toEqual({ type: 'text', value: 'typed' })
    })

    test('a script that removes a value marks the data undefined again', () => {
        const events = [
            { id: 'e1', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: { dataChanges: [{ path: 'x', value: 'A' }], widgetChanges: [] } } },
            { id: 'e2', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: { dataChanges: [{ path: 'x', removed: true }], widgetChanges: [] } } }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(result.scriptData['e2']).toEqual({ x: undefined })
    })

    test('script widget changes accumulate and drop empty prop entries', () => {
        const events = [
            { id: 'e1', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: {
                dataChanges: [],
                widgetChanges: [{ id: 'w', key: 'props', value: { label: '' } }]
            } } },
            { id: 'e2', type: 'ScriptEffect', screen: 's1', state: { type: 'script', value: {
                dataChanges: [],
                widgetChanges: [{ id: 'w', key: 'style', value: { opacity: 0.5 } }]
            } } }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(result.scriptEffects['e2']['w']).toEqual({ style: { opacity: 0.5 }, props: {} })
    })

    test('events without a screen inherit the last known screen', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'WidgetInit', widget: 'input', state: { type: 'text', value: 'A' } },
            { id: 'e3', type: 'WidgetClick', screen: 's1', widget: 'dd', state: { type: 'openWithHover', value: { hover: -1 }, children: [] } }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(events[1].screen).toBe('s1')
        expect(result.backfilled).toBe(1)
        expect(result.widgetStates['e3']['input']).toEqual({ type: 'text', value: 'A' })
    })

    test('overlays and scrolling are tracked per event', () => {
        const events = [
            { id: 'e1', type: 'ScreenLoaded', screen: 's1' },
            { id: 'e2', type: 'OverlayLoaded', screen: 's1', overlay: 'o1' },
            { id: 'e3', type: 'ScreenScroll', screen: 's1', state: { type: 'scroll', value: 0.5 } },
            { id: 'e4', type: 'OverlayRemoved', screen: 's1', overlay: 'o1' }
        ]
        const result = buildEventStates(events, defaultStates())

        expect(result.overlayStates['e2']).toEqual(['o1'])
        expect(result.overlayStates['e4']).toEqual([])
        expect(result.scrollStates['e3']).toEqual({ type: 'scroll', value: 0.5 })
        expect(result.scrollStates['e4']).toEqual({ type: 'scroll', value: 0.5 })
    })
})