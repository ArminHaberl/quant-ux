import lang from '../../dojo/_base/lang'
import { applyScriptEffect, isValueState, setSiblingStates } from './ScriptStateReplay'

// Keep checkpoint memory bounded even when the recording contains many events.
const MAX_CHECKPOINTS = 64
const BUILD_BATCH_SIZE = 1000

function initialState (defaultStates) {
    const states = lang.clone(defaultStates) || {}
    return {
        states,
        values: lang.clone(states) || {},
        effects: {}, data: {}, touched: {}, overlays: [],
        scroll: { type: 'scroll', value: 0 }, lastScreen: null
    }
}

function applyEvent (state, event, previous) {
    if (event.screen) {
        state.lastScreen = event.screen
    } else if (state.lastScreen) {
        event.screen = state.lastScreen
    }
    const screen = event.screen
    if (event.type === 'ScreenLoaded' || event.type === 'ScreenAnimation') {
        state.touched = {}
    }

    if (event.state && event.state.type === 'script') {
        // Nested data paths are mutated in place. Do not let a later change
        // alter an object still owned by the original recorded event.
        applyScriptEffect(state.effects, state.data, lang.clone(event.state.value))
    } else if (event.state && event.type !== 'ScreenScroll' && event.widget && state.states[screen]) {
        const widgetState = lang.clone(event.state)
        state.states[screen][event.widget] = widgetState
        if (isValueState(widgetState)) {
            state.values[screen][event.widget] = widgetState
            if (event.type !== 'WidgetInit') {
                state.touched[event.widget] = true
            }
        }
        if (widgetState.type === 'radiobox.checked') {
            setSiblingStates(state.states[screen], 'radiobox.checked', false, event)
            // Values and states may have been separated by a checkpoint clone.
            for (const id in state.states[screen]) {
                if (id !== event.widget && state.states[screen][id].type === 'radiobox.checked' &&
                    state.values[screen][id] && state.values[screen][id].type === 'radiobox.checked') {
                    state.values[screen][id].value = false
                }
            }
        }
    }

    if (event.type === 'ScreenScroll' && event.state) {
        state.scroll = lang.clone(event.state)
    } else if (event.type === 'ScreenLoaded' || event.type === 'ScreenAnimation') {
        state.scroll = { type: 'scroll', value: 0 }
        if (previous && event.type !== 'ScreenAnimation' && previous.type !== 'ScreenAnimation' && event.scrollTop != null) {
            state.scroll.value = event.scrollTop
        }
    } else if (previous && previous.type === 'ScreenScroll' && previous.state) {
        // The old projection retains the final value, not the scroll samples.
        state.scroll = { type: 'scroll', value: previous.state.value }
    }

    if (event.type === 'ScreenLoaded') state.overlays = []
    const added = event.type === 'OverlayLoaded' ? event.overlay
        : event.type === 'OverlayShowAnimation' && event.animation ? event.animation.to : null
    if (added && state.overlays.indexOf(added) < 0) state.overlays.push(added)
    if (event.type === 'OverlayRemoved') {
        const index = state.overlays.indexOf(event.overlay)
        if (index >= 0) state.overlays.splice(index, 1)
    }
}

/** A bounded set of full checkpoints; events between them are applied on demand. */
export default class ReplayStateIndex {
    constructor (events, defaultStates) {
        this.events = events
        this.initial = initialState(defaultStates)
        this.interval = Math.max(1, Math.ceil(events.length / MAX_CHECKPOINTS))
        this.checkpoints = [{ index: -1, state: lang.clone(this.initial) }]
        this.state = lang.clone(this.initial)
        this.index = -1
    }

    async build (isCancelled = () => false) {
        const state = lang.clone(this.initial)
        for (let i = 0; i < this.events.length; i++) {
            applyEvent(state, this.events[i], this.events[i - 1])
            if ((i + 1) % this.interval === 0 && i + 1 < this.events.length) {
                this.checkpoints.push({ index: i, state: lang.clone(state) })
            }
            if ((i + 1) % BUILD_BATCH_SIZE === 0) {
                await new Promise(resolve => setTimeout(resolve, 0))
                if (isCancelled()) return false
            }
        }
        return true
    }

    get (index) {
        if (index < 0 || index >= this.events.length) return null
        const checkpoint = this.checkpoints[Math.floor(index / this.interval)]
        if (index < this.index || checkpoint.index > this.index) {
            this.state = lang.clone(checkpoint.state)
            this.index = checkpoint.index
        }
        while (this.index < index) {
            this.index++
            applyEvent(this.state, this.events[this.index], this.events[this.index - 1])
        }
        const event = this.events[index]
        return {
            widgetStates: this.state.states[event.screen] || {},
            valueStates: this.state.values[event.screen] || {},
            effects: this.state.effects, data: this.state.data,
            touched: this.state.touched, overlays: this.state.overlays,
            scroll: this.state.scroll
        }
    }
}
