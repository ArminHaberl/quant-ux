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
 * Explicit on every delta, never left to the animation engine.
 * Animation.defaultAnimationDuration is read in createAnimation() and in
 * Css3Animation, but assigned nowhere, so it is undefined, and run() then takes
 * its zero duration branch and renders the end value in a single frame.
 */
const DEFAULT_DURATION = 300
const DEFAULT_STEP = 60

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
     * This is a delta and not a style write on purpose: the main thread has to
     * drive it, because a script runs in a worker with no DOM and every delta is
     * applied in one synchronous pass.
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
            duration: opts.duration != null ? opts.duration : DEFAULT_DURATION
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
     * The delta carries the group id rather than the children's, because a group
     * has no DOM node of its own. Its children are siblings in the screen, so
     * the main thread has to resolve them and work out the delays.
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
        this.api.appDeltas.push({
            type: 'GroupAnimation',
            id: this.qModel.id,
            animation: animation,
            duration: opts.duration != null ? opts.duration : DEFAULT_DURATION,
            step: opts.step != null ? opts.step : DEFAULT_STEP
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