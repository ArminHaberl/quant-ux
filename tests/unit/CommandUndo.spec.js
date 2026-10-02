import Controller from '../../src/canvas/controller/Controller'
import CommandService from '../../src/services/CommandService'

/**
 * applyUndoChange carried a bare `if (value.props)` that guarded nothing and
 * dereferenced value first. CollabUtil.getChange emits an "update" whenever
 * typeof old !== typeof new, which is exactly what happens when a key did not
 * exist before, so oldValue is routinely undefined. The TypeError escaped
 * undo(), which had already decremented the stack position, leaving the model
 * half reverted with no re-render and no save.
 */
function controller() {
    const c = new Controller()
    c.setModelService = () => {}
    return c
}

test('Command.applyUndoChange() > restores an update whose oldValue is undefined', () => {
    const c = controller()
    const model = { screens: { s1: { name: 'old name' } } }
    const change = {
        parent: 'screens',
        name: 's1',
        type: 'update',
        oldValue: undefined
    }
    expect(() => c.applyUndoChange(change, model)).not.toThrow()
    expect(model.screens.s1).toBeUndefined()
})

test('Command.applyUndoChange() > restores an update whose oldValue is null', () => {
    const c = controller()
    const model = { screens: { s1: { name: 'a name' } } }
    const change = { parent: 'screens', name: 's1', type: 'update', oldValue: null }
    expect(() => c.applyUndoChange(change, model)).not.toThrow()
    expect(model.screens.s1).toBeNull()
})

test('Command.applyUndoChange() > stamps modified on a restored object', () => {
    const c = controller()
    const model = { widgets: {} }
    const change = { parent: 'widgets', name: 'w1', type: 'update', oldValue: { x: 1 } }
    c.applyUndoChange(change, model)
    expect(model.widgets.w1.x).toBe(1)
    expect(typeof model.widgets.w1.modified).toBe('number')
})

test('Command.applyUndoChange() > does not throw when the parent collection is gone', () => {
    const c = controller()
    const model = {}
    const change = { parent: 'widgets', name: 'w1', type: 'update', oldValue: { x: 1 } }
    expect(() => c.applyUndoChange(change, model)).not.toThrow()
})

test('Command.applyUndoChange() > never touches lastUUID', () => {
    const c = controller()
    const model = { lastUUID: 7 }
    const change = { name: 'lastUUID', type: 'update', oldValue: 3 }
    c.applyUndoChange(change, model)
    expect(model.lastUUID).toBe(7)
})

/**
 * `c.name !== 'lastUUID' || c.name !== 'lastUpdate'` is always true, so the
 * redo guard filtered nothing while the undo guard correctly skips lastUUID.
 */
test('Command.applyRedoChange() > skips lastUUID and lastUpdate', () => {
    const c = controller()
    const model = { lastUUID: 1, lastUpdate: 'a' }
    c.applyRedoChange({ name: 'lastUUID', type: 'update', object: 2 }, model)
    c.applyRedoChange({ name: 'lastUpdate', type: 'update', object: 'b' }, model)
    expect(model.lastUUID).toBe(1)
    expect(model.lastUpdate).toBe('a')
})

test('Command.applyRedoChange() > applies a normal update', () => {
    const c = controller()
    const model = { widgets: {} }
    c.applyRedoChange({ parent: 'widgets', name: 'w1', type: 'update', object: { x: 9 } }, model)
    expect(model.widgets.w1.x).toBe(9)
})

/**
 * The stack position is moved before the changes are applied, so a throw
 * mid-loop used to leave the index advanced and the model half reverted.
 */
test('Command.undoChangeStack() > restores the position when a change cannot be applied', () => {
    const c = controller()
    c.commandChangeStack = {
        appID: 'a1',
        pos: 0,
        stack: [{ ts: 1, modelChanges: [{ name: 'x', type: 'update', oldValue: 1 }] }]
    }
    c.model = {}
    c.commandService = CommandService
    c.onCommandChangeStackChange = () => {}
    c.showError = () => {}
    /**
     * model is frozen so assigning into it throws inside the apply loop,
     * which is exactly the failure the rollback exists for.
     */
    Object.freeze(c.model)
    const result = c.undoChangeStack()
    expect(result).toBe(false)
    expect(c.commandChangeStack.pos).toBe(0)
})

test('Command.undoChangeStack() > reports no undo when the stack is empty', () => {
    const c = controller()
    c.commandChangeStack = { appID: 'a1', pos: -1, stack: [] }
    c.showError = () => {}
    expect(c.undoChangeStack()).toBe(false)
    expect(c.commandChangeStack.pos).toBe(-1)
})