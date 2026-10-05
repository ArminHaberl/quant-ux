import app from './data/simSimpleForm.json'
import ModelUtil from '../../src/core/ModelUtil'
import * as TestUtil from './TestUtil'

const LABEL_ID = 'w10006_81388'

test('Test LabelSelectable >  props.selectable is stored and undone', async () => {

    const [controller, model] = TestUtil.createController(app)

    expect(model.widgets[LABEL_ID].props.selectable).toBeUndefined()

    controller.updateWidgetProperties(LABEL_ID, {selectable: true}, 'props')
    expect(model.widgets[LABEL_ID].props.selectable).toBe(true)
    expect(model.widgets[LABEL_ID].props.label).toBe('Signup')

    controller.undoChangeStack()
    expect(model.widgets[LABEL_ID].props.selectable).toBeUndefined()

    controller.redoChangeStack()
    expect(model.widgets[LABEL_ID].props.selectable).toBe(true)
})


test('Test LabelSelectable >  props.selectable survives the zoomed model', async () => {

    /**
     * The simulator renders the zoomed model, so a prop that gets dropped
     * here would silently never reach Label.render().
     */
    const [controller, model] = TestUtil.createController(app)
    controller.updateWidgetProperties(LABEL_ID, {selectable: true}, 'props')

    const zoomed = ModelUtil.createScalledModelFast(model, 0.5, false)
    expect(zoomed.widgets[LABEL_ID].props.selectable).toBe(true)
    expect(zoomed.widgets[LABEL_ID].props.label).toBe('Signup')
})
