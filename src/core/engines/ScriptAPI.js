import Logger from '../Logger'

/**
 * The animations a script can ask for, per element kind.
 *
 * "typewriter" types a label's text out instead of fading it in, and falls back
 * to fadeIn on anything that has no text to type. It relies on the chat
 * animation Label already ships for its "Animated Label" palette entry, which
 * steps the text itself rather than clipping a box, so it wraps like normal
 * text.
 *
 * Nothing here can be content driven. A script runs in a worker and posts a
 * single message when it settles, so intermediate values never reach the main
 * thread and a reveal of whatever arrived cannot be expressed.
 */
const WIDGET_ANIMATIONS = ['fadeIn', 'fadeOut', 'typewriter']
const GROUP_ANIMATIONS = ['fadeIn', 'fadeOut', 'reveal', 'typewriter']

/**
 * The orders a group animates its children in.
 *
 * 'screen' is top to bottom and then left to right, which is how the group reads
 * on the screen. 'model' is the order model.groups[id].children declares them
 * in, the order they were added to the group, which nothing on the canvas shows
 * or lets you change.
 *
 * Resolved by ModelUtil.getOrderedGroupChildren(), and recorded on the delta so
 * that a recording keeps the order it was made with.
 */
const GROUP_ORDERS = ['model', 'screen']

/**
 * Explicit on every delta, never left to the animation engine.
 * Animation.defaultAnimationDuration is read in createAnimation() and in
 * Css3Animation, but assigned nowhere, so it is undefined, and run() then takes
 * its zero duration branch and renders the end value in a single frame.
 */
const DEFAULT_DURATION = 300
const DEFAULT_STEP = 60
const DEFAULT_GROUP_ORDER = 'screen'

/**
 * No delay unless one is asked for, so that an animation with no delay behaves
 * exactly as it did before delay was an option.
 */
const DEFAULT_DELAY = 0

/**
 * One of the three millisecond options a script can ask for, resolved to a
 * number: duration, step and delay all mean the same kind of thing.
 *
 * Coerced rather than type checked, because a script usually builds its options
 * out of data bindings and a number can arrive as '300'. Throws once the value
 * is coerced and is still not usable, because the alternative is worse than a
 * script error: an unusable duration becomes NaN in Animation.getP() and the
 * tween silently renders its end value in a single frame, which reads as "the
 * animation did nothing" and gives the script author nothing to go on.
 *
 * Zero is allowed and means something, it is the snap that Animation.run() and
 * LabelAnimationUtil.toDuration() already take, so it is not treated as missing.
 *
 * This is the strict half of the pair. The lenient half lives where recorded
 * deltas are read back: ScriptAnimations.getDelay() and
 * ScriptAnimationReplay.toNumber(), because a recording made before an option
 * existed carries no value to reject. Strict at the authoring boundary, lenient
 * at the playback boundary.
 */
function numberOption (opts, key, fallback) {
    const value = opts[key] != null ? opts[key] : fallback
    const number = value * 1
    if (!isFinite(number) || number < 0) {
        throw new Error(`Invalid ${key} "${value}". Use a number of milliseconds, zero or more.`)
    }
    return number
}

class QModel {

    constructor (model, api, type) {
        this.qModel = model
        this.api = api
        this.type = type
    }

    getName() {
        return this.qModel.name
    }

    setStyle(newStyleDelta) {
        this.api.appDeltas.push({
            type: this.type,
            key: 'style',
            id: this.qModel.id,
            style: newStyleDelta
        })
    }

    setProp(newStyleDelta) {
        this.api.appDeltas.push({
            type: this.type,
            id: this.qModel.id,
            key: 'props',
            props: newStyleDelta
        })
    }

    hide () {
        this.setStyle({display: 'none'})
    }

    isHidden () {
        return this?.qModel?.style?.display === 'none'
    }

    show () {
        this.setStyle({display: 'block'})
    }

    toggle () {
        if (this.isHidden()) {
            this.show();
        } else {
            this.hide();
        }
    }

    /**
     * Animate this element. "fadeIn" ends visible, "fadeOut" ends hidden, so an
     * animation is the slow version of show()/hide() rather than a separate
     * effect. "typewriter" types a label's text out, and falls back to fadeIn on
     * anything without text to type.
     *
     * "duration" is how long the animation takes and "delay" how long after this
     * call it starts, both in milliseconds. There is no "step" here, because a
     * single element has nothing to stagger against, and an unknown option is
     * ignored rather than rejected.
     *
     * This is a delta and not a style write on purpose: the main thread has to
     * drive it, because a script runs in a worker with no DOM and every delta is
     * applied in one synchronous pass. The delay is no exception to that, it
     * simply lands on the delta and the animation engine waits it out on the
     * main thread, where the DOM is.
     */
    animate (animation, options) {
        if (this.type !== 'Widget') {
            throw new Error(`animate() is not supported on a ${this.type.toLowerCase()}.`)
        }
        if (WIDGET_ANIMATIONS.indexOf(animation) < 0) {
            throw new Error(`Unknown animation "${animation}". Use one of ${WIDGET_ANIMATIONS.join(', ')}.`)
        }
        const opts = options || {}
        this.api.appDeltas.push({
            type: 'WidgetAnimation',
            id: this.qModel.id,
            animation: animation,
            duration: numberOption(opts, 'duration', DEFAULT_DURATION),
            delay: numberOption(opts, 'delay', DEFAULT_DELAY)
        })
    }

}

class QWidget extends QModel {

    constructor (model, api) {
        super(model, api, 'Widget')
    }

}

class QGroup extends QModel {

    constructor (model, api) {
        super(model, api, 'Group')
    }

    forEachChild (callback) {
        this.qModel.children.forEach(callback)
    }

    setStyle(newStyleDelta) {
        this.forEachChild(id => {
            this.api.appDeltas.push({
                type: 'Widget',
                key: 'style',
                id: id,
                style: newStyleDelta
            })
        })
    }

    setProp(newStyleDelta) {
        this.forEachChild(id => {
            this.api.appDeltas.push({
                type: 'Widget',
                key: 'props',
                id: id,
                props: newStyleDelta
            })
        })
    }

    isHidden () {
        let hidden = this.qModel.children.filter(id => {
            let widget = this.api.app.widgets[id]
            return widget?.style?.display === 'none'
        })
        return hidden.length === this.qModel.children.length
    }

    /**
     * Animate this group. Every animation is a fan out to its children, and the
     * only thing that differs between them is the per child delay:
     *
     *   fadeIn   every child fades up, together
     *   fadeOut  every child fades down, together
     *   reveal   every child fades up, staggered by step
     *
     * The children are staggered in the order given by `order`, 'screen' by
     * default: top to bottom, then left to right. Pass order:'model' to go by
     * the order the group declares its children in instead.
     *
     * "duration" is how long one child's animation takes and "delay" how long
     * after this call the whole thing starts, so a staggered child starts at
     * delay plus its own index times "step". They are not the same number:
     * duration and step are within the animation, delay is before it.
     *
     * The delta carries the group id rather than the children's, because a group
     * has no DOM node of its own. Its children are siblings in the screen, so
     * the main thread has to resolve them and work out the delays. It carries
     * the order as well, because a recording is replayed later against whatever
     * model is current and has to keep the order it was made with.
     *
     * hide(), show() and toggle() need no animation to work on a group:
     * QModel routes them through setStyle, which is already overridden here to
     * fan out one delta per child.
     */
    animate (animation, options) {
        if (GROUP_ANIMATIONS.indexOf(animation) < 0) {
            throw new Error(`Unknown animation "${animation}". Use one of ${GROUP_ANIMATIONS.join(', ')}.`)
        }
        const opts = options || {}
        const order = opts.order != null ? opts.order : DEFAULT_GROUP_ORDER
        if (GROUP_ORDERS.indexOf(order) < 0) {
            throw new Error(`Unknown order "${order}". Use one of ${GROUP_ORDERS.join(', ')}.`)
        }
        this.api.appDeltas.push({
            type: 'GroupAnimation',
            id: this.qModel.id,
            animation: animation,
            duration: numberOption(opts, 'duration', DEFAULT_DURATION),
            delay: numberOption(opts, 'delay', DEFAULT_DELAY),
            step: numberOption(opts, 'step', DEFAULT_STEP),
            order: order
        })
    }

}


class QScreen extends QModel {

    constructor (model, api) {
        super(model, api, 'Screen')
    }

    getGroup (name) {
        Logger.log(2, "QScreen.getGroup() ", name)
        if (this.api.app.groups) {
            const groups = this.api.app.groups
            const screenChildren = this.qModel.children
            let group = Object.values(groups).find(g => { 
                if (g.name === name) {
                    const groupChildren = g.children
                    const contained = groupChildren.filter(groupChild => screenChildren.indexOf(groupChild) >=0)
                    return contained.length === groupChildren.length
                }
                return false
            })
            if (group) {
                return new QGroup(group, this.api)
            }
        } 
        throw new Error(`Widget "${name}" in screen "${this.qModel.name}" not found.`)
    }

    getWidget(name) {
        Logger.log(2, "QScreen.getWidget() ", name)
        const children = this.qModel.children
        for (let i =0; i < children.length; i++) {
            const widgetId = children[i]
            const widget = this.api.app.widgets[widgetId]
            if (widget && widget.name === name) {
                return new QWidget(widget, this.api)
            }
        }
        throw new Error(`Widget "${name}" in screen "${this.qModel.name}" not found.`)
        
    }
}

export default class ScriptAPI {

    constructor(app, viewModel) {
        Logger.log(2, "ScriptAPI.constructor() ", viewModel)
        this.app = app
        this.appDeltas = []
    }

    getScreen(name) {
        const found = Object.values(this.app.screens).filter(s => s.name === name)
        if (found.length === 1) {
            return new QScreen(found[0], this)
        }
        throw new Error(`Screen "${name}" not found.`)
    }

    vibrate (pattern) {
        this.vibratePattern = pattern
    }

    getAppDeltas () {
        return this.appDeltas
    }

}