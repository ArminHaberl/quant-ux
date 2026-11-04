import { getWidgetChanges, isScriptAnimation } from 'core/engines/ScriptAnimations'
import { mergeScriptChange } from 'core/simulator/SessionCheckpoint'

function findEffect (effects, id) {
    return effects.find(effect => effect.id === id)
}

function canSave (model, id) {
    const widget = model.widgets && model.widgets[id]
    return widget && widget.type !== 'Password' && widget.type !== 'Upload'
}

/** Keep the final state of each script animation in the same order as style writes. */
export function recordAnimationDelta (model, changes, effects, delta) {
    if (!delta) return
    if (isScriptAnimation(delta)) {
        getWidgetChanges(model, [delta]).forEach(change => {
            if (!canSave(model, change.id)) return
            mergeScriptChange(changes, { type: 'Widget', id: change.id, key: 'style', value: change.value })
            let effect = findEffect(effects, change.id)
            if (!effect) {
                effect = { id: change.id, opacity: null, finishText: false }
                effects.push(effect)
            }
            effect.opacity = delta.animation === 'fadeOut' ? 0 : 1
            if (delta.animation === 'typewriter') effect.finishText = true
        })
        return
    }
    const element = delta.type === 'Screen' ? model.screens[delta.id] : model.widgets[delta.id]
    const value = delta.key === 'style' ? delta.style : delta.props
    if (!element || element.type === 'Password' || element.type === 'Upload' ||
        (delta.type !== 'Widget' && delta.type !== 'Screen') ||
        (delta.key !== 'style' && delta.key !== 'props') || !value) return
    mergeScriptChange(changes, { type: delta.type, id: delta.id, key: delta.key, value })
    const effect = delta.type === 'Widget' && findEffect(effects, delta.id)
    if (effect && delta.key === 'style' &&
        (Object.prototype.hasOwnProperty.call(value, 'display') || Object.prototype.hasOwnProperty.call(value, 'opacity'))) {
        // A later show/hide or opacity write owns that part of the visual state.
        effect.opacity = null
    }
    if (effect && delta.key === 'props' && Object.prototype.hasOwnProperty.call(value, 'label')) {
        effect.finishText = false
    }
}

/** Apply the saved frame to rendered widgets without putting opacity in the model. */
export function applyAnimationEffects (renderFactory, effects) {
    (effects || []).forEach(effect => {
        if (!renderFactory.hasRenderedWidget(effect.id)) return
        const widget = renderFactory.getAnimationWrapper(effect.id)
        if (!widget) return
        if (effect.opacity !== null && effect.opacity !== undefined && widget.setAnimatedStyle) {
            widget.setAnimatedStyle({ opacity: effect.opacity })
        }
        if (effect.finishText && widget.stopChatAnimation && widget.setInnerHTML && widget.getValue) {
            widget.stopChatAnimation()
            widget.setInnerHTML(widget.domNode, String(widget.getValue() ?? ''))
        }
    })
}

/** A new script operation takes ownership from an effect applied on reload. */
export function releaseAnimationEffects (renderFactory, model, effects, delta) {
    if (!effects || !delta) return
    if (isScriptAnimation(delta)) {
        const ids = new Set(getWidgetChanges(model, [delta]).map(change => change.id))
        for (let i = effects.length - 1; i >= 0; i--) {
            const effect = effects[i]
            if (ids.has(effect.id)) {
                if (effect.opacity != null && renderFactory.hasRenderedWidget(effect.id)) {
                    const widget = renderFactory.getAnimationWrapper(effect.id)
                    const style = model.widgets[effect.id] && model.widgets[effect.id].style
                    if (widget && widget.setAnimatedStyle) {
                        delete widget.animatedStyle
                        widget.setAnimatedStyle({ opacity: style && style.opacity != null ? style.opacity : 1 })
                        delete widget.animatedStyle
                    }
                }
                effects.splice(i, 1)
            }
        }
        return
    }
    if (delta.type !== 'Widget') return
    const effect = findEffect(effects, delta.id)
    if (!effect) return
    if (delta.key === 'style' && delta.style &&
        (Object.prototype.hasOwnProperty.call(delta.style, 'display') || Object.prototype.hasOwnProperty.call(delta.style, 'opacity'))) {
        if (effect.opacity !== null && renderFactory.hasRenderedWidget(delta.id)) {
            const widget = renderFactory.getAnimationWrapper(delta.id)
            const modelStyle = model.widgets[delta.id] && model.widgets[delta.id].style
            if (widget && widget.setAnimatedStyle) {
                const opacity = delta.style.opacity != null ? delta.style.opacity :
                    modelStyle && modelStyle.opacity != null ? modelStyle.opacity : 1
                const style = { opacity }
                if (Object.prototype.hasOwnProperty.call(delta.style, 'display')) style.display = delta.style.display
                widget.setAnimatedStyle(style)
            }
        }
        effect.opacity = null
    }
    if (delta.key === 'props' && delta.props && Object.prototype.hasOwnProperty.call(delta.props, 'label')) {
        effect.finishText = false
    }
}
