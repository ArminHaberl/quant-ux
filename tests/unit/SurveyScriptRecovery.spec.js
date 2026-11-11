import Analytics from '../../src/dash/Analytics'

/**
 * Regression: a script that populated a survey field on a screen the test
 * user never visited left the survey column empty. The survey reader
 * only consumed widget state events (WidgetInit / WidgetChange), which the
 * simulator logs for rendered widgets only, while the script's write was
 * recorded solely as one ScriptEffect event carrying the data binding diffs
 * of the view model. getSurveyAnswers() now replays those diffs onto a
 * per-session view model and resolves each survey widget's binding path
 * (props.databinding.default) from it, so the answer the script wrote shows
 * up even when the widget's screen was never rendered.
 *
 * The removal policy follows what the user actually sees: the simulator
 * never pushes a deletion into a widget (replaceDataBinding() and
 * initDataBinding() skip null and undefined) and a rendered widget keeps
 * its stale value, so a removed diff keeps the last written answer too.
 */
const app = {
    widgets: {
        age: { id: 'age', name: 'age', type: 'TextBox', props: { isSurveyElement: true, databinding: { default: 'survey.age' } } },
        rating: { id: 'rating', name: 'rating', type: 'Rating', props: { isSurveyElement: true, databinding: { default: 'survey.stars' } } },
        table: { id: 'table', name: 'table', type: 'RadioTable', props: { isSurveyElement: true, databinding: { default: 'survey.ratings' }, data: [['header'], ['RowA'], ['RowB']] } },
        chat: { id: 'chat', name: 'chat', type: 'Chat', props: { isSurveyElement: true, databinding: { default: 'survey.chat' }, responses: [{ type: 'user', content: 'Hello' }, { type: 'user', content: 'Bye' }] } },
        script: { id: 'script', name: 'script', type: 'Script', props: {} },
        misflagged: { id: 'misflagged', name: 'scriptWidget', type: 'Script', props: { isSurveyElement: true } }
    }
}

const start = (session, time) => ({ session: session, type: 'SessionStart', screen: 's0', widget: null, time: time })

const scriptEffect = (session, time, dataChanges) => ({
    session: session,
    type: 'ScriptEffect',
    screen: null,
    widget: 'script',
    time: time,
    state: { type: 'script', value: { dataChanges: dataChanges, widgetChanges: [], animations: [] } }
})

test('Test Analytics.getSurveyAnswers() > recovers the answer a script wrote for a never rendered screen', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.age', value: '33' }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('33')
});

test('Test Analytics.getSurveyAnswers() > a later user answer overwrites the script value', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.age', value: '33' }]),
        { session: 's1', type: 'WidgetChange', widget: 'age', time: 3000, state: { type: 'text', value: '44' } }
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('44')
});

test('Test Analytics.getSurveyAnswers() > a later script write overwrites the user answer', () => {

    const events = [
        start('s1', 1000),
        { session: 's1', type: 'WidgetChange', widget: 'age', time: 2000, state: { type: 'text', value: '44' } },
        scriptEffect('s1', 3000, [{ path: 'survey.age', value: '33' }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('33')
});

test('Test Analytics.getSurveyAnswers() > a script writing the parent object fills the deeper binding path', () => {

    /**
     * The diff of a script that creates a nested object records the whole
     * object at the parent path, so the widget bound to a path inside it
     * must be resolved against the replayed view model, not by an exact
     * path match.
     */
    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey', value: { age: '33' } }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('33')
});

test('Test Analytics.getSurveyAnswers() > a removed diff keeps the last written value', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.age', value: '33' }]),
        scriptEffect('s1', 3000, [{ path: 'survey.age', removed: true }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('33')
});

test('Test Analytics.getSurveyAnswers() > a null value change keeps the last written value', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.age', value: '33' }]),
        scriptEffect('s1', 3000, [{ path: 'survey.age', value: null }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBe('33')
});

test('Test Analytics.getSurveyAnswers() > a script written selection object fills the radio table rows', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.ratings', value: { RowA: true, RowB: false } }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['RowA']).toBe(true)
    expect(result.rows[0]['RowB']).toBe(false)
});

test('Test Analytics.getSurveyAnswers() > a script written rating index becomes the label', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.stars', value: 2 }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['rating']).toBe(3)
});

test('Test Analytics.getSurveyAnswers() > a script written chat transcript fills the response columns', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.chat', value: [
            { role: 'user', content: 'Hello' },
            { role: 'assistant', content: 'hi' },
            { role: 'user', content: 'Bye' }
        ] }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['Hello']).toBe('Hello')
    expect(result.rows[0]['Bye']).toBe('Bye')
});

test('Test Analytics.getSurveyAnswers() > a script writing a wrong chat shape leaves the columns empty', () => {

    /**
     * The Chat reader walks a transcript array. A script that bound the
     * variable to something else must not crash the table or write
     * undefined into the columns. Falsy rather than strictly '-', because
     * the '-' prefill of the row only reaches the string columns.
     */
    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.chat', value: 'oops' }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['Hello']).toBeFalsy()
    expect(result.rows[0]['Bye']).toBeFalsy()
});

test('Test Analytics.getSurveyAnswers() > a script writing a wrong radio table shape leaves the columns empty', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.ratings', value: 'oops' }])
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['RowA']).toBeFalsy()
});

test('Test Analytics.getSurveyAnswers() > a misflagged script widget keeps its empty column', () => {

    /**
     * A Script widget that was accidentally flagged as a survey element
     * must not have the whole effect object stringified into its column.
     * The 'script' state is a life cycle state for the survey reader, the
     * data diffs go through the dedicated replay instead.
     */
    const events = [
        start('s1', 1000),
        { session: 's1', type: 'ScriptEffect', screen: null, widget: 'misflagged', time: 2000, state: { type: 'script', value: { dataChanges: [{ path: 'other.thing', value: 1 }], widgetChanges: [], animations: [] } } }
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['scriptWidget']).toBeFalsy()
});

test('Test Analytics.getSurveyAnswers() > a session without script effects keeps its empty column', () => {

    const events = [
        start('s1', 1000)
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows[0]['age']).toBeFalsy()
});

test('Test Analytics.getSurveyAnswers() > a script write stays inside its session', () => {

    const events = [
        start('s1', 1000),
        scriptEffect('s1', 2000, [{ path: 'survey.age', value: '33' }]),
        start('s2', 3000)
    ]

    const result = new Analytics().getSurveyAnswers(events, app, {}, {})
    expect(result.rows.length).toBe(2)
    expect(result.rows[0]['age']).toBe('33')
    expect(result.rows[1]['age']).toBeFalsy()
});
