/**
 * The heatmap render of the editor used to filter the complete event log
 * once per screen (AnalyticCanvas._render_pixel_screen_heatmap): with S
 * screens and E events the render was O(S x E) and froze the tab on
 * experiments with many sessions. The grouping now runs once before the
 * screen loop, as a pure function so it can be tested here.
 */
import { groupEventsByScreen } from '../../src/canvas/analytic/HeatDataUtil'

test('Test HeatDataUtil.groupEventsByScreen() > buckets events by the extractor id', () => {
  const e1 = { screen: 's1', type: 'WidgetClick' }
  const e2 = { screen: 's2', type: 'ScreenClick' }
  const e3 = { screen: 's1', type: 'WidgetClick' }

  const grouped = groupEventsByScreen([e1, e2, e3], e => e.screen)

  expect(grouped.s1).toEqual([e1, e3])
  expect(grouped.s2).toEqual([e2])
  expect(grouped.s3).toBeUndefined()
})

test('Test HeatDataUtil.groupEventsByScreen() > resolves ids through the extractor', () => {
  /**
   * The canvas passes its getEventScreenId(): overlay events belong to
   * the overlay screen, not e.screen. A fake extractor stands in here.
   */
  const overlay = { screen: 's1', overlay: 's1_overlay' }
  const normal = { screen: 's1' }

  const grouped = groupEventsByScreen([overlay, normal], e => e.overlay || e.screen)

  expect(grouped.s1).toEqual([normal])
  expect(grouped.s1_overlay).toEqual([overlay])
})

test('Test HeatDataUtil.groupEventsByScreen() > mangled container child ids map to the parent screen', () => {
  /**
   * Repeater / ScreenSegment children are recorded under a mangled id;
   * the extractor is where the mangling is undone (toModelWidgetID-like).
   */
  const child = { screen: 's1@screen9' }
  const grouped = groupEventsByScreen([child], e => e.screen.split('@')[0])

  expect(grouped.s1).toEqual([child])
})

test('Test HeatDataUtil.groupEventsByScreen() > skips events without an id', () => {
  const grouped = groupEventsByScreen([{ type: 'SessionStart' }, { screen: null }, { screen: 's1' }], e => e.screen)

  expect(grouped.s1).toEqual([{ screen: 's1' }])
  expect(grouped.undefined).toBeUndefined()
  expect(grouped.null).toBeUndefined()
})

test('Test HeatDataUtil.groupEventsByScreen() > empty and null input', () => {
  expect(groupEventsByScreen([], e => e.screen)).toEqual({})
  expect(groupEventsByScreen(null, e => e.screen)).toEqual({})
})
