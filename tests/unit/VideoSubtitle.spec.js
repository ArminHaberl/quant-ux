import app from './data/simSimpleForm.json'
import ModelUtil from '../../src/core/ModelUtil'
import * as TestUtil from './TestUtil'

const SCREEN_ID = 's10000_29014'
const VIDEO_ID = 'w_video_subtitle'

/**
 * The fixture has no Video widget, so graft one onto a real screen. It is
 * never rendered here, there is no vue-jest transform, but the prop has to
 * travel the same path a dropped widget does: propertyChange -> setWidgetProps
 * -> updateWidgetProperties -> props -> the zoomed model the simulator draws.
 */
function modelWithVideo (props) {
    const model = TestUtil.clone(app);
    model.widgets[VIDEO_ID] = {
        id: VIDEO_ID,
        type: 'Video',
        name: 'Video',
        x: 10,
        y: 20,
        w: 320,
        h: 180,
        z: 0,
        props: props,
        has: { data: true },
        style: {}
    };
    model.screens[SCREEN_ID].children.push(VIDEO_ID);
    return model;
}

test('Test VideoSubtitle >  props.subtitle is stored and undone', async () => {

    const [controller, model] = TestUtil.createController(modelWithVideo({
        url: '/quant-ux/videos/clip.mp4', fit: 'contain', subtitle: ''
    }))

    controller.updateWidgetProperties(VIDEO_ID, { subtitle: '/quant-ux/videos/clip.vtt' }, 'props')
    expect(model.widgets[VIDEO_ID].props.subtitle).toBe('/quant-ux/videos/clip.vtt')
    expect(model.widgets[VIDEO_ID].props.url).toBe('/quant-ux/videos/clip.mp4')

    controller.undoChangeStack()
    expect(model.widgets[VIDEO_ID].props.subtitle).toBe('')

    controller.redoChangeStack()
    expect(model.widgets[VIDEO_ID].props.subtitle).toBe('/quant-ux/videos/clip.vtt')
})

test('Test VideoSubtitle >  props.subtitle survives the zoomed model', async () => {

    /**
     * The simulator renders the zoomed model, so a prop that gets dropped here
     * would silently never reach Video.render() and the <track> would never be
     * rendered at all. Nothing in this repo can assert that the track reached
     * the DOM, which is exactly why the plumbing is pinned here.
     */
    const [controller, model] = TestUtil.createController(modelWithVideo({
        url: '/quant-ux/videos/clip.mp4', fit: 'contain', subtitle: ''
    }))
    controller.updateWidgetProperties(VIDEO_ID, { subtitle: '/quant-ux/videos/clip.vtt' }, 'props')

    const zoomed = ModelUtil.createScalledModelFast(model, 0.5, false)
    expect(zoomed.widgets[VIDEO_ID].props.subtitle).toBe('/quant-ux/videos/clip.vtt')
})

test('Test VideoSubtitle >  a widget saved before subtitles existed still works', async () => {

    /**
     * Only newly dropped widgets get the props.subtitle the palette seeds, so
     * every Video widget already saved in a study has no such key at all. The
     * first edit then has an undefined oldValue to undo from, which is the
     * CommandUndo case, and Video.vue reads it as props.subtitle || ''.
     */
    const [controller, model] = TestUtil.createController(modelWithVideo({
        url: '/quant-ux/videos/clip.mp4', fit: 'contain'
    }))

    expect(model.widgets[VIDEO_ID].props.subtitle).toBeUndefined()

    controller.updateWidgetProperties(VIDEO_ID, { subtitle: '/quant-ux/videos/clip.vtt' }, 'props')
    expect(model.widgets[VIDEO_ID].props.subtitle).toBe('/quant-ux/videos/clip.vtt')

    controller.undoChangeStack()
    expect(model.widgets[VIDEO_ID].props.subtitle).toBeUndefined()

    controller.updateWidgetProperties(VIDEO_ID, { subtitle: '' }, 'props')
    expect(model.widgets[VIDEO_ID].props.subtitle).toBe('')
})