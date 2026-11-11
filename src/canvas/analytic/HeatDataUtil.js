/**
 * Pure data preparation for the heatmap render of the editor canvas.
 *
 * The per screen render used to filter the complete event log once per
 * screen (AnalyticCanvas._render_pixel_screen_heatmap): every screen
 * scanned all click events and kept the ones whose event screen id
 * matched. With many sessions that O(screens x events) scan froze the
 * tab. The grouping now runs once over the whole log before the screen
 * loop; this module holds the pure part so a jest spec (which cannot
 * import a .vue file) can test it.
 */

/**
 * Buckets events by the screen id the given extractor returns. The
 * extractor is the canvas' getEventScreenId(): overlay and container
 * children (Repeater, ScreenSegment) carry an overlay id or a mangled
 * screen id, and the heatmap must group them under the id the model
 * knows. Events without an id are skipped, exactly like the old
 * per screen filter skipped them.
 */
export function groupEventsByScreen (events, screenIdOf) {
    const result = {}
    if (!events) {
        return result
    }
    for (let i = 0; i < events.length; i++) {
        const e = events[i]
        const screenID = screenIdOf(e)
        if (screenID == null) {
            continue
        }
        if (!result[screenID]) {
            result[screenID] = []
        }
        result[screenID].push(e)
    }
    return result
}
