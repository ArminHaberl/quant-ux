import Analytics from '../../src/dash/Analytics'

/**
 * Regression: survey answers were truncated to the last value that failed
 * validation while the user was typing. A user who typed '2' into an age
 * field (int validation with a minimum), corrected it to '21' and left the
 * field produced these events:
 *
 * - the ValidationError of the invalid prefix ('2'), logged at typing time,
 * - the ValidationOk once the value became valid, logged without a state,
 * - the WidgetChange that flushes the composite text state on blur, carrying
 *   the final value ('21') but stamped with the composite's start time, i.e.
 *   the focus time, because LogMixin copies widgetEvent.time into event.time.
 *
 * Sorted by time the final sample came first, and getSurveyAnswers() takes
 * the last sample per widget, so the rejected partial value won and the
 * results tab showed '2' although the replay showed '21'.
 */
const app = {
    widgets: {
        w1: { id: 'w1', name: 'age', type: 'TextBox', props: { isSurveyElement: true } }
    }
}

test('Test Analytics.getSurveyAnswers() > validation error must not overwrite the final value', () => {

    /**
     * Array order as recorded: the blur flush runs after the validation
     * events, so the final sample is the last element although its time is
     * the earliest. The type column ordering must not resurrect the defect.
     */
    const events = [
        { session: 's1', type: 'SessionStart', screen: 's0', widget: null, time: 1000 },
        { session: 's1', type: 'ValidationError', widget: 'w1', time: 1500, state: { type: 'value', value: '2' } },
        { session: 's1', type: 'ValidationOk', widget: 'w1', time: 1800 },
        { session: 's1', type: 'WidgetChange', widget: 'w1', time: 1200, state: { type: 'text', value: '21', children: [{ time: 1300, value: '2' }, { time: 1450, value: '21' }] } }
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('21')
});

test('Test Analytics.getSurveyAnswers() > valid typing keeps its answer', () => {

    const events = [
        { session: 's1', type: 'SessionStart', screen: 's0', widget: null, time: 1000 },
        { session: 's1', type: 'WidgetChange', widget: 'w1', time: 1200, state: { type: 'text', value: '21', children: [{ time: 1300, value: '21' }] } }
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('21')
});

test('Test Analytics.getSurveyAnswers() > session without a flushed value stays empty', () => {

    /**
     * The session died while the user was still typing, so only the
     * ValidationError sample was logged and nothing else flushes a value.
     * The answer must stay empty rather than fall back to the rejected
     * partial value. It is falsy rather than strictly undefined, because the
     * '-' prefill of the row only reaches the string columns.
     */
    const events = [
        { session: 's1', type: 'SessionStart', screen: 's0', widget: null, time: 1000 },
        { session: 's1', type: 'ValidationError', widget: 'w1', time: 1500, state: { type: 'value', value: '2' } }
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBeFalsy()
});
