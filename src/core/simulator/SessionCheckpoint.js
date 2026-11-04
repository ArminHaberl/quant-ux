import JSONPath from 'core/JSONPath'

const KEY = 'qux.simulator.checkpoint.v1'
const VERSION = 1

export function isReload (performance) {
    if (!performance) return false
    const entries = performance.getEntriesByType && performance.getEntriesByType('navigation')
    if (entries && entries.length) return entries[0].type === 'reload'
    return !!(performance.navigation && performance.navigation.type === 1)
}

// Navigation timing describes the document, not subsequent Vue route changes.
// Consume it once so revisiting a test within the SPA starts a fresh session.
export function claimReload (browser) {
    if (!browser || browser.__quxResumeNavigationHandled) return false
    browser.__quxResumeNavigationHandled = true
    return isReload(browser.performance)
}

export function readCheckpoint (storage, reload) {
    try {
        if (!reload) {
            storage.removeItem(KEY)
            return null
        }
        const value = JSON.parse(storage.getItem(KEY))
        return value && value.version === VERSION ? value : null
    } catch (e) {
        return null
    }
}

export function writeCheckpoint (storage, checkpoint) {
    try {
        storage.setItem(KEY, JSON.stringify(Object.assign({}, checkpoint, { version: VERSION }), (key, value) => {
            if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined
            return value
        }))
        return true
    } catch (e) {
        return false
    }
}

export function mergeScriptChange (changes, change) {
    const previous = changes.find(item => item.type === change.type && item.id === change.id && item.key === change.key)
    if (previous) {
        previous.value = Object.assign({}, previous.value, change.value)
    } else {
        changes.push({ type: change.type, id: change.id, key: change.key, value: Object.assign({}, change.value) })
    }
}

export function matchesCheckpoint (checkpoint, model, hash) {
    return !!(checkpoint && model && checkpoint.appID === model.id && checkpoint.hash === hash &&
        checkpoint.revision === (model.lastUpdate || null) && model.screens && model.screens[checkpoint.screenID] &&
        typeof checkpoint.session === 'string' && checkpoint.session && checkpoint.user && checkpoint.bindings &&
        typeof checkpoint.bindings === 'object' && !Array.isArray(checkpoint.bindings) &&
        checkpoint.states && typeof checkpoint.states === 'object' && !Array.isArray(checkpoint.states) &&
        Array.isArray(checkpoint.history) && checkpoint.history.every(item => item && typeof item.screenID === 'string') &&
        Array.isArray(checkpoint.liveStates) && checkpoint.liveStates.every(item => item && typeof item.id === 'string' && item.state && typeof item.state === 'object') &&
        (!checkpoint.taskEvents || Array.isArray(checkpoint.taskEvents)) &&
        (!checkpoint.animationEffects || (Array.isArray(checkpoint.animationEffects) && checkpoint.animationEffects.every(effect =>
            effect && typeof effect.id === 'string' && (effect.opacity === null || effect.opacity === 0 || effect.opacity === 1) &&
            typeof effect.finishText === 'boolean'))) &&
        (!checkpoint.scriptChanges || (Array.isArray(checkpoint.scriptChanges) && checkpoint.scriptChanges.every(change =>
            change && (change.type === 'Widget' || change.type === 'Screen') && typeof change.id === 'string' &&
            (change.key === 'style' || change.key === 'props') && change.value && typeof change.value === 'object'))) &&
        Array.isArray(checkpoint.overlays) && checkpoint.overlays.every(o => o && model.screens[o.id]))
}

function copy (value) {
    return JSON.parse(JSON.stringify(value, (key, item) => {
        if (typeof Blob !== 'undefined' && item instanceof Blob) return undefined
        return item
    }))
}

function removePath (data, path) {
    if (!path || typeof path !== 'string') return
    delete data[path]
    const parts = JSONPath.getJsonPath(path)
    const last = parts.pop()
    let node = data
    for (const part of parts) {
        if (!node || typeof node !== 'object') return
        node = node[part]
    }
    if (node && typeof node === 'object') delete node[last]
}

function taskEvents (events, sensitive) {
    const types = new Set(['ScreenClick', 'WidgetClick', 'WidgetChange', 'ValidationError',
        'ValidationErrorLine', 'ScreenLoaded', 'OverlayLoaded', 'OverlayRemoved', 'ScreenGesture', 'WidgetGesture'])
    return events.filter(event => types.has(event.type)).map(event => {
        const result = { type: event.type, screen: event.screen, widget: event.widget, overlay: event.overlay,
            time: event.time, session: event.session, user: event.user, gesture: event.gesture }
        if (event.state) {
            result.state = { type: event.state.type }
            if (!sensitive.has(event.widget) && event.state.type !== 'text' && event.state.type !== 'typing') {
                result.state.value = event.state.value
            }
            if (event.state.children) result.state.children = event.state.children.map(child => ({ time: child.time }))
        }
        return result
    })
}

/** Capture both the factory's retained states and the currently rendered widgets. */
export function captureCheckpoint (simulator, now = Date.now()) {
    if (!simulator.currentScreen || !simulator.model || !simulator.hash) return null
    const model = simulator.model
    const states = Object.assign({}, simulator.renderFactory._uiWidgetsStates)
    const liveStates = []
    const bindings = copy(simulator.dataBindingValues || {})
    const sensitive = new Set()
    const sensitivePaths = []
    Object.values(model.widgets || {}).forEach(widget => {
        if (widget.type === 'Password' || widget.type === 'Upload') {
            sensitive.add(widget.id)
            if (widget.inherited) sensitive.add(widget.inherited)
            Object.values((widget.props && widget.props.databinding) || {}).forEach(path => {
                if (typeof path === 'string') sensitivePaths.push(path)
                removePath(bindings, path)
            })
        }
    })
    Object.values(model.widgets || {}).forEach(widget => {
        const paths = Object.values((widget.props && widget.props.databinding) || {})
        if (paths.some(path => typeof path === 'string' && sensitivePaths.some(secret =>
            path === secret || path.startsWith(secret + '.') || secret.startsWith(path + '.')))) {
            sensitive.add(widget.id)
            if (widget.inherited) sensitive.add(widget.inherited)
        }
    })
    const widgets = simulator.renderFactory.getAllUIWidgets()
    Object.keys(widgets).forEach(id => {
        const widget = widgets[id]
        const modelWidget = widget.model || model.widgets[id]
        if (!modelWidget || sensitive.has(id) || sensitive.has(modelWidget.inherited)) return
        if (modelWidget.type === 'Repeater') return
        const key = modelWidget.inherited || id
        if (widget.getState) {
            const state = widget.getResumeState ? widget.getResumeState() : widget.getState()
            if (state) {
                // Some widgets have a replay-only setState; restore those through
                // their explicit live-simulator hook instead of the factory.
                if (widget.setResumeState) delete states[key]
                else states[key] = state
                liveStates.push({ id, state })
                // Text widgets normally update their binding on blur, which may not
                // happen before a reload while the user is still typing.
                const path = modelWidget.props && modelWidget.props.databinding && modelWidget.props.databinding.default
                if (path && state.type === 'text') JSONPath.set(bindings, path, state.value)
            }
        }
    })
    sensitive.forEach(id => delete states[id])
    // Repeater state can contain a second copy of the entire binding object.
    // It is rebuilt from the sanitized bindings when its screen is rendered.
    Object.values(model.widgets || {}).forEach(widget => {
        if (widget.type === 'Repeater') {
            delete states[widget.id]
            if (widget.inherited) delete states[widget.inherited]
        }
    })
    // A non-sensitive widget may share a binding with a password widget.
    Object.values(model.widgets || {}).forEach(widget => {
        if (widget.type === 'Password' || widget.type === 'Upload') {
            Object.values((widget.props && widget.props.databinding) || {}).forEach(path => removePath(bindings, path))
        }
    })
    return {
        appID: model.id, hash: simulator.hash, revision: model.lastUpdate || null,
        screenID: simulator.currentScreen.id,
        overlays: (simulator.overlays || []).map(o => ({ id: o.screen.id, line: o.line })),
        history: simulator.screenHistory || [], states, liveStates, bindings,
        scroll: simulator.currentScrollTop || 0, scrollRelative: simulator.currentScrollTopRelative || 0,
        timer: simulator._resumeScreenTimer ? {
            screenID: simulator._resumeScreenTimer.screenID,
            remaining: Math.max(0, simulator._resumeScreenTimer.dueAt - now)
        } : null,
        session: simulator.getSession(), user: simulator.getUser(), logData: simulator.logData,
        scriptChanges: simulator._resumeScriptChanges || [],
        animationEffects: simulator._resumeAnimationEffects || [],
        taskEvents: taskEvents(simulator._resumeTaskEvents || [], sensitive),
        savedAt: now
    }
}
