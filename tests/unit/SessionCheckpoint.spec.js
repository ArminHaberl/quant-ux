import { captureCheckpoint, claimReload, isReload, matchesCheckpoint, mergeScriptChange, readCheckpoint, writeCheckpoint } from '../../src/core/simulator/SessionCheckpoint'
import SessionResume from '../../src/core/simulator/SessionResume'

function storage () {
    const data = {}
    return {
        getItem: key => data[key] || null,
        setItem: (key, value) => { data[key] = value },
        removeItem: key => { delete data[key] }
    }
}

function simulator () {
    const name = { id: 'name', type: 'TextBox', props: { databinding: { default: 'form.name' } } }
    const password = { id: 'password', type: 'Password', props: { databinding: { default: 'form.password' } } }
    const upload = { id: 'upload', type: 'Upload', props: { databinding: { default: 'file' } } }
    const repeater = { id: 'repeat', type: 'Repeater', props: {} }
    const widgets = {
        name: { model: name, getState: () => ({ type: 'text', value: 'typing' }) },
        password: { model: password, getState: () => ({ type: 'text', value: 'secret' }) },
        upload: { model: upload, getState: () => ({ type: 'value', value: 'file' }) },
        repeat: { model: repeater, getState: () => ({ dataBindingValues: { password: 'secret' } }) }
    }
    return {
        model: { id: 'app', lastUpdate: 123, screens: { first: {}, dialog: {} }, widgets: { name, password, upload, repeat: repeater } },
        hash: 'invitation', currentScreen: { id: 'first' },
        overlays: [{ screen: { id: 'dialog' }, line: { to: 'dialog' } }],
        dataBindingValues: { form: { name: 'old', password: 'secret' }, file: 'file' },
        screenHistory: [{ screenID: 'previous' }], currentScrollTop: 40, currentScrollTopRelative: 0.2,
        renderFactory: { _uiWidgetsStates: { password: { value: 'secret' }, repeat: { dataBindingValues: { password: 'secret' } } }, getAllUIWidgets: () => widgets },
        getSession: () => 'session', getUser: () => ({ id: 'user' }), logData: true,
        _resumeTaskEvents: [{ type: 'WidgetChange', widget: 'password', screen: 'first', session: 'session', time: 5, state: { type: 'text', value: 'secret' } }]
    }
}

/** Reloading discarded in-progress text and started a new simulator session. */
test('checkpoint captures live input, identity, navigation and safe task state', () => {
    const sim = simulator()
    const checkpoint = captureCheckpoint(sim, 1000)
    expect(checkpoint.bindings).toEqual({ form: { name: 'typing' } })
    expect(checkpoint.states.name.value).toBe('typing')
    expect(checkpoint.session).toBe('session')
    expect(checkpoint.user.id).toBe('user')
    expect(checkpoint.overlays[0].id).toBe('dialog')
    expect(checkpoint.history[0].screenID).toBe('previous')
    expect(JSON.stringify(checkpoint)).not.toContain('secret')
    expect(checkpoint.states.repeat).toBeUndefined()
    expect(sim.dataBindingValues.form.password).toBe('secret')
})

/** Another test or a normal navigation must never inherit a prior session. */
test('checkpoints are scoped to reloads, invitation, revision and existing screens', () => {
    const sim = simulator()
    const saved = captureCheckpoint(sim)
    const store = storage()
    expect(writeCheckpoint(store, saved)).toBe(true)
    const loaded = readCheckpoint(store, true)
    expect(matchesCheckpoint(loaded, sim.model, sim.hash)).toBe(true)
    expect(matchesCheckpoint(loaded, sim.model, 'another')).toBe(false)
    expect(matchesCheckpoint(loaded, { ...sim.model, lastUpdate: 124 }, sim.hash)).toBe(false)
    expect(matchesCheckpoint({ ...loaded, screenID: 'missing' }, sim.model, sim.hash)).toBe(false)
    expect(matchesCheckpoint({ ...loaded, liveStates: [null] }, sim.model, sim.hash)).toBe(false)
    expect(matchesCheckpoint({ ...loaded, scriptChanges: {} }, sim.model, sim.hash)).toBe(false)
    expect(readCheckpoint(store, false)).toBeNull()
    expect(readCheckpoint(store, true)).toBeNull()
})

/** Browsers can deny storage access or contain malformed older checkpoints. */
test('storage failures and malformed snapshots safely fall back', () => {
    const denied = { getItem: () => { throw Error('denied') }, setItem: () => { throw Error('full') }, removeItem: () => { throw Error('denied') } }
    expect(readCheckpoint(denied, true)).toBeNull()
    expect(readCheckpoint(denied, false)).toBeNull()
    expect(writeCheckpoint(denied, {})).toBe(false)
    expect(readCheckpoint({ getItem: () => '{' }, true)).toBeNull()
    expect(isReload({ getEntriesByType: () => [{ type: 'reload' }] })).toBe(true)
    expect(isReload({ getEntriesByType: () => [{ type: 'navigate' }] })).toBe(false)
    expect(isReload({ navigation: { type: 1 } })).toBe(true)
    const browser = { performance: { navigation: { type: 1 } } }
    expect(claimReload(browser)).toBe(true)
    expect(claimReload(browser)).toBe(false)
})

/** Resuming must retain the recording choice and identity before test settings run. */
test('prepare resume restores the original identity and recording choice', () => {
    const sim = simulator()
    const checkpoint = captureCheckpoint(sim)
    checkpoint.logData = false
    const target = { _resumeEnabled: true, _resumeCandidate: checkpoint, logData: true }
    expect(SessionResume.methods.prepareSessionResume.call(target, sim.model, sim.hash)).toBe(true)
    expect(target._session).toBe('session')
    expect(target._user).toEqual({ id: 'user' })
    expect(target.logData).toBe(false)
})

/** A segment's ordinary getState is a replay default, not its live scroll position. */
test('checkpoint uses explicit live-state hooks for scrollable segments', () => {
    const sim = simulator()
    const segment = { model: { id: 'segment', type: 'ScreenSegment', props: {} },
        getState: () => ({ type: 'scroll', value: 0 }),
        getResumeState: () => ({ type: 'scroll', value: 0.7, children: [{ time: 0, value: 0.7 }] }),
        setResumeState: () => {} }
    sim.model.widgets.segment = segment.model
    sim.renderFactory._uiWidgetsStates.segment = { type: 'scroll', value: 0 }
    const widgets = sim.renderFactory.getAllUIWidgets()
    widgets.segment = segment
    sim.renderFactory.getAllUIWidgets = () => widgets
    const saved = captureCheckpoint(sim)
    expect(saved.states.segment).toBeUndefined()
    expect(saved.liveStates.find(item => item.id === 'segment').state.value).toBe(0.7)
})

/** Repeat scripts must not grow the checkpoint indefinitely on each tick. */
test('script changes retain the latest values without accumulating duplicate entries', () => {
    const changes = []
    mergeScriptChange(changes, { type: 'Widget', id: 'label', key: 'style', value: { color: 'red', opacity: 1 } })
    mergeScriptChange(changes, { type: 'Widget', id: 'label', key: 'style', value: { opacity: 0.5 } })
    expect(changes).toEqual([{ type: 'Widget', id: 'label', key: 'style', value: { color: 'red', opacity: 0.5 } }])
})

/** A resumed recording must restore its view without emitting another session start. */
test('restores screen, overlay, live input and records the reload interval', () => {
    const source = simulator()
    const snapshot = captureCheckpoint(source)
    snapshot.reloadStartedAt = 100
    snapshot.scroll = 0
    const setState = jest.fn()
    const target = simulator()
    target.model.screens.first = { id: 'first' }
    target.model.screens.dialog = { id: 'dialog' }
    target._resumeSnapshot = snapshot
    target.renderFactory.getUIWidgetByID = id => id === 'name' ? { setState } : null
    target.renderScreen = jest.fn(screen => { target.currentScreen = screen; target.overlays = [] })
    target.renderScreenOverlay = jest.fn((screen, line) => target.overlays.push({ screen, line }))
    target.restoreSessionModelChanges = jest.fn()
    target.applyResumedAnimationEffects = jest.fn()
    target.scheduleSessionCheckpoint = jest.fn()
    target.log = jest.fn()
    expect(SessionResume.methods.restoreSessionScreen.call(target)).toBe(true)
    expect(target.renderScreen).toHaveBeenCalledWith(target.model.screens.first, null)
    expect(target.renderScreenOverlay).toHaveBeenCalledWith(target.model.screens.dialog, { to: 'dialog' })
    expect(setState).toHaveBeenCalledWith({ type: 'text', value: 'typing' })
    expect(target.log.mock.calls.map(call => call[0])).toEqual(['SessionReload', 'SessionResume'])
    expect(target.log.mock.calls[0][4].time).toBe(100)
    expect(target._restoringSession).toBe(false)
    expect(target._resumeSnapshot).toBeNull()
})
