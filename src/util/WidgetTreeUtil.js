
/**
 * Helpers for walking the tree of widgets that are actually rendered, including
 * the children that containers (ScreenSegment, Repeater) render for us.
 *
 * Container children are registered in the render factory under a mangled id
 * (Repeater: childID + "-" + index, ScreenSegment: childID + "@" + screenName),
 * and the model keeps a back reference to the original widget. Widget ids are
 * generated as "w<number>_<number>" (see canvas/controller/Widget.js), so the
 * first "-" or "@" in a rendered id always marks where the mangling starts.
 */

/**
 * Collect the ids of all rendered widgets reachable from the given ids,
 * descending into container children.
 *
 * This is the inverse of what the renderer does in RenderMixin.wireContainer():
 * we ask the live widget for its children instead of re-deriving them from the
 * model, so we only ever visit widgets that are on screen, and we never have to
 * know how a given container mangles ids.
 *
 * @param ids     array of starting widget ids (e.g. screen.children)
 * @param getUIWidget  lookup function, typically RenderFactory.getUIWidgetByID
 * @param result  optional Set to accumulate into, used for the recursion
 * @return Set of widget ids
 */
export function collectRenderedWidgetIDs (ids, getUIWidget, result) {
    result = result || new Set()
    if (!Array.isArray(ids)) {
        return result
    }
    ids.forEach(id => {
        if (!id || result.has(id)) {
            return
        }
        const widget = getUIWidget(id)
        if (!widget) {
            return
        }
        result.add(id)
        if (typeof widget.getChildren === "function") {
            const children = widget.getChildren()
            if (Array.isArray(children)) {
                collectRenderedWidgetIDs(
                    children.map(child => child && child.widget && child.widget.id).filter(Boolean),
                    getUIWidget,
                    result
                )
            }
        }
    })
    return result
}

/**
 * The container mangling suffix of a rendered widget id, or "" when the widget
 * is not a container child.
 *
 * "w10071-2"        -> "-2"
 * "w10071@Screen 2" -> "@Screen 2"
 * "w10071_1234"     -> ""
 */
export function getContainerSuffix (id) {
    if (!id || typeof id !== "string") {
        return ""
    }
    const index = id.search(/[-@]/)
    return index > 0 ? id.slice(index) : ""
}

/**
 * Translate an id that was authored in the model to the id the container copy
 * was actually rendered under, so that refs (error labels, value labels,
 * carousel buttons) keep working inside ScreenSegment and Repeater.
 *
 * Falls back to the authored id when the target is already mangled or when the
 * candidate is not registered, so a ref pointing outside the container degrades
 * to the previous behaviour instead of breaking.
 *
 * @param targetID     the id as authored in the model
 * @param suffix       the suffix of the widget that holds the ref
 * @param isRegistered lookup predicate, see RenderFactory.hasRenderedWidget
 */
export function resolveContainerID (targetID, suffix, isRegistered) {
    if (!targetID || !suffix) {
        return targetID
    }
    if (getContainerSuffix(targetID)) {
        return targetID
    }
    const candidate = targetID + suffix
    if (typeof isRegistered === "function" && !isRegistered(candidate)) {
        return targetID
    }
    return candidate
}
