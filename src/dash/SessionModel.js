import Analytics from './Analytics'
import DataFrame from '../common/DataFrame'
import PerformanceMonitor from '../core/PerformanceMonitor'
import * as Outlier from './Outlier'

/**
 * SessionModel builds, once per data load, everything the admin UI
 * (Test tab, Results tab, right panel) derives per session: the row list,
 * the KPI factors, the task summaries and the replay lookups.
 *
 * The point of this class is price, not features. Before it existed, every
 * consumer (TestTab._getTestList, StudioDetails.setSummary,
 * AnalyticTaskList, ScatterPlot, SurveySection) re-ran the whole
 * analytics pipeline on its own: a JSON deep clone of all events, a sort,
 * a group, and 1-2 matcher passes (O(events x tasks)). With many sessions
 * that meant the same work was done 5-6 times per data load.
 * The model does it once:
 *
 * - one sort over a shallow copy (the caller's array is never reordered)
 * - one group
 * - one aggregation pass per session for all derived stats
 * - exactly two matcher passes: the task performance and the task starts
 *
 * Later calls (getRows, getTaskSummaries, ...) only merge in the session
 * annotations, which is cheap, so an annotation change does not need a
 * rebuild of the base data. Anything that mutates this model's arrays
 * corrupts other consumers, so treat it as read-only.
 *
 * Note: the event -> action filter used to live in core/Util.vue, which a
 * jest spec cannot import (.vue). The list is duplicated here on purpose;
 * keep both lists in sync.
 */
const ACTION_TYPES = [
    'ScreenClick',
    'WidgetClick',
    'WidgetChange',
    'ValidationError',
    'ValidationErrorLine',
    'ScreenLoaded',
    'OverlayLoaded',
    'OverlayRemoved',
    'ScreenGesture',
    'WidgetGesture'
]
const ACTION_TYPES_SET = new Set(ACTION_TYPES)
/** Subset of the action types that count as "interactions" (getSessionSummary). */
const INTERACTION_TYPES = new Set(['ScreenClick', 'WidgetClick', 'WidgetChange', 'ScreenGesture', 'WidgetGesture'])
/** Screen/overlay loads (getSessionSummary). */
const SCREEN_LOAD_TYPES = new Set(['ScreenLoaded', 'OverlayLoaded'])
const SESSION_START_TYPE = 'SessionStart'

export default class SessionModel {
    constructor (events, tasks) {
        this.analytics = new Analytics()
        this._tasks = tasks || []
        const sorted = (events || []).slice()
        new DataFrame(sorted).sortBy('time')
        this.sortedEvents = sorted

        PerformanceMonitor.start('SessionModel.build()')
        this.eventCount = sorted.length
        /** Time ordered action events (responsive to the matcher and the KPIs). */
        this.actionEvents = new DataFrame(sorted).select('type', 'in', ACTION_TYPES).data

        /** Every event of every session, grouped and time ordered (replay lookups). */
        this._eventsBySession = new DataFrame(sorted).groupBy('session').data

        /** One aggregation pass per session instead of ~6 passes. */
        this.sessions = []
        for (let sessionID in this._eventsBySession) {
            const base = this._scanSession(this._eventsBySession[sessionID], sessionID)
            base.id = this.sessions.length + 1
            this.sessions.push(base)
        }
        this.sessionCount = this.sessions.length

        /**
         * The two matcher passes. getRows() / getTaskSummaries() merge in
         * the annotations per call, so an annotation change is cheap and the
         * base data does not have to be rebuilt.
         */
        this.tasksPerformance = this.analytics.getTaskPerformance(new DataFrame(this.actionEvents), this._tasks)
        this.startPerformance = this.analytics.getTaskStarts(new DataFrame(this.actionEvents), this._tasks)
        PerformanceMonitor.end('SessionModel.build()', 1)
    }

    /**
     * Aggregates one session in a single pass: min/max over all and over
     * action events, screen/interaction counters, the SessionStart event
     * for label. This replaces min() + max() + find() + getActionEvents() +
     * unique() per session.
     */
    _scanSession (sessionDF, sessionID) {
        const data = sessionDF.data
        let minTime = Number.MAX_VALUE
        let maxTime = Number.MIN_VALUE
        let actionMin = Number.MAX_VALUE
        let actionMax = Number.MIN_VALUE
        let actions = 0
        let interactions = 0
        let screenLoads = 0
        let errors = 0
        let startEvent = null
        let user = '-'
        /** DataFrame.unique() counts the undefined key too, so keep that behavior. */
        const screens = new Set()
        const actionScreens = new Set()
        for (let i = 0; i < data.length; i++) {
            const e = data[i]
            const time = e.time
            if (time < minTime) {
                minTime = time
            }
            if (time > maxTime) {
                maxTime = time
            }
            const type = e.type
            if (ACTION_TYPES_SET.has(type)) {
                actions++
                if (time < actionMin) {
                    actionMin = time
                }
                if (time > actionMax) {
                    actionMax = time
                }
                actionScreens.add(e.screen)
                if (INTERACTION_TYPES.has(type)) {
                    interactions++
                }
                if (SCREEN_LOAD_TYPES.has(type)) {
                    screenLoads++
                }
                if (type === 'ValidationError') {
                    errors++
                }
            }
            screens.add(e.screen)
            if (!startEvent && type === SESSION_START_TYPE) {
                startEvent = e
            }
            if (i === 0) {
                user = e.user != null ? e.user : '-'
            }
        }
        return {
            session: sessionID,
            start: minTime === Number.MAX_VALUE ? 0 : minTime,
            end: maxTime === Number.MIN_VALUE ? 0 : maxTime,
            duration: Math.ceil((maxTime - minTime) / 1000),
            actionMin: actionMin === Number.MAX_VALUE ? 0 : actionMin,
            actionMax: actionMax === Number.MIN_VALUE ? 0 : actionMax,
            actions: actions,
            interactions: interactions,
            screenLoads: screenLoads,
            errors: errors,
            screens: screens.size,
            actionScreens: actionScreens.size,
            startEvent: startEvent,
            user: user,
            label: (startEvent && startEvent.label) ? startEvent.label : null
        }
    }

    /** The events of one session, as a DataFrame, time ordered (replay / annotation). */
    getSession (sessionID) {
        if (sessionID != null && this._eventsBySession[sessionID]) {
            return this._eventsBySession[sessionID]
        }
        return null
    }

    /**
     * The sessions that are not marked invalid. Annotation changes are cheap
     * and do not rebuild the model, so the call gets the current annotations.
     */
    getValidSessions (annotations) {
        const bad = this._getBadSessions(annotations)
        const result = []
        for (let i = 0; i < this.sessions.length; i++) {
            const session = this.sessions[i]
            if (!bad[session.session]) {
                result.push(session)
            }
        }
        return result
    }

    _getBadSessions (annotations) {
        const bad = {}
        if (!annotations) {
            return bad
        }
        for (let i = 0; i < annotations.length; i++) {
            const a = annotations[i]
            if (!a.isValid) {
                bad[a.reference] = true
            }
        }
        return bad
    }

    /** Valid, time ordered action events. This is the df the KPIs work on. */
    getValidActionEvents (annotations) {
        const bad = this._getBadSessions(annotations)
        const result = []
        const actionEvents = this.actionEvents
        for (let i = 0; i < actionEvents.length; i++) {
            const e = actionEvents[i]
            if (!bad[e.session]) {
                result.push(e)
            }
        }
        return result
    }

    /**
     * The valid sessions as rows for the session table. Annotation merge,
     * success counts and the html status strings exactly replicate
     * TestTab._getTestList(). The date column is left as the start stamp
     * because the table formats it with its own mixin.
     */
    getRows (annotations) {
        const tasks = this._tasks
        const merged = this.analytics.mergeAnnotations(this.tasksPerformance, annotations)
        const tasksBySession = merged.count('session')
        const taskNames = this.analytics.getSuccessTaskNames(merged, tasks)
        const bad = this._getBadSessions(annotations)
        const taskCount = tasks.length
        const rows = []
        let index = 1
        for (let i = 0; i < this.sessions.length; i++) {
            const session = this.sessions[i]
            const sessionID = session.session
            let isValid = true
            if (bad[sessionID]) {
                isValid = false
            }
            let taskSuccess = tasksBySession.get(sessionID)
            if (!taskSuccess) {
                taskSuccess = 0
            }
            rows.push({
                session: sessionID,
                user: (session.user && session.user.name) ? session.user.name : session.user,
                taskPerformance: taskSuccess + ' / ' + taskCount,
                taskNames: taskNames[sessionID],
                taskSuccess: taskSuccess,
                duration: session.duration,
                start: session.start,
                size: session.actions,
                status: isValid
                    ? '<span class="MatchDashStatusSuccess">Valid</span>'
                    : '<span class="MatchDashStatusFailure">Ignore</span>',
                isValid: isValid,
                id: index,
                label: session.label ? session.label : 'Test ' + index,
                screens: session.screens
            })
            index++
        }
        return rows
    }

    /**
     * KPI factors from the valid sessions. Same semantics as building the
     * KPIs from the valid action events: only sessions with action events
     * count, duration is the action event span (not the full event span!).
     */
    getSummaryFactors (annotations) {
        const bad = this._getBadSessions(annotations)
        let count = 0
        let durationSum = 0
        let durationSumSq = 0
        let actionSum = 0
        let actionSumSq = 0
        let screenSum = 0
        for (let i = 0; i < this.sessions.length; i++) {
            const session = this.sessions[i]
            if (bad[session.session] || session.actions === 0) {
                continue
            }
            const duration = session.actionMax - session.actionMin
            count++
            durationSum += duration
            durationSumSq += duration * duration
            actionSum += session.actions
            actionSumSq += session.actions * session.actions
            screenSum += session.actionScreens
        }
        const result = {
            sessionCount: count,
            durationMean: 0,
            durationStd: 0,
            actionsMean: 0,
            actionsStd: 0,
            screensMean: 0
        }
        if (count === 0) {
            return result
        }
        return {
            sessionCount: count,
            durationMean: durationSum / count,
            durationStd: this._std(durationSumSq, durationSum, count),
            actionsMean: actionSum / count,
            actionsStd: this._std(actionSumSq, actionSum, count),
            screensMean: screenSum / count
        }
    }

    /** Population std, matching DataFrame.variance()/std(). */
    _std (sumSq, sum, count) {
        const mean = sum * 1.0 / count
        return Math.sqrt((sumSq - (mean * sum)) * 1.0 / count)
    }

    /**
     * Task summaries (per task: starts, success, duration ...). These need
     * the valid action events as df, otherwise the annotated-invalid
     * sessions would be counted.
     */
    getTaskSummaries (annotations) {
        const df = new DataFrame(this.getValidActionEvents(annotations))
        return this.analytics.getTaskSummary(df, this._tasks, annotations, {
            tasksPerformance: this.getValidTasksPerformance(annotations),
            startPerformance: this.getValidStartPerformance(annotations)
        })
    }

    /** Raw (not annotation merged) task performance rows of the valid sessions. */
    getValidTasksPerformance (annotations) {
        const bad = this._getBadSessions(annotations)
        const list = []
        const data = this.tasksPerformance.data
        for (let i = 0; i < data.length; i++) {
            const row = data[i]
            if (!bad[row.session]) {
                list.push(row)
            }
        }
        return new DataFrame(list)
    }

    getValidStartPerformance (annotations) {
        const bad = this._getBadSessions(annotations)
        const list = []
        const data = this.startPerformance.data
        for (let i = 0; i < data.length; i++) {
            const row = data[i]
            if (!bad[row.session]) {
                list.push(row)
            }
        }
        return new DataFrame(list)
    }

    /**
     * The per session details the distribution scatter plot renders. Since
     * a plot with a point per session does not get more exact beyond a few
     * thousand points, sessions are stride sampled. The cluster flags are
     * index aligned with the sampled sessions, so the sampling happens
     * before the cluster call in the plot, never after.
     *
     * options.version is not used by the model: it exists so Vue computed
     * properties calling this built a real reactive dependency, because
     * annotations can be edited in place (no reference change) and the
     * details have to be recomputed anyway.
     */
    getSessionDetails (annotations, options = {}) {
        const df = new DataFrame(this.getValidActionEvents(annotations))
        const perfData = this.getValidTasksPerformance(annotations).data
        let details = this.analytics.getSessionDetails(df, this._tasks, perfData)
        details = Outlier.addWeirdness(details, df)
        const maxPoints = options.maxPoints || 2000
        if (details.data.length > maxPoints) {
            const stride = Math.ceil(details.data.length / maxPoints)
            const sampled = details.data.filter((row, i) => i % stride === 0)
            return new DataFrame(sampled)
        }
        return details
    }
}
