import { recordAnimationDelta, applyAnimationEffects, releaseAnimationEffects } from '../../src/core/simulator/SessionAnimationState'
import { captureCheckpoint } from '../../src/core/simulator/SessionCheckpoint'
import SessionResume, { checkpointReplayState } from '../../src/core/simulator/SessionResume'

function fixture () {
    return {
        screens: { s: { id: 's', children: ['a', 'b', 'secret'] } },
        widgets: {
            a: { id: 'a', type: 'Label', x: 0, y: 0, style: { display: 'none' }, props: {} },
            b: { id: 'b', type: 'Box', x: 0, y: 100, style: {}, props: {} },
            secret: { id: 'secret', type: 'Password', x: 0, y: 200, style: {}, props: {} }
        },
        groups: { g: { id: 'g', children: ['a', 'b', 'secret'] } }
    }
}

/** Script animation deltas were omitted from checkpoints, resetting visibility after reload. */
test('records final widget and staggered group effects without storing passwords', () => {
    const model = fixture()
    const changes = []
    const effects = []
    recordAnimationDelta(model, changes, effects, { type: 'WidgetAnimation', id: 'a', animation: 'fadeIn' })
    recordAnimationDelta(model, changes, effects, { type: 'GroupAnimation', id: 'g', animation: 'fadeOut', step: 200 })
    expect(changes).toEqual([
        { type: 'Widget', id: 'a', key: 'style', value: { display: 'none' } },
        { type: 'Widget', id: 'b', key: 'style', value: { display: 'none' } }
    ])
    expect(effects).toEqual([
        { id: 'a', opacity: 0, finishText: false },
        { id: 'b', opacity: 0, finishText: false }
    ])
})

/** A later script show or explicit opacity must win over the earlier animation. */
test('preserves script order and keeps independent style and typewriter state', () => {
    const model = fixture()
    const changes = []
    const effects = []
    recordAnimationDelta(model, changes, effects, { type: 'WidgetAnimation', id: 'a', animation: 'typewriter' })
    recordAnimationDelta(model, changes, effects, { type: 'Widget', id: 'a', key: 'style', style: { color: 'red' } })
    expect(effects[0]).toEqual({ id: 'a', opacity: 1, finishText: true })
    recordAnimationDelta(model, changes, effects, { type: 'Widget', id: 'a', key: 'style', style: { display: 'none', opacity: 0.4 } })
    expect(changes[0].value).toEqual({ display: 'none', color: 'red', opacity: 0.4 })
    expect(effects[0]).toEqual({ id: 'a', opacity: null, finishText: true })
    recordAnimationDelta(model, changes, effects, { type: 'Widget', id: 'a', key: 'props', props: { label: 'new' } })
    expect(effects[0].finishText).toBe(false)
})

/** A resumed label must finish typing and a DOM-only box must retain its fade. */
test('applies saved animation frames without mutating model styles', () => {
    const model = fixture()
    const label = { domNode: {}, getValue: () => 'Complete', stopChatAnimation: jest.fn(),
        setInnerHTML: jest.fn(), setAnimatedStyle: jest.fn() }
    const box = { setAnimatedStyle: jest.fn() }
    const factory = { hasRenderedWidget: id => id !== 'missing', getAnimationWrapper: id => id === 'a' ? label : box }
    applyAnimationEffects(factory, [
        { id: 'a', opacity: 1, finishText: true },
        { id: 'b', opacity: 0, finishText: false },
        { id: 'missing', opacity: 1, finishText: false }
    ])
    expect(label.setAnimatedStyle).toHaveBeenCalledWith({ opacity: 1 })
    expect(label.stopChatAnimation).toHaveBeenCalledTimes(1)
    expect(label.setInnerHTML).toHaveBeenCalledWith(label.domNode, 'Complete')
    expect(box.setAnimatedStyle).toHaveBeenCalledWith({ opacity: 0 })
    expect(model.widgets.a.style).toEqual({ display: 'none' })
})

/** A new show or animation after reload must not inherit the old fade's opacity. */
test('releases previously restored effects when later scripts change visibility', () => {
    const model = fixture()
    const widget = { animatedStyle: { opacity: 0, display: 'none' }, setAnimatedStyle: jest.fn() }
    const factory = { hasRenderedWidget: () => true, getAnimationWrapper: () => widget }
    const effects = [{ id: 'a', opacity: 0, finishText: true }]
    releaseAnimationEffects(factory, model, effects, { type: 'Widget', id: 'a', key: 'style', style: { display: 'block' } })
    expect(widget.setAnimatedStyle).toHaveBeenCalledWith({ opacity: 1, display: 'block' })
    expect(effects[0]).toEqual({ id: 'a', opacity: null, finishText: true })
    releaseAnimationEffects(factory, model, effects, { type: 'WidgetAnimation', id: 'a', animation: 'fadeIn' })
    expect(effects).toEqual([])
})

/** Reload replay must show the unfinished frame during the gap, then the final frame. */
test('only the resume replay snapshot contains final animation and script effects', () => {
    const model = fixture()
    const changes = []
    const effects = []
    recordAnimationDelta(model, changes, effects, { type: 'WidgetAnimation', id: 'a', animation: 'fadeIn' })
    const sim = { model: { ...model, id: 'app' }, hash: 'hash', currentScreen: { id: 's' },
        dataBindingValues: {}, renderFactory: { _uiWidgetsStates: {}, getAllUIWidgets: () => ({}) },
        getSession: () => 'session', getUser: () => ({ id: 'user' }),
        _resumeScriptChanges: changes, _resumeAnimationEffects: effects }
    const snapshot = captureCheckpoint(sim)
    expect(checkpointReplayState(snapshot).animationEffects).toBeUndefined()
    expect(checkpointReplayState(snapshot, true).animationEffects).toEqual(effects)
    expect(checkpointReplayState(snapshot, true).scriptChanges).toEqual(changes)
})

/** A saved fade and typewriter must restore both model visibility and the rendered frame. */
test('reload restores animated model changes and finishes typewriter text', () => {
    const model = fixture()
    model.id = 'app'
    const changes = []
    const effects = []
    recordAnimationDelta(model, changes, effects, { type: 'WidgetAnimation', id: 'a', animation: 'typewriter' })
    recordAnimationDelta(model, changes, effects, { type: 'WidgetAnimation', id: 'b', animation: 'fadeOut' })
    const label = { model: model.widgets.a, domNode: {}, getValue: () => 'Done',
        getState: () => ({ type: 'value', value: 'Done' }), setState: jest.fn(),
        stopChatAnimation: jest.fn(), setInnerHTML: jest.fn(), setAnimatedStyle: jest.fn() }
    const box = { model: model.widgets.b, getState: () => null, setAnimatedStyle: jest.fn() }
    const widgets = { a: label, b: box }
    const factory = { _uiWidgetsStates: {}, getAllUIWidgets: () => widgets,
        getUIWidgetByID: id => widgets[id], hasRenderedWidget: id => !!widgets[id], getAnimationWrapper: id => widgets[id] }
    const sim = Object.assign({}, SessionResume.methods, {
        model, hash: 'hash', currentScreen: { id: 's' }, dataBindingValues: {}, renderFactory: factory,
        getSession: () => 'session', getUser: () => ({ id: 'user' }), logData: true,
        screenHistory: [], overlays: [], _resumeEnabled: true,
        _resumeScriptChanges: changes, _resumeAnimationEffects: effects,
        renderScreen: jest.fn(), renderScreenOverlay: jest.fn(), scheduleSessionCheckpoint: jest.fn(), log: jest.fn()
    })
    const snapshot = captureCheckpoint(sim)
    snapshot.reloadStartedAt = 100
    sim._resumeCandidate = snapshot
    expect(sim.prepareSessionResume(model, 'hash')).toBe(true)
    expect(sim.restoreSessionScreen()).toBe(true)
    expect(model.widgets.a.style.display).toBe('block')
    expect(model.widgets.b.style.display).toBe('none')
    expect(label.setAnimatedStyle).toHaveBeenCalledWith({ opacity: 1 })
    expect(label.setInnerHTML).toHaveBeenCalledWith(label.domNode, 'Done')
    expect(box.setAnimatedStyle).toHaveBeenCalledWith({ opacity: 0 })
    expect(sim.log.mock.calls[1][4].value.animationEffects).toEqual(effects)
    expect(captureCheckpoint(sim).animationEffects).toEqual(effects)
})
