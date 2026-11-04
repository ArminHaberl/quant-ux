import { captureCheckpoint, matchesCheckpoint, writeCheckpoint } from 'core/simulator/SessionCheckpoint'
import { applyAnimationEffects } from 'core/simulator/SessionAnimationState'

export default {
    methods: {
        prepareSessionResume (model, hash) {
            const saved = this._resumeCandidate
            if (!this._resumeEnabled || !matchesCheckpoint(saved, model, hash)) return false
            this._resumeSnapshot = saved
            this._session = saved.session
            this._user = saved.user
            this.logData = saved.logData
            this._resumeTaskEvents = saved.taskEvents || []
            this._resumeScriptChanges = saved.scriptChanges || []
            this._resumeAnimationEffects = (saved.animationEffects || []).map(effect => Object.assign({}, effect))
            this._resumedAnimationEffects = this._resumeAnimationEffects.map(effect => Object.assign({}, effect))
            return true
        },

        initSessionCapture () {
            if (!this._resumeEnabled || this._resumeCaptureInited) return
            this._resumeCaptureInited = true
            const schedule = () => this.scheduleSessionCheckpoint()
            const onPageHide = () => {
                clearTimeout(this._resumeCheckpointTimer)
                this.saveSessionCheckpoint(true)
                this._resumePageHidden = true
            }
            const onPageShow = event => {
                if (event.persisted) {
                    this._resumePageHidden = false
                    this.scheduleSessionCheckpoint()
                }
            }
            this.domNode.addEventListener('input', schedule, true)
            this.domNode.addEventListener('change', schedule, true)
            window.addEventListener('pagehide', onPageHide)
            window.addEventListener('pageshow', onPageShow)
            this.own({ remove: () => {
                this.domNode.removeEventListener('input', schedule, true)
                this.domNode.removeEventListener('change', schedule, true)
                window.removeEventListener('pagehide', onPageHide)
                window.removeEventListener('pageshow', onPageShow)
                clearTimeout(this._resumeCheckpointTimer)
            } })
        },

        scheduleSessionCheckpoint () {
            if (!this._resumeEnabled || this._restoringSession || this._resumePageHidden || !this.currentScreen) return
            clearTimeout(this._resumeCheckpointTimer)
            this._resumeCheckpointTimer = setTimeout(() => this.saveSessionCheckpoint(false), 100)
        },

        saveSessionCheckpoint (pagehide) {
            if (!this._resumeEnabled || this._restoringSession || !this.currentScreen) return
            try {
                const checkpoint = captureCheckpoint(this)
                if (checkpoint) {
                    if (pagehide) checkpoint.reloadStartedAt = Date.now()
                    writeCheckpoint(window.sessionStorage, checkpoint)
                }
            } catch (err) {
                this.logger.warn('saveSessionCheckpoint', 'Could not save simulator state', err)
            }
        },

        restoreSessionModelChanges () {
            (this._resumeScriptChanges || []).forEach(change => {
                const collection = change.type === 'Screen' ? this.model.screens : this.model.widgets
                const element = collection && collection[change.id]
                if (element && element[change.key]) Object.assign(element[change.key], change.value)
            })
        },

        applyResumedAnimationEffects () {
            if (this._resumedAnimationEffects && this._resumedAnimationEffects.length) {
                applyAnimationEffects(this.renderFactory, this._resumedAnimationEffects)
            }
        },

        restoreSessionScreen () {
            const snapshot = this._resumeSnapshot
            if (!snapshot) return false
            this._restoringSession = true
            try {
                this.dataBindingValues = snapshot.bindings || {}
                this.screenHistory = snapshot.history || []
                this.renderFactory._uiWidgetsStates = snapshot.states || {}
                this.restoreSessionModelChanges()
                this.renderScreen(this.model.screens[snapshot.screenID], null)
                snapshot.overlays.forEach(item => {
                    this.renderScreenOverlay(this.model.screens[item.id], item.line || null)
                })
                ;(snapshot.liveStates || []).forEach(item => {
                    const widget = this.renderFactory.getUIWidgetByID(item.id)
                    if (widget && widget.setResumeState) widget.setResumeState(item.state)
                    else if (widget && widget.setState) widget.setState(item.state)
                })
                this.applyResumedAnimationEffects()
                if (snapshot.scroll) {
                    this._ignoreResumeScroll = true
                    this.scrollToY(snapshot.scroll)
                    setTimeout(() => { this._ignoreResumeScroll = false }, 300)
                }
            } finally {
                this._restoringSession = false
            }
            if (snapshot.timer && this.model.screens[snapshot.timer.screenID]) {
                const screen = this.model.screens[snapshot.timer.screenID]
                const line = this.getLineForGesture(this.getFromLines(screen), 'timer')
                if (line) this.scheduleScreenTimer(screen, line, snapshot.timer.remaining)
            }
            const restored = captureCheckpoint(this)
            if (snapshot.reloadStartedAt && restored) {
                const state = checkpointReplayState(restored, true)
                this.log('SessionReload', snapshot.screenID, null, null, {
                    time: snapshot.reloadStartedAt, type: 'resume', value: checkpointReplayState(snapshot)
                })
                this.log('SessionResume', snapshot.screenID, null, null, {
                    type: 'resume', value: state
                })
            }
            this._resumeSnapshot = null
            this.scheduleSessionCheckpoint()
            return true
        }
    }
}

export function checkpointReplayState (snapshot, resumed = false) {
    const state = {
        widgets: snapshot.liveStates || [],
        overlays: (snapshot.overlays || []).map(o => o.id),
        scroll: snapshot.scrollRelative || 0
    }
    if (resumed) {
        state.animationEffects = snapshot.animationEffects || []
        state.scriptChanges = (snapshot.scriptChanges || []).filter(change => change.type === 'Widget')
    }
    return state
}
