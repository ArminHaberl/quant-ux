import Core from '../../src/core/Core'

function buildModel () {
    return {
        id: 'app',
        version: 1,
        screens: {
            m1: { id: 'm1', name: 'Master', x: 0, y: 0, children: ['w1'] },
            s1: { id: 's1', name: 'Child', x: 10, y: 10, parents: ['m1'], children: [] }
        },
        widgets: {
            w1: { id: 'w1', type: 'Label', x: 0, y: 0, w: 10, h: 10, props: { label: 'Treatment' } }
        }
    }
}

test('createInheritedModel is idempotent when applied twice', () => {
    const core = new Core()

    const once = core.createInheritedModel(buildModel())
    expect(once.screens.s1.children.filter(id => id === 'w1@s1')).toHaveLength(1)
    expect(once.widgets['w1@s1']).toBeTruthy()

    const twice = core.createInheritedModel(once)
    expect(twice.screens.s1.children.filter(id => id === 'w1@s1')).toHaveLength(1)
    expect(twice.widgets['w1@s1']).toBeTruthy()
})