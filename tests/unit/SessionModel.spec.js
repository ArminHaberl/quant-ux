/**
 * SessionModel checks: the once-per-data-load computation shared by the
 * admin UI tabs, replacing the per-tab recomputations of
 * TestTab._getTestList / StudioDetails.setSummary / getTaskSummary.
 *
 * The regression to guard is the semantics of the derived values: durations
 * count the full event span for the session table but the action event span
 * for the KPIs, labels fall back to "Test n", annotations can add and remove
 * task successes without a rebuild, and the caller's event array must not
 * be reordered by the model's internal sort.
 *
 * Session order note: like TestTab._getTestList(), sessions are listed by
 * first appearance in the time sorted log. In the fixture the first event
 * of session "sB" is at t=200 (a non action event), so sB is row 1 and
 * sA row 2, although sA starts its action events earlier.
 */
import SessionModel from '../../src/dash/SessionModel'

const TASKS = [
  {
    name: 'Go to second screen',
    id: 't1',
    strict: false,
    flow: [
      { screen: 's1', widget: null, type: 'ScreenLoaded' },
      { screen: 's2', widget: null, type: 'ScreenLoaded' }
    ]
  }
]

function createEvents () {
  return [
    { type: 'WidgetClick', session: 'sB', screen: 's2', time: 4000 },
    { type: 'SessionStart', session: 'sB', time: 3000, user: { name: 'User B' } },
    { type: 'ScreenLoaded', session: 'sA', screen: 's2', time: 2000 },
    { type: 'SessionStart', session: 'sA', time: 1000, label: 'Label A', user: { name: 'User A' } },
    { type: 'ScreenLoaded', session: 'sA', screen: 's1', time: 1100 },
    { type: 'AnotherType', session: 'sB', screen: 's3', time: 200 },
    { type: 'WidgetClick', session: 'sA', screen: 's2', time: 2100 },
    { type: 'ScreenLoaded', session: 'sB', screen: 's1', time: 3100 },
    { type: 'ValidationError', session: 'sB', screen: 's1', time: 3150 }
  ]
}

test('Test SessionModel.build() > rows replicate the session table semantics', () => {
  const model = new SessionModel(createEvents(), TASKS)

  expect(model.sessionCount).toBe(2)

  const rows = model.getRows([])
  expect(rows.length).toBe(2)

  // session order = first appearance in the time sorted log: sB first
  const rowB = rows[0]
  expect(rowB.session).toBe('sB')
  expect(rowB.id).toBe(1)
  // no label on the start event > fallback
  expect(rowB.label).toBe('Test 1')
  // the user comes from the earliest event of the session, whatever type
  // it is (legacy takes session.data[0].user). sB's earliest event is the
  // user-less AnotherType at t=200, so the '-' fallback shows.
  expect(rowB.user).toBe('-')
  // full event span, includes the non action event at t=200
  expect(rowB.duration).toBe(4)
  expect(rowB.size).toBe(3)
  expect(rowB.start).toBe(200)
  // unique() over all events counts the screen-less SessionStart and s3
  expect(rowB.screens).toBe(4)
  expect(rowB.taskPerformance).toBe('0 / 1')
  expect(rowB.taskNames).toBeUndefined()
  expect(rowB.isValid).toBe(true)
  expect(rowB.status).toContain('MatchDashStatusSuccess')

  const rowA = rows[1]
  expect(rowA.session).toBe('sA')
  expect(rowA.id).toBe(2)
  expect(rowA.label).toBe('Label A')
  expect(rowA.user).toBe('User A')
  expect(rowA.duration).toBe(2)
  expect(rowA.size).toBe(3)
  expect(rowA.start).toBe(1000)
  expect(rowA.screens).toBe(3)
  expect(rowA.taskPerformance).toBe('1 / 1')
  expect(rowA.taskNames).toEqual(['Go to second screen'])
})

test('Test SessionModel.build() > does not reorder the events of the caller', () => {
  const events = createEvents()
  const unsortedFirst = events[0]
  new SessionModel(events, TASKS)
  expect(events[0]).toBe(unsortedFirst)
})

test('Test SessionModel.getRows() > annotations flip validity and task success', () => {
  const model = new SessionModel(createEvents(), TASKS)

  // annotated invalid: the rows count is untouched, only the status flips
  const rows = model.getRows([{ reference: 'sB', isValid: false, tasks: {} }])
  expect(rows[0].isValid).toBe(false)
  expect(rows[0].status).toContain('MatchDashStatusFailure')
  expect(rows[0].taskPerformance).toBe('0 / 1')
  expect(rows[1].isValid).toBe(true)

  // annotated manual success without a match
  const rows2 = model.getRows([{ reference: 'sB', isValid: true, tasks: { t1: true } }])
  expect(rows2[0].taskPerformance).toBe('1 / 1')
  expect(rows2[0].taskNames).toEqual(['Go to second screen'])

  // annotated manual failure removes the observed match
  const rows3 = model.getRows([{ reference: 'sA', isValid: true, tasks: { t1: false } }])
  expect(rows3[1].taskPerformance).toBe('0 / 1')
  expect(rows3[1].taskNames).toBeUndefined()
})

test('Test SessionModel.getSummaryFactors() > KPI of valid sessions with action events', () => {
  const model = new SessionModel(createEvents(), TASKS)

  const factors = model.getSummaryFactors([])
  expect(factors.sessionCount).toBe(2)
  // action event spans: sA 1100..2100, sB 3100..4000 (the non action
  // events before them do not count, unlike the table duration)
  expect(factors.durationMean).toBe(950)
  expect(factors.actionsMean).toBe(3)
  // action screens: sA {s1,s2}, sB {s1,s2}
  expect(factors.screensMean).toBe(2)

  // invalid sessions leave the KPIs
  const factors2 = model.getSummaryFactors([{ reference: 'sB', isValid: false, tasks: {} }])
  expect(factors2.sessionCount).toBe(1)
  expect(factors2.durationMean).toBe(1000)
})

test('Test SessionModel.getTaskSummaries() > same semantics as Analytics.getTaskSummary', () => {
  const model = new SessionModel(createEvents(), TASKS)

  const summaries = model.getTaskSummaries([])
  expect(summaries.length).toBe(1)
  expect(summaries[0].id).toBe('t1')
  // starts: both sessions touch s1, only sA finished the flow
  expect(summaries[0].startCount).toBe(2)
  expect(summaries[0].sessionCount).toBe(2)
  expect(summaries[0].success).toBe(0.5)

  // invalid sessions no longer count
  const summaries2 = model.getTaskSummaries([{ reference: 'sB', isValid: false, tasks: {} }])
  expect(summaries2[0].startCount).toBe(1)
  expect(summaries2[0].sessionCount).toBe(1)
  expect(summaries2[0].success).toBe(1)
})

test('Test SessionModel.getSession() > the events of one session', () => {
  const model = new SessionModel(createEvents(), TASKS)

  const sessionA = model.getSession('sA')
  expect(sessionA.data.length).toBe(4)
  // time ordered
  expect(sessionA.data.map(e => e.time)).toEqual([1000, 1100, 2000, 2100])

  expect(model.getSession('sMissing')).toBe(null)
})

test('Test SessionModel.getSessionDetails() > point cap keeps the plot bounded', () => {
  const events = []
  let time = 1000
  for (let i = 0; i < 4000; i++) {
    time += 10
    const session = 'sess' + i
    events.push({ type: 'SessionStart', session: session, time: time })
    events.push({ type: 'ScreenLoaded', session: session, screen: 's1', time: time + 1 })
    events.push({ type: 'WidgetClick', session: session, screen: 's1', time: time + 2 })
  }
  const model = new SessionModel(events, TASKS)

  const details = model.getSessionDetails([])
  expect(details.data.length).toBe(2000)

  const small = new SessionModel(createEvents(), TASKS)
  expect(small.getSessionDetails([]).data.length).toBe(2)
})
