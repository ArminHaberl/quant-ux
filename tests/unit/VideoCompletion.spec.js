import VideoCompletion, { normalizeFinishedPercentage } from '../../src/core/widgets/VideoCompletion'
import ModelUtil from '../../src/core/ModelUtil'
import * as TestUtil from './TestUtil'
import app from './data/simSimpleForm.json'

/** A video completion trigger must fire at the configured playback position, only once. */
test('crossing the threshold, including a forward seek, fires once until reset', () => {
    const completion = new VideoCompletion()
    expect(completion.update(74.99, 100, 75)).toBe(false)
    expect(completion.update(75, 100, 75)).toBe(true)
    expect(completion.update(99, 100, 75)).toBe(false)
    expect(completion.update(20, 100, 75)).toBe(false)
    expect(completion.update(80, 100, 75)).toBe(false)

    completion.reset()
    expect(completion.update(90, 100, 75)).toBe(true)
})

/** Unknown or unbounded media duration must not cause premature navigation. */
test('requires a finite positive duration and valid playback position', () => {
    const completion = new VideoCompletion()
    expect(completion.update(10, NaN, 50)).toBe(false)
    expect(completion.update(10, Infinity, 50)).toBe(false)
    expect(completion.update(0, 0, 50, true)).toBe(false)
    expect(completion.update(NaN, 100, 50)).toBe(false)
    expect(completion.update(-1, 100, 50)).toBe(false)
    expect(completion.update(50, 100, 50)).toBe(true)
})

/** Existing videos have no threshold, and an ended event must handle imprecise final timestamps. */
test('defaults to 100 percent and handles the native ended event', () => {
    const completion = new VideoCompletion()
    expect(completion.update(99.99, 100, undefined)).toBe(false)
    expect(completion.update(99.99, 100, undefined, true)).toBe(true)
    expect(completion.update(100, 100, undefined, true)).toBe(false)
})

/** Invalid or out-of-range saved percentages must have predictable bounded behavior. */
test('normalizes percentage values for the editor and simulator', () => {
    expect(normalizeFinishedPercentage(undefined)).toBe(100)
    expect(normalizeFinishedPercentage('')).toBe(100)
    expect(normalizeFinishedPercentage('invalid')).toBe(100)
    expect(normalizeFinishedPercentage('75')).toBe(75)
    expect(normalizeFinishedPercentage(0)).toBe(1)
    expect(normalizeFinishedPercentage(200)).toBe(100)
})

/** A threshold added to an older video must survive zoom and support undo and redo. */
test('stores the threshold in widget props through the model change stack', () => {
    const source = TestUtil.clone(app)
    const screen = source.screens.s10000_29014
    const id = 'video_completion'
    source.widgets[id] = {
        id, type: 'Video', name: 'Video', x: 10, y: 20, w: 320, h: 180, z: 0,
        props: { url: '/clip.mp4' }, has: { data: true }, style: {}
    }
    screen.children.push(id)
    const [controller, model] = TestUtil.createController(source)

    controller.updateWidgetProperties(id, { finishedPercentage: 75 }, 'props')
    expect(model.widgets[id].props.finishedPercentage).toBe(75)
    expect(ModelUtil.createScalledModelFast(model, 0.5, false).widgets[id].props.finishedPercentage).toBe(75)
    controller.undoChangeStack()
    expect(model.widgets[id].props.finishedPercentage).toBeUndefined()
    controller.redoChangeStack()
    expect(model.widgets[id].props.finishedPercentage).toBe(75)
})

/** The prototype trigger must reach the simulator's scaled model and survive undo. */
test('stores the video finished trigger on the prototype link', () => {
    const source = TestUtil.clone(app)
    const id = Object.keys(source.lines)[0]
    const [controller, model] = TestUtil.createController(source)
    const previousEvent = model.lines[id].event

    controller.updateLineProperties(id, 'event', 'videoFinished')
    expect(ModelUtil.createScalledModelFast(model, 0.5, false).lines[id].event).toBe('videoFinished')
    controller.undoChangeStack()
    expect(model.lines[id].event).toBe(previousEvent)
    controller.redoChangeStack()
    expect(model.lines[id].event).toBe('videoFinished')
})
