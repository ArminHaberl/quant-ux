import Core from '../../src/core/Core'
import ModelUtil from '../../src/core/ModelUtil'

/**
 * A master screen with a required input and an error label, inherited into a
 * child screen. This is the shape Simulator.startSimilator builds: it calls
 * Core.createInheritedModel and then ModelUtil.updateInheritedRefs, so the
 * tests below drive that same chain rather than the helper in isolation.
 */
function buildModel () {
    return {
        id: 'app',
        version: 1,
        screens: {
            m1: { id: 'm1', name: 'Master', x: 0, y: 0, children: ['w1', 'w2'] },
            s1: { id: 's1', name: 'Child', x: 10, y: 10, parents: ['m1'], children: [] }
        },
        widgets: {
            w1: {
                id: 'w1', type: 'TextBox', x: 0, y: 0, w: 100, h: 20,
                props: { refs: { errorLabels: ['w2'] } }
            },
            w2: { id: 'w2', type: 'Label', x: 0, y: 20, w: 100, h: 10, props: { label: 'Required' } }
        }
    }
}

/**
 * What Simulator.startSimilator does, in the same order.
 */
function inherit (model) {
    return ModelUtil.updateInheritedRefs(new Core().createInheritedModel(model))
}

test('error labels on inherited widgets point at the copy in the child screen', () => {
    const model = inherit(buildModel())
    expect(model.widgets['w1@s1'].props.refs.errorLabels).toEqual(['w2@s1'])
})

test('the screen id is used, not the screen name', () => {
    const model = inherit(buildModel())
    const labels = model.widgets['w1@s1'].props.refs.errorLabels
    expect(labels).not.toContain('w2@m1')
    expect(labels).not.toContain('w2@undefined')
})

test('re-applying the refs does not mangle an id twice', () => {
    const model = inherit(buildModel())
    const twice = ModelUtil.updateInheritedRefs(model)
    expect(twice.widgets['w1@s1'].props.refs.errorLabels).toEqual(['w2@s1'])
})

test('a ref that already points at a copy is left alone', () => {
    const model = inherit(buildModel())
    model.widgets['w1@s1'].props.refs.errorLabels = ['w2@s1']
    const again = ModelUtil.updateInheritedRefs(model)
    expect(again.widgets['w1@s1'].props.refs.errorLabels).toEqual(['w2@s1'])
})

test('a widget that is not inherited keeps its authored refs', () => {
    const model = buildModel()
    model.screens.s1.children = ['w3']
    model.widgets.w3 = {
        id: 'w3', type: 'TextBox', x: 0, y: 0, w: 100, h: 20,
        props: { refs: { errorLabels: ['w2'] } }
    }
    const inherited = inherit(model)
    expect(inherited.widgets.w3.props.refs.errorLabels).toEqual(['w2'])
})

test('a screen without parents is left alone', () => {
    const model = buildModel()
    model.screens.s2 = { id: 's2', name: 'Standalone', x: 0, y: 0, children: ['w4'] }
    model.widgets.w4 = {
        id: 'w4', type: 'TextBox', x: 0, y: 0, w: 100, h: 20,
        props: { refs: { errorLabels: ['w2'] } }
    }
    const inherited = inherit(model)
    expect(inherited.widgets.w4.props.refs.errorLabels).toEqual(['w2'])
})
