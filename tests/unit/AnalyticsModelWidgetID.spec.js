import Analytics from '../../src/dash/Analytics'

/**
 * Container children are recorded under a mangled id, and the model only knows
 * the original. Anything that lines an event up with the model has to strip the
 * suffix first, or the lookup misses and the data is dropped. The replay needs
 * the opposite, the rendered id, so the two must not be conflated.
 */
test('toModelWidgetID strips a ScreenSegment suffix (screen name)', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286@Privacy')).toBe('w11137_11286')
})

test('toModelWidgetID strips a Repeater suffix (row index)', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286-2')).toBe('w11137_11286')
})

test('toModelWidgetID strips a screen inheritance suffix (screen id)', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286@s11126_94152')).toBe('w11137_11286')
})

test('toModelWidgetID strips a nested container suffix', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286-2@Privacy')).toBe('w11137_11286')
    expect(a.toModelWidgetID('w11137_11286@Privacy-2')).toBe('w11137_11286')
})

test('toModelWidgetID leaves a plain widget id alone', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286')).toBe('w11137_11286')
})

test('toModelWidgetID tolerates a screen name containing a dash', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID('w11137_11286@Screen-1')).toBe('w11137_11286')
})

test('toModelWidgetID passes through nothing and non strings', () => {
    const a = new Analytics()
    expect(a.toModelWidgetID(null)).toBe(null)
    expect(a.toModelWidgetID(undefined)).toBe(undefined)
    expect(a.toModelWidgetID('')).toBe('')
})

/**
 * The user facing symptom: a consent checkbox inside a ScreenSegment is flagged
 * as a survey element, but its column came out empty. It was recorded under
 * "w1@Privacy" while app.widgets only has "w1", so the lookup in
 * getSurveyAnswers missed and the sample was dropped, leaving the default.
 */
describe('getSurveyAnswers with a container child', () => {

    const app = {
        id: 'app',
        screens: { s1: { id: 's1', name: 'Privacy', w: 400, h: 600, children: ['w1'] } },
        widgets: {
            w1: { id: 'w1', type: 'LabeledCheckBox', name: 'Consent_1', props: { isSurveyElement: true } }
        }
    }
    const testSettings = { tasks: [] }

    function events (widgetID) {
        return [
            { session: 'S1', user: { id: 'U1' }, screen: 's1', widget: null, type: 'SessionStart', time: 1 },
            { session: 'S1', user: { id: 'U1' }, screen: 's1', widget: widgetID, type: 'WidgetClick', time: 2,
              state: { type: 'checked', value: true } }
        ]
    }

    test('fills the column for a plain widget', () => {
        const a = new Analytics()
        const res = a.getSurveyAnswers(events('w1'), app, testSettings, {})
        expect(res.cols.map(c => c.label)).toContain('Consent_1')
        expect(res.rows[0]['Consent_1']).toBe(true)
    })

    test('fills the column for a ScreenSegment child recorded under a mangled id', () => {
        const a = new Analytics()
        const res = a.getSurveyAnswers(events('w1@Privacy'), app, testSettings, {})
        expect(res.cols.map(c => c.label)).toContain('Consent_1')
        expect(res.rows[0]['Consent_1']).toBe(true)
    })

    test('fills the column for a Repeater child recorded under a mangled id', () => {
        const a = new Analytics()
        const res = a.getSurveyAnswers(events('w1-0'), app, testSettings, {})
        expect(res.rows[0]['Consent_1']).toBe(true)
    })

    test('does not mutate the caller events', () => {
        const a = new Analytics()
        const list = events('w1@Privacy')
        a.getSurveyAnswers(list, app, testSettings, {})
        expect(list[1].widget).toBe('w1@Privacy')
    })
})
