import lang from '../../dojo/_base/lang'
import { getEventAnimations, expandAnimations, getFrameStyle } from './ScriptAnimationReplay'

const STEP = 30
const slot = t => Math.max(0, t - (t % STEP))

// A range assignment splits only the affected intervals, never the empty time
// between events. Later recorded operations overwrite earlier ones.
function assign (ranges, start, end, value) {
    if (end <= start) return
    let lo = 0
    let hi = ranges.length
    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (ranges[mid].end <= start) lo = mid + 1
        else hi = mid
    }
    const first = lo
    while (lo < ranges.length && ranges[lo].start < end) lo++
    const replacement = []
    if (first < ranges.length && ranges[first].start < start) {
        replacement.push({ start: ranges[first].start, end: start, value: ranges[first].value })
    }
    replacement.push({ start, end, value })
    if (lo > first && ranges[lo - 1].end > end) {
        replacement.push({ start: end, end: ranges[lo - 1].end, value: ranges[lo - 1].value })
    }
    ranges.splice(first, lo - first, ...replacement)
}

function at (ranges, time) {
    let lo = 0
    let hi = ranges.length
    while (lo < hi) {
        const mid = (lo + hi) >>> 1
        if (ranges[mid].start <= time) lo = mid + 1
        else hi = mid
    }
    return lo ? ranges[lo - 1].value : null
}

/** Sparse counterpart of the player's former per-30ms animation table. */
export default class ReplayAnimationIndex {
    constructor (events, model, min, duration, factory, absolutePosition, schedules) {
        this.widgets = {}
        this.factory = factory
        this.options = { events, model, min, duration, factory, absolutePosition, schedules }
    }

    async build (isCancelled = () => false) {
        const { events, model, min, duration, factory, absolutePosition, schedules } = this.options
        let nextID = 0
        let lastScreenLoad = 0
        const resumedStyles = {}
        const init = id => {
            if (!this.widgets[id]) {
                const style = Object.assign({}, lang.clone(model.widgets[id].style), { _aid: `original-${id}`, _org: true })
                const pos = { x: 0, y: 0, w: 0, h: 0, start: true, _aid: `original-pos-${id}`, _org: true }
                this.widgets[id] = {
                    originalStyle: style, originalPos: pos, lastStyle: style,
                    styles: [{ start: 0, end: Infinity, value: () => style }],
                    positions: [{ start: 0, end: Infinity, value: () => pos }]
                }
            }
            return this.widgets[id]
        }
        for (let i = 0; i < events.length; i++) {
            if (i && i % 1000 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0))
                if (isCancelled()) return false
            }
            const event = events[i]
            const start = slot(event.time - min)
            if (event.type === 'ScreenLoaded' || event.type === 'OverlayLoaded') {
                for (const id in this.widgets) {
                    const widget = this.widgets[id]
                    const style = resumedStyles[id] || widget.originalStyle
                    assign(widget.styles, start, Infinity, () => style)
                    assign(widget.positions, start, Infinity, () => widget.originalPos)
                    widget.lastStyle = style
                }
                lastScreenLoad = start
            }
            if (event.type === 'Animation' && event.animation && model.widgets[event.animation.id]) {
                const animation = event.animation
                const widget = init(animation.id)
                const startTime = animation.triggerType === 'ScreenLoaded' ? lastScreenLoad : start
                const end = Math.min(duration, startTime + (animation.duration || 0) + 60)
                const fromPos = animation.from.pos && absolutePosition(event.screen, animation.from.pos)
                const toPos = animation.to.pos && absolutePosition(event.screen, animation.to.pos)
                const base = widget.lastStyle
                const id = nextID++
                const frame = time => {
                    const elapsed = time - start
                    let p = 1
                    if (animation.duration > 0) {
                        p = animation.delay ? factory.getP(elapsed, animation.delay, animation.duration) : Math.min(1, elapsed / animation.duration)
                    }
                    const mixed = factory.getAnimationMixedStyle(animation.from.style, animation.to.style, p)
                    for (const key in base) if (mixed[key] === undefined) mixed[key] = base[key]
                    const finalSlot = slot(start + (animation.delay || 0) + (animation.duration || 0) + STEP - 1)
                    mixed._aid = `animation-${id}-${Math.min(time, finalSlot)}`
                    mixed._org = false
                    return mixed
                }
                assign(widget.styles, startTime, end, frame)
                if (fromPos && toPos) {
                    assign(widget.positions, startTime, end, time => {
                        const elapsed = time - start
                        const p = animation.duration > 0
                            ? (animation.delay ? factory.getP(elapsed, animation.delay, animation.duration) : Math.min(1, elapsed / animation.duration)) : 1
                        return Object.assign(factory.getAnimationMixedPos(fromPos, toPos, p), { _aid: `pos-${id}-${time}`, _org: false })
                    })
                }
                if (startTime < duration) {
                    // The old builder also computed the first slot at or beyond
                    // end before breaking, and used it as the next animation's base.
                    const last = Math.min(slot(duration - 1), slot(end + STEP - 1))
                    widget.lastStyle = frame(last)
                }
            }
            if (event.type === 'ScriptEffect') {
                const list = event.id && schedules && schedules[event.id]
                    ? schedules[event.id] : expandAnimations(model, getEventAnimations(event))
                const animatedIDs = new Set(list.map(schedule => schedule.id))
                const changes = event.state && event.state.value && event.state.value.widgetChanges || []
                changes.forEach(change => {
                    if (!change || change.key !== 'style' || !change.value || !resumedStyles[change.id] || animatedIDs.has(change.id)) return
                    const widget = init(change.id)
                    const style = Object.assign({}, resumedStyles[change.id], change.value)
                    if (Object.prototype.hasOwnProperty.call(change.value, 'display') &&
                        !Object.prototype.hasOwnProperty.call(change.value, 'opacity')) {
                        style.opacity = widget.originalStyle.opacity != null ? widget.originalStyle.opacity : 1
                    }
                    style._aid = `resume-change-${nextID++}`
                    style._org = false
                    resumedStyles[change.id] = style
                    assign(widget.styles, start, Infinity, () => style)
                    widget.lastStyle = style
                })
                const wasResumedIDs = new Set(Object.keys(resumedStyles))
                for (const schedule of list) {
                    if (!model.widgets[schedule.id]) continue
                    const wasResumed = wasResumedIDs.has(schedule.id)
                    delete resumedStyles[schedule.id]
                    const widget = init(schedule.id)
                    const id = nextID++
                    const end = start + schedule.delay + schedule.duration
                    const frame = time => {
                        const style = getFrameStyle(time - start, schedule, widget.originalStyle)
                        style._aid = time >= end ? `script-${id}-end` : `script-${id}-${time}`
                        style._org = false
                        return style
                    }
                    assign(widget.styles, start, Infinity, frame)
                    widget.lastStyle = frame(Math.max(start, slot(duration - 1)))
                    if (wasResumed) {
                        // Widget changes contain both animation display writes and
                        // explicit writes, in script order. A conflicting write
                        // after the animation owns the restored frame.
                        const relevant = changes.filter(change => change && change.id === schedule.id && change.key === 'style' && change.value)
                        const display = schedule.animation === 'fadeOut' ? 'none' : 'block'
                        let marker = -1
                        relevant.forEach((change, index) => {
                            if (Object.keys(change.value).length === 1 && change.value.display === display) marker = index
                        })
                        const later = marker < 0 ? [] : relevant.slice(marker + 1)
                        if (later.some(change => Object.prototype.hasOwnProperty.call(change.value, 'display') ||
                            Object.prototype.hasOwnProperty.call(change.value, 'opacity'))) {
                            const style = Object.assign({}, widget.lastStyle)
                            later.forEach(change => {
                                Object.assign(style, change.value)
                                if (Object.prototype.hasOwnProperty.call(change.value, 'display') &&
                                    !Object.prototype.hasOwnProperty.call(change.value, 'opacity')) {
                                    style.opacity = widget.originalStyle.opacity != null ? widget.originalStyle.opacity : 1
                                }
                            })
                            style._aid = `resume-change-${nextID++}`
                            style._org = false
                            resumedStyles[schedule.id] = style
                            assign(widget.styles, start, Infinity, () => style)
                            widget.lastStyle = style
                        }
                    }
                }
            }
            if (event.type === 'SessionResume' && event.state && event.state.type === 'resume' && event.state.value) {
                const snapshot = event.state.value
                const changes = snapshot.scriptChanges || []
                for (const effect of snapshot.animationEffects || []) {
                    if (!effect || !model.widgets[effect.id]) continue
                    const widget = init(effect.id)
                    const style = Object.assign({}, widget.originalStyle)
                    changes.forEach(change => {
                        if (change.id === effect.id && change.key === 'style') Object.assign(style, change.value)
                    })
                    // Replacing an earlier fade must also clear its transient
                    // opacity when the later script only changed display.
                    style.opacity = effect.opacity != null ? effect.opacity :
                        style.opacity != null ? style.opacity : 1
                    style._aid = `resume-${nextID++}`
                    style._org = false
                    assign(widget.styles, start, Infinity, () => style)
                    resumedStyles[effect.id] = style
                    widget.lastStyle = style
                }
            }
        }
        this.options = null
        return true
    }

    get (time) {
        const t = slot(time)
        const result = {}
        for (const id in this.widgets) {
            const widget = this.widgets[id]
            result[id] = { style: at(widget.styles, t)(t), pos: at(widget.positions, t)(t) }
        }
        return result
    }
}
