import lang from '../../dojo/_base/lang'
import JSONPath from '../JSONPath'

/**
 * The pure half of the VideoPlayer's widget state projection: given the
 * recorded events of a session, this module computes, per event, the state of
 * every widget, the script visual effects, the script data bindings, the
 * widgets the user actually touched, the open overlays and the scroll
 * position. The player then walks this lookup table while playing and
 * scrubbing, and applies it to its Preview.
 *
 * Plain JS on purpose. VideoPlayer.vue is a .vue file, which this jest config
 * cannot import, so anything worth testing has to sit on this side of the
 * boundary.
 *
 * A widget gets TWO state slots, because a recorded state event is not always
 * a value:
 *
 * - widgetStates carries the last state event of any kind. DropDown and
 *   MobileDropDown emit states for merely opening and closing their popup
 *   (open, openWithHover, close, popupScroll), and Password for masking the
 *   characters (hidden), none of which carries the selected value.
 * - valueStates carries the last state that does carry the widget's value
 *   (select, text, checked, ...).
 *
 * The split exists because of a defect: a user who opens a prefilled dropdown
 * without changing it wiped the recorded prefill out of the player. The open
 * and close events replaced the select state that carried the prefill, and at
 * the same time marked the widget as touched, which stops the script data
 * binding replay from re-applying the recorded value at every frame. From that
 * event on the dropdown fell back to the empty placeholder value of a freshly
 * rendered widget, although the recorded user never changed anything. With two
 * slots the popup events still replay (the popup opens and closes on time),
 * while the value survives, and the touched marker below only fires for states
 * that actually carry a value the user changed.
 */

/**
 * Widget states that describe a popup or presentation life cycle rather than
 * the widget's value. A state with one of these types must not evict the last
 * value carrying state of the widget.
 *
 * - open / openWithHover / close / popupScroll: the DropDown, MobileDropDown,
 *   NavMenu and QDateDropDown popups.
 * - hidden: Password showing or masking the characters.
 * - value: the ValidationError events. Several widgets ignore the type on
 *   replay (TextBox only understands text and typing) and the screen itself
 *   keeps showing the value that failed, so it must not evict that value.
 */
const lifecycleStateTypes = {
    'open': true,
    'openWithHover': true,
    'close': true,
    'popupScroll': true,
    'hidden': true,
    'value': true
}

/**
 * Whether a recorded state describes a popup or presentation life cycle
 * instead of the widget's value. A state without a known type is treated as a
 * value, because that is what the previous single slot behaviour did with it.
 */
export function isLifecycleState (state) {
    return state ? lifecycleStateTypes[state.type] === true : false
}

/**
 * Whether a recorded state carries the widget's value, which is what the
 * touched marker below keys of.
 */
export function isValueState (state) {
    return state ? !isLifecycleState(state) : false
}

/**
 * Merge one ScriptEffect recording into the cumulative script effects and
 * script data of the replay.
 *
 * The widgetChanges are the style and prop deltas the script produced plus the
 * display writes its animations do; the dataChanges are the path/value diffs of
 * the view model. Style and props accumulate per widget, so a second script
 * that only changes the color keeps the position the first one set.
 *
 * A stray empty recorded prop must not wipe the widget's static props (e.g. a
 * label's label text): only entries that carry a real value are merged.
 */
export function applyScriptEffect (effects, data, effect) {
    if (!effect) {
        return
    }

    const widgetChanges = effect.widgetChanges || []
    widgetChanges.forEach(change => {
        if (!change || !change.id || (change.key !== 'style' && change.key !== 'props')) {
            return
        }

        if (!effects[change.id]) {
            effects[change.id] = {}
        }
        const current = effects[change.id][change.key] || {}
        let value = lang.clone(change.value || {})

        if (change.key === 'props') {
            const merged = {}
            for (const key in value) {
                if (value[key] !== undefined && value[key] !== null && value[key] !== '' ) {
                    merged[key] = value[key]
                }
            }
            value = merged
        }

        effects[change.id][change.key] = Object.assign({}, current, value)
    })

    const dataChanges = effect.dataChanges || []
    dataChanges.forEach(change => {
        if (!change || !change.path) {
            return
        }
        JSONPath.set(data, change.path, change.removed ? undefined : change.value)
    })
}

/**
 * Uncheck every sibling with the same state type, e.g. the other radio boxes
 * of a group. FIXME from the original code stands: several radio groups would
 * need a fix.
 */
export function setSiblingStates (states, type, value, event) {
    for (var id in states) {
        var s = states[id];
        if (s.type == type && id != event.widget) {
            s.value = value;
        }
    }
}

/**
 * Walk the recorded events and build the per event lookup tables.
 *
 * @param {Array} events the events of one session, in recording order. The
 * array is mutated in place: events without a screen get the last known screen
 * written back, exactly what the recorder would have logged. The caller passes
 * its own clone of the session, so this is safe.
 * @param {Object} defaultStates the states the widgets return when freshly
 * rendered, as a screenID -> widgetID -> state map. This is theVideoPlayer's
 * getDefaultStates(), which needs the DOM and therefore lives in the player.
 *
 * @returns {Object} the per event tables described in the header block.
 */
export function buildEventStates (events, defaultStates) {

    /**
     * The last state of every widget, as a screenID -> widgetID -> state map.
     * Radio buttons have to be controlled on a screen level, hence the
     * intermediate screen map.
     */
    var lastStates = defaultStates
    /**
     * The last value carrying state of every widget, same shape. It starts as
     * the same map as the states: every default state is a value state, and
     * the two maps only diverge once a life cycle event evicts a value.
     */
    var lastValueStates = defaultStates

    var widgetStatesByEvent = {}
    var valueStatesByEvent = {}
    var scriptEffectsByEvent = {}
    var scriptDataByEvent = {}
    var touchedWidgetsByEvent = {}
    var overlayStatesByEvent = {}
    var screenScoll = {}

    var lastScriptEffects = {}
    var lastScriptData = {}

    /**
     * Track which widgets have a recorded interaction that changed their
     * value. Script data must not overwrite those user changes during replay.
     * A WidgetInit event does not count: it is the recorder echoing a data
     * binding change, not the user touching anything.
     */
    var lastTouchedWidgets = {}
    var touchedWidgets = {}

    var overLays = [];

    var lastScroll = {
        type: "scroll",
        value: 0
    };

    /**
     * Events logged by a ScreenSegment child were recorded without a screen,
     * because the container wired its children with the browser global
     * instead of the real one, so `screen` was window.screen.id, which is
     * undefined. The recorder is fixed now, but every existing recording
     * still lacks the field, and without it those events are dropped from the
     * per event state map and never replay.
     *
     * Recover it from the last event that did carry a screen, which is what
     * the recorder would have written.
     */
    var lastKnownScreen = null;
    var backfilled = 0;

    for (let i = 0; i < events.length; i++) {
        let event = events[i];
        if (event.screen) {
            lastKnownScreen = event.screen;
        } else if (lastKnownScreen) {
            event.screen = lastKnownScreen;
            backfilled++;
        }
        let screenID = event.screen;

        /**
         * 1) we clone the last state of all widgets. Then we set the state
         * for the current event to the states of the current screen!
         */
        var states = lang.clone(lastStates)
        var valueStates = {}

        /**
         * Rebuild the value states of this event. For a widget whose last
         * state still is a value state, the fresh clone in states IS the
         * value state, so both tables can share the object (which the radio
         * sibling sync below relies on). For a widget whose last state is a
         * life cycle state, the retained value is cloned over, so scrubbing
         * and re-renders can re-apply it.
         */
        for (var valueScreenID in lastValueStates) {
            var out = {};
            var lastScreenValues = lastValueStates[valueScreenID];
            var lastScreenStates = lastStates[valueScreenID] || {};
            for (var valueWidgetID in lastScreenValues) {
                var lastState = lastScreenStates[valueWidgetID];
                if (lastState && isValueState(lastState) && states[valueScreenID]) {
                    out[valueWidgetID] = states[valueScreenID][valueWidgetID];
                } else {
                    out[valueWidgetID] = lang.clone(lastScreenValues[valueWidgetID]);
                }
            }
            valueStates[valueScreenID] = out;
        }

        widgetStatesByEvent[event.id] = states[screenID] || {};
        valueStatesByEvent[event.id] = valueStates[screenID] || {};
        lastStates = states;
        lastValueStates = valueStates;

        var scriptEffects = lang.clone(lastScriptEffects)
        var scriptData = lang.clone(lastScriptData)
        /**
         * Fresh set per event. Screens reset the touched widgets;
         * everything else accumulates.
         */
        touchedWidgets = (event.type == "ScreenLoaded" || event.type == "ScreenAnimation")
            ? {}
            : Object.assign({}, lastTouchedWidgets)

        /**
         * 2) if there is a new state, we update it
         * for the new state for the widget that emited it
         */
        if (event.state && event.state.type === "script") {
            applyScriptEffect(scriptEffects, scriptData, event.state.value)
        } else if (event.state && event.type != "ScreenScroll" && event.widget) {

            if (states[screenID]) {

                /**
                 * FIXME: If we do master-state-propagation, we have to update the state here, or?
                 */

                states[screenID][event.widget] = event.state;

                /**
                 * A state that carries the widget's value is the value state
                 * of this event as well. A life cycle state (open, close,
                 * validation) is not, and leaves the retained value in place.
                 */
                if (isValueState(event.state)) {
                    valueStates[screenID][event.widget] = event.state;

                    /**
                     * Only an interaction that carried the widget's value counts
                     * as touched. Merely opening and closing a popup, and the
                     * recorder's WidgetInit echo of a data binding change, must
                     * not stop the script data replay from re-applying a
                     * prefilled value.
                     */
                    if (event.type != "WidgetInit") {
                        touchedWidgets[event.widget] = true
                    }
                }

                /**
                 * FIXME: For the radio box we have to change  the
                 * states of the other radio boxes. For now this hack is
                 * ok, as I think we will only have one type of widgets with synced
                 * states. Also if we have several radio button groups we have to fix
                 * this...
                 */
                if (event.state.type == "radiobox.checked") {
                    setSiblingStates(states[screenID], "radiobox.checked", false, event);
                }
            } else {
                console.warn("getWidgetStatesByEvent() > No state for screen ", screenID);
            }

        }
        lastScriptEffects = scriptEffects
        lastScriptData = scriptData
        scriptEffectsByEvent[event.id] = scriptEffects
        scriptDataByEvent[event.id] = scriptData

        lastTouchedWidgets = touchedWidgets
        touchedWidgetsByEvent[event.id] = touchedWidgets

        /**
         * 3) Here we build for each event the scrollPosition.
         * ScreenLoaded and ScreenAnimation will set the scrolling to 0!
         *
         */
        if (event.type == "ScreenScroll" && event.state) {
            screenScoll[event.id] = event.state;
            lastScroll = {
                type: "scroll",
                value: event.state.value
            };

        } else if (event.type == "ScreenLoaded" || event.type == "ScreenAnimation") {
            /**
             * We set scroll to 0. Simulator does the same
             */
            var state = {
                type: "scroll",
                value: 0
            };
            screenScoll[event.id] = state;
            lastScroll = state;
            /**
             * Add here scroll state only of we do not have a ScreenAnimation.
             * If a ScreenLoad follows a ScreenAnimation we do not reset as well!
             */
            var lastEvent = events[i - 1];
            if (lastEvent && event.type != "ScreenAnimation" && !(lastEvent.type == "ScreenAnimation" && event.type == "ScreenLoaded")) {
                if (event.scrollTop != undefined && event.scrollTop != null) {
                    state.value = event.scrollTop;
                }
            }

            /**
             * FIXME: reset here all widget states??
             */
        } else {
            /**
             * other events took place at the same scroll position as before
             */
            screenScoll[event.id] = lastScroll;
        }

        if (event.type == "ScreenLoaded") {
            overLays = [];
        }

        if (event.type == "OverlayLoaded") {
            let index = overLays.indexOf(event.overlay);
            if (index < 0) {
                overLays.push(event.overlay);
            }
        }

        if (event.type == "OverlayShowAnimation") {
            if (event.animation) {
                let index = overLays.indexOf(event.animation.to);
                if (index < 0) {
                    overLays.push(event.animation.to);
                }
            } else {
                console.debug("initWidgetStatesAndScroll() > no animation for event", event)
            }
        }

        if (event.type == "OverlayRemoved") {
            let index = overLays.indexOf(event.overlay);
            if (index > -1) {
                overLays.splice(index, 1);
            }
        }
        overlayStatesByEvent[event.id] = lang.clone(overLays);
    }


    return {
        widgetStates: widgetStatesByEvent,
        valueStates: valueStatesByEvent,
        scriptEffects: scriptEffectsByEvent,
        scriptData: scriptDataByEvent,
        touchedWidgets: touchedWidgetsByEvent,
        overlayStates: overlayStatesByEvent,
        scrollStates: screenScoll,
        backfilled: backfilled
    }
}