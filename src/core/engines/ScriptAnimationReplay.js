import Logger from '../Logger'
import ModelUtil from '../ModelUtil'

/**
 * Turns the animations a ScriptEffect event recorded back into the style of
 * every frame of the replay.
 *
 * The VideoPlayer is a scrubber, not a clock: it renders one frame for a
 * timestamp from a lookup table built once per session, and nothing is running
 * in the background that could advance an animation. So the timeline cannot be
 * driven the way it is live, by ScriptAnimations handing a tween to the
 * animation engine. It has to be precomputed, slot by slot, which is what this
 * module describes: what one animation looks like at one moment.
 *
 * Plain JS on purpose. VideoPlayer.vue is a .vue file, which this jest config
 * cannot import, so anything worth testing has to sit on this side of the
 * boundary.
 *
 * Display is part of every frame and not left to opacity alone:
 * _set_opacity (RenderFactory.js) adds MatcHidden at exactly zero and only
 * touches the node when the key is present, so a frame that dropped opacity
 * would leave a stale inline value behind, and a widget that is faded in has
 * to become display:block before anything can be seen of it.
 */

/**
 * The animations carried by one recorded event, or [] for an event that has
 * none. Recordings made before animations were recorded have no field at all
 * and replay exactly as they did before.
 */
export function getEventAnimations (event) {
    if (!event || event.type !== 'ScriptEffect') {
        return []
    }
    const state = event.state
    if (!state || state.type !== 'script' || !state.value) {
        return []
    }
    return Array.isArray(state.value.animations) ? state.value.animations : []
}

/**
 * One schedule per animated widget: [{id, animation, duration, delay}].
 *
 * The fan out mirrors applyGroupAnimation() (ScriptAnimations.js), including
 * the ordering, the flattening of sub groups and the staggering by the child's
 * index in the group. Children that are missing from the model are dropped but
 * keep their place in the count, so the delays of the ones after them do not
 * shift.
 *
 * A delta with no order was recorded before QGroup.animate() wrote one, and has
 * to keep the declaration order it was made with rather than pick up the screen
 * order a newer API defaults to. Same for a delta with no delay, which is 0 and
 * not an error. Same helper, same fallbacks, so the live run and the replay
 * cannot drift apart.
 *
 * Unknown animations are skipped for a widget, because applyWidgetAnimation()
 * refuses to run them either. A group is different: applyGroupAnimation()
 * falls through to fadeIn for anything it does not know, so the replay fades
 * in as well rather than showing something the live run did not.
 */
export function expandAnimations (model, animations) {
    const schedules = []
    const widgets = model && model.widgets ? model.widgets : null
    ;(animations || []).forEach(change => {
        if (!change) {
            return
        }
        const duration = toNumber(change.duration, 0)
        const step = toNumber(change.step, 0)

        if (change.type === 'GroupAnimation') {
            const group = model && model.groups ? model.groups[change.id] : null
            if (!group) {
                Logger.warn('ScriptAnimationReplay > no group with id ' + change.id)
                return
            }
            const children = ModelUtil.getOrderedGroupChildren(group, model, change.order)
            const staggered = change.animation === 'reveal' || change.animation === 'typewriter'
            /**
             * The delay before the whole animation, added to the stagger, which
             * is what applyGroupAnimation() does with it.
             */
            const before = toNumber(change.delay, 0)
            children.forEach((id, index) => {
                if (!widgets || !widgets[id]) {
                    return
                }
                schedules.push({
                    id: id,
                    animation: change.animation,
                    duration: duration,
                    delay: before + (staggered ? index * step : 0)
                })
            })
            return
        }

        if (change.type !== 'WidgetAnimation') {
            return
        }
        if (!widgets || !widgets[change.id]) {
            return
        }
        if (!isWidgetAnimation(change.animation)) {
            Logger.warn('ScriptAnimationReplay > unknown widget animation ' + change.animation)
            return
        }
        schedules.push({
            id: change.id,
            animation: change.animation,
            duration: duration,
            /**
             * The delay before the whole animation, which for a single element
             * is all there is: there is no stagger to add to it.
             */
            delay: toNumber(change.delay, 0)
        })
    })
    return schedules
}

/**
 * The style of one animation at `elapsed` milliseconds after it started.
 *
 * `orgStyle` is the widget's style the player seeded the slot map with, merged
 * in under the animated keys so a fade never drops a background or a border
 * the widget carries. The result is a fresh object every call, because the
 * player stamps a new _aid on each frame and compares that to decide whether
 * the frame has to be written to the DOM at all.
 */
export function getFrameStyle (elapsed, schedule, orgStyle) {
    const base = orgStyle || {}
    const p = getProgress(elapsed, schedule)
    if (schedule.animation === 'fadeOut') {
        if (p >= 1) {
            return Object.assign({}, base, { display: 'none', opacity: 0 })
        }
        /**
         * display:block for as long as it fades, because the recorded
         * widgetChange says display:none from the very event the fade was
         * triggered by, and without this the element would be gone before the
         * first frame of the fade.
         */
        return Object.assign({}, base, { display: 'block', opacity: 1 - p })
    }
    return Object.assign({}, base, { display: 'block', opacity: p })
}

/**
 * The style the widget keeps once the animation is over.
 *
 * One object for all the slots after the end, so it is written to the DOM once
 * and then leaves the frame alone: a script that hides the widget afterwards
 * has to win, and it does, because its recorded widgetChange is applied on
 * every frame while this style is only applied when its _aid changes.
 */
export function getEndStyle (schedule, orgStyle) {
    return getFrameStyle(schedule.delay + schedule.duration, schedule, orgStyle)
}

/**
 * How far into the animation we are, from 0 to 1. The same arithmetic as
 * Animation.getP() (Animation.js), which is what the live engine runs, minus
 * the easing the script API cannot ask for. A duration of zero is not a
 * division waiting to happen: it renders the end value in a single frame, which
 * is what the live engine does with an unset duration.
 */
function getProgress (elapsed, schedule) {
    if (schedule.duration <= 0) {
        return 1
    }
    if (elapsed <= schedule.delay) {
        return 0
    }
    return Math.min(1, (elapsed - schedule.delay) / schedule.duration)
}

function isWidgetAnimation (animation) {
    return animation === 'fadeIn' || animation === 'fadeOut' || animation === 'typewriter'
}

/**
 * A millisecond count out of a delta, or the fallback when it is not usable.
 *
 * Everything this reads is a "milliseconds, zero or more" option, so a negative
 * is as unusable as a NaN and is dropped for the same reason. Keeping it would
 * make the delay push getProgress() past its own progress and render the end
 * value in a single frame, and, worse, would leave the replay disagreeing with
 * the live run: ScriptAnimations.getDelay() clamps a negative to zero, so a
 * delta that kept it here would play back a sequence the live run never had.
 */
function toNumber (value, fallback) {
    const number = value * 1
    if (!isFinite(number) || number < 0) {
        return fallback
    }
    return number
}
