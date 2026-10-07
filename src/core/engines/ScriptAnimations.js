import Logger from '../Logger'
import ModelUtil from '../ModelUtil'
import { resolveTypewriterDuration } from '../widgets/LabelAnimationUtil'

/**
 * Runs the animations a script asked for.
 *
 * A script cannot drive an animation itself. It runs in a Web Worker with no
 * DOM, and every delta it produces is applied in one synchronous pass on the
 * main thread (ScriptMixin.renderAppChanges), so a script that tried to step
 * through twenty opacity values would simply apply the last one, in one frame.
 * The worker also posts a single message when the script settles, so there is
 * no channel to stream intermediate values over at all.
 *
 * So animate() records what was asked for, and this module carries it out on the
 * main thread with the animation engine the widgets already use for hover and
 * for validation error labels.
 *
 * Plain JS on purpose. AnimationMixin.vue drives the same engine but is a .vue
 * file, which this jest config cannot import, so anything worth testing has to
 * live on this side of the boundary.
 *
 * Note which accessor is used to reach a widget. RenderFactory keeps two
 * registries: class based widgets (Label, TextBox) are in _uiWidgets, while the
 * pure DOM ones (Button, Box, Image, Icon) only ever get a div in _widgetNodes.
 * getUIWidgetByID() looks in _uiWidgets alone, so it answers "no widget" for a
 * Box and the element looks like it is on another screen when it is right there
 * on this one. getAnimationWrapper() handles both, synthesising a UIWidget
 * around the plain div, and is what the screen animations already use. Using the
 * wrong one meant every pure DOM widget silently fell back to the instant
 * change and never faded at all.
 */

/**
 * Whether this delta is ours to run rather than to merge into the model.
 *
 * Kept next to applyScriptAnimation so the two cannot drift apart.
 */
export function isScriptAnimation (change) {
    return change.type === 'WidgetAnimation' || change.type === 'GroupAnimation'
}

/**
 * The animation deltas of a run, in the order the script asked for them.
 *
 * They are recorded inside the ScriptEffect event so a replay can run them
 * again. Nothing else carries them: a worker delta never reaches the model,
 * and without this filter logScriptEffect() would not even write an event for
 * a script that only animates.
 */
export function collectScriptAnimations (appDeltas) {
    return (appDeltas || []).filter(change => isScriptAnimation(change))
}

/**
 * What this run changed on widgets, in the order it changed it.
 *
 * Two kinds of change, in one list, because the order is the record: the style
 * and prop deltas the worker produced, and the display writes the animations
 * do to the model themselves.
 *
 * The display writes cannot be read back from the model. fadeIn and typewriter
 * put display:block on the widget before the tween starts (writeStyle()),
 * fadeOut puts display:none on it once the tween has ended (the onEnd
 * callback), and that one has not run when the event is logged. They are also
 * not deltas: nothing in the worker ever asked for them, so this is the only
 * place they can be recorded. Without them a replay would render the widget
 * from the unmutated model and show an element the live run had hidden, or
 * keep one the live run had revealed.
 *
 * Kept next to applyWidgetAnimation() and applyGroupAnimation() so the show
 * and hide rules cannot drift apart from the animations they belong to.
 */
export function getWidgetChanges (model, appDeltas) {
    const changes = []
    ;(appDeltas || []).forEach(change => {
        if (!change) {
            return
        }
        if (change.type === 'Widget' && change.id && (change.key === 'style' || change.key === 'props')) {
            changes.push({
                id: change.id,
                key: change.key,
                value: change.key === 'style' ? change.style : change.props
            })
            return
        }
        const displayChanges = getAnimationDisplayChanges(model, change)
        for (let i = 0; i < displayChanges.length; i++) {
            changes.push(displayChanges[i])
        }
    })
    return changes
}

/**
 * What one animation delta leaves on the model, one change per widget. Empty
 * when it leaves nothing: unknown animations have no display rule for a single
 * element, because applyWidgetAnimation() schedules nothing for them.
 *
 * A group is different: applyGroupAnimation() falls through to fadeIn, and its
 * fallback for a child on another screen is the same, so every child ends up
 * display:block unless it was a fadeOut.
 */
function getAnimationDisplayChanges (model, change) {
    if (!isScriptAnimation(change)) {
        return []
    }
    let display = null
    if (change.type === 'GroupAnimation') {
        display = change.animation === 'fadeOut' ? 'none' : 'block'
    } else if (change.animation === 'fadeIn' || change.animation === 'typewriter') {
        display = 'block'
    } else if (change.animation === 'fadeOut') {
        display = 'none'
    }
    if (!display) {
        return []
    }

    const widgets = model && model.widgets ? model.widgets : null
    const ids = []
    if (change.type === 'GroupAnimation') {
        const group = model && model.groups ? model.groups[change.id] : null
        if (!group) {
            return []
        }
        /**
         * The same fan out as applyGroupAnimation(), including the ordering and
         * the flattening of sub groups, so what is recorded matches what was
         * animated.
         */
        ModelUtil.getOrderedGroupChildren(group, model, change.order).forEach(id => ids.push(id))
    } else {
        ids.push(change.id)
    }

    /**
     * Children that are not in the model were never written to either:
     * writeStyle() warns and returns for them.
     */
    return ids
        .filter(id => widgets && widgets[id])
        .map(id => ({ id: id, key: 'style', value: { display: display } }))
}

/**
 * Apply a delta if it is one of ours. Returns what was scheduled, or null.
 *
 * Anything else is left alone for ScriptToModel to merge into the model.
 */
export function applyScriptAnimation (model, renderFactory, animationFactory, change) {
    if (change.type === 'WidgetAnimation') {
        return applyWidgetAnimation(model, renderFactory, animationFactory, change)
    }
    if (change.type === 'GroupAnimation') {
        return applyGroupAnimation(model, renderFactory, animationFactory, change)
    }
    return null
}

export function applyWidgetAnimation (model, renderFactory, animationFactory, change) {
    if (change.animation === 'fadeIn') {
        return fadeIn(model, renderFactory, animationFactory, change.id, change.duration, 0)
    }
    if (change.animation === 'fadeOut') {
        return fadeOut(model, renderFactory, animationFactory, change.id, change.duration)
    }
    if (change.animation === 'typewriter') {
        /**
         * A single element, so there is nothing to stagger and a label types
         * while anything else just fades in.
         */
        return typewriter(model, renderFactory, animationFactory, change.id, change.duration, 0)
    }
    Logger.warn('ScriptAnimations > unknown widget animation ' + change.animation)
    return []
}

/**
 * Type a label's text out, or fade in anything that has no text to type.
 *
 * Detected by capability rather than by type, so a widget that grows a text
 * animation later joins on its own. Label is the only one today.
 */
function typewriter (model, renderFactory, animationFactory, id, duration, delay) {
    /**
     * A hidden label has no box to type into either, so the display write comes
     * first for both kinds.
     */
    writeStyle(model, renderFactory, id, { display: 'block' })

    const uiWidget = renderFactory.getAnimationWrapper(id)
    if (!uiWidget) {
        Logger.warn('ScriptAnimations > cannot animate, not on the current screen: ' + id)
        return [{ id: id, animation: 'typewriter', animated: false }]
    }

    if (typeof uiWidget.startChatAnimation === 'function') {
        const widget = model.widgets ? model.widgets[id] : null
        /**
         * The text is whatever the label currently shows, so a label bound to a
         * value types that value. The script's duration covers the typing as
         * well as the fade, so one number means the same wall clock time for
         * both. It has to be converted into the label's own rate, which depends
         * on how much there is to type. Without a duration from the script the
         * label's own setting wins.
         */
        const text = uiWidget.getValue()
        uiWidget.startChatAnimation(text, resolveTypewriterDuration(text, duration, widget), delay)
        return [{ id: id, animation: 'typewriter', duration: duration, delay: delay, typed: true }]
    }

    return fadeIn(model, renderFactory, animationFactory, id, duration, delay)
}

/**
 * Animate a group.
 *
 * A group has no DOM node of its own: model.groups[id].children are ids whose
 * widgets are siblings in the screen, so there is nothing to wipe or clip and
 * the only thing to animate is each child. Every animation is therefore the same
 * fan out, and only the per child delay differs:
 *
 *   fadeIn     delay 0
 *   fadeOut    no delay, and each child ends hidden
 *   reveal     delay of index * step, everything fades up
 *   typewriter same as reveal, but a label types its text instead of fading
 *
 * The index is into the children in the order the delta asks for, which
 * QGroup.animate() sets and ModelUtil.getOrderedGroupChildren() resolves: screen
 * order by default, so a reveal reads top to bottom the way the group looks,
 * and the declaration order of model.groups[id].children on request. It is not
 * the z order, which says what covers what and is changed for layering.
 *
 * A nested group cannot be reached: QScreen.getGroup() only returns a group
 * whose children are all direct children of the screen, so one containing a sub
 * group is not addressable from a script at all. getOrderedGroupChildren is used
 * anyway, which is what Controller/Group.js does, so the order is either the
 * model's declaration order or the screen order the author can see, never
 * anything derived here.
 */
export function applyGroupAnimation (model, renderFactory, animationFactory, change) {
    const group = model.groups ? model.groups[change.id] : null
    if (!group) {
        Logger.warn('ScriptAnimations > no group with id ' + change.id)
        return []
    }

    /**
     * Sorted before the loop below, not inside it, so that a child which is not
     * on the current screen still consumes its place in the stagger.
     */
    const children = ModelUtil.getOrderedGroupChildren(group, model, change.order)
    const scheduled = []
    const missing = []
    const hiding = change.animation === 'fadeOut'
    const typing = change.animation === 'typewriter'
    const staggered = change.animation === 'reveal' || typing

    for (let i = 0; i < children.length; i++) {
        const id = children[i]
        if (!renderFactory.getAnimationWrapper(id)) {
            missing.push(id)
            continue
        }
        const delay = staggered ? i * change.step : 0
        if (hiding) {
            scheduled.push.apply(scheduled, fadeOut(model, renderFactory, animationFactory, id, change.duration))
        } else if (typing) {
            scheduled.push.apply(scheduled, typewriter(model, renderFactory, animationFactory, id, change.duration, delay))
        } else {
            scheduled.push.apply(scheduled, fadeIn(model, renderFactory, animationFactory, id, change.duration, delay))
        }
    }

    if (missing.length > 0) {
        /**
         * Only the widgets of the rendered screen have a wrapper. clearUiWidgets
         * empties _uiWidgets, _widgetNodes and _widgetModels together, so a widget
         * on another screen has none of the three and cannot be animated.
         */
        Logger.warn('ScriptAnimations > cannot animate, not on the current screen: ' + missing.join(', '))
        const display = hiding ? 'none' : 'block'
        for (let i = 0; i < missing.length; i++) {
            writeStyle(model, renderFactory, missing[i], { display: display })
        }
    }

    return scheduled
}

/**
 * Fade up to visible.
 *
 * The display write happens first and synchronously, because an element that is
 * still display:none has no box to paint and nothing to fade. opacity is
 * deliberately kept out of the model: _set_opacity adds MatcHidden, which is
 * display:none, whenever the interpolated value is exactly 0, and a model that
 * carried opacity:0 would re-hide the element on every re-render.
 */
function fadeIn (model, renderFactory, animationFactory, id, duration, delay) {
    writeStyle(model, renderFactory, id, { display: 'block' })

    const uiWidget = renderFactory.getAnimationWrapper(id)
    if (!uiWidget) {
        Logger.warn('ScriptAnimations > cannot animate, not on the current screen: ' + id)
        return [{ id: id, animation: 'fadeIn', duration: duration, delay: delay, animated: false }]
    }

    return run(animationFactory, uiWidget, {
        id: id,
        animation: 'fadeIn',
        from: { style: { opacity: 0 } },
        to: { style: { opacity: 1 } },
        duration: duration,
        delay: delay
    })
}

/**
 * Fade down to hidden.
 *
 * _set_opacity adds MatcHidden on the last frame, when the interpolated opacity
 * reaches exactly 0, so the element goes display:none for free. The model is
 * only updated in onEnd, once that has happened, so isHidden(), toggle() and
 * the exported CSS stay in step with what the user sees.
 */
function fadeOut (model, renderFactory, animationFactory, id, duration) {
    const uiWidget = renderFactory.getAnimationWrapper(id)
    if (!uiWidget) {
        Logger.warn('ScriptAnimations > cannot animate, not on the current screen: ' + id)
        writeStyle(model, renderFactory, id, { display: 'none' })
        return [{ id: id, animation: 'fadeOut', duration: duration, animated: false }]
    }

    return run(animationFactory, uiWidget, {
        id: id,
        animation: 'fadeOut',
        from: { style: { opacity: 1 } },
        to: { style: { opacity: 0 } },
        duration: duration,
        delay: 0
    }, function () {
        writeStyle(model, renderFactory, id, { display: 'none' })
    })
}

/**
 * Start one tween.
 *
 * The event is built with an explicit from rather than left to
 * RenderFactory.createWidgetAnimation, which overwrites from.style with the
 * widget's current animated style. An unspecified value is then filled in from
 * Animation._defaultAnimValues, where opacity is 1, so a fade in would
 * interpolate 1 to 1 and do nothing at all. A fade out survives that default
 * by luck, not by design.
 */
function run (animationFactory, uiWidget, event, onEnd) {
    const anim = animationFactory.createWidgetAnimation(uiWidget, event)
    if (!anim) {
        return [{ id: event.id, animation: event.animation, animated: false }]
    }
    if (onEnd) {
        anim.onEnd(onEnd)
    }
    anim.run()
    return [{
        id: event.id,
        animation: event.animation,
        duration: event.duration,
        delay: event.delay,
        animated: true
    }]
}

/**
 * A shallow style merge plus a re-render, which is what ScriptToModel does for
 * a setStyle delta. The animation deltas need the same thing for their display
 * write but must not go through that module, which only knows Widget and Screen.
 */
function writeStyle (model, renderFactory, id, delta) {
    const element = model.widgets ? model.widgets[id] : null
    if (!element) {
        Logger.warn('ScriptAnimations > no widget with id ' + id)
        return
    }
    if (!element.style) {
        element.style = {}
    }
    for (const key in delta) {
        element.style[key] = delta[key]
    }
    renderFactory.updateWidget(element)
}
