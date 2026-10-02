import ModelFixer from '../../src/canvas/controller/ModelFixer'

/**
 * fixNegativeCoords tested `difY > 0 || difY > 0`, so difX was never checked,
 * and read screen.children inside a loop over s. There is no `screen` in
 * scope, so that resolved to the global window.screen and
 * window.screen.children was undefined. This runs on every model load
 * (BaseController.setModel), so any app whose screens had ever been dragged
 * to a negative coordinate threw a TypeError on open.
 */
/**
 * ModelFixer is exported as a singleton and is mixed into Controller, where
 * it calls this.printStackToLog() once it has changed something. That method
 * lives on the host, so stub it on the shared instance for these tests.
 */
let fixer
beforeEach(() => {
    fixer = ModelFixer
    fixer.printStackToLog = () => {}
})
afterEach(() => {
    delete fixer.printStackToLog
})

function negativeModel() {
    return {
        screens: {
            s1: { id: 's1', name: 'Screen 1', x: -100, y: -50, w: 200, h: 200, children: ['w1', 'w2'] }
        },
        widgets: {
            w1: { id: 'w1', type: 'Button', x: 10, y: 20, w: 30, h: 40 },
            w2: { id: 'w2', type: 'Label', x: 50, y: 60, w: 30, h: 40 }
        },
        lines: {}
    }
}

test('ModelFixer.fixNegativeCoords() > does not throw on a negative coordinate screen', () => {
    const model = negativeModel()
    expect(() => fixer.fixNegativeCoords(model)).not.toThrow()
})

test('ModelFixer.fixNegativeCoords() > moves a negative screen back to the origin', () => {
    const model = negativeModel()
    fixer.fixNegativeCoords(model)
    expect(model.screens.s1.x).toBe(100)
    expect(model.screens.s1.y).toBe(50)
})

test('ModelFixer.fixNegativeCoords() > offsets the children by both axes', () => {
    const model = negativeModel()
    fixer.fixNegativeCoords(model)
    /**
     * Both axes now contribute, which is the whole point: difX was never
     * checked before, so x was left untouched.
     */
    expect(model.widgets.w1.x).toBe(210)
    expect(model.widgets.w1.y).toBe(120)
    expect(model.widgets.w2.x).toBe(250)
    expect(model.widgets.w2.y).toBe(160)
})

test('ModelFixer.fixNegativeCoords() > skips children that no longer exist', () => {
    const model = negativeModel()
    model.screens.s1.children.push('dangling')
    expect(() => fixer.fixNegativeCoords(model)).not.toThrow()
    expect(model.widgets.w1.x).toBe(210)
})

test('ModelFixer.fixNegativeCoords() > leaves a model with only positive coords alone', () => {
    const model = {
        screens: { s1: { id: 's1', x: 10, y: 20, w: 200, h: 200, children: ['w1'] } },
        widgets: { w1: { id: 'w1', x: 10, y: 20, w: 30, h: 40 } },
        lines: {}
    }
    fixer.fixNegativeCoords(model)
    expect(model.widgets.w1.x).toBe(10)
    expect(model.widgets.w1.y).toBe(20)
})