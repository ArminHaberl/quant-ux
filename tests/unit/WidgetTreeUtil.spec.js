import {
    collectRenderedWidgetIDs,
    getContainerSuffix,
    resolveContainerID
} from '../../src/util/WidgetTreeUtil'

/**
 * Build a fake render factory registry. Only ids present here are "rendered".
 *
 * container is either undefined (a plain widget) or an array of child records in
 * the shape the containers actually use: {parent, widget, div}.
 */
function makeRegistry (map) {
    return id => map[id]
}

function child (id, parent) {
    return { parent: parent || id, widget: { id: id }, div: null }
}

describe('WidgetTreeUtil - collectRenderedWidgetIDs', () => {

    test('collects a flat list of screen children', () => {
        const registry = makeRegistry({ w1: {}, w2: {}, w3: {} })
        const ids = collectRenderedWidgetIDs(['w1', 'w2', 'w3'], registry)
        expect(Array.from(ids).sort()).toEqual(['w1', 'w2', 'w3'])
    })

    test('skips ids that are not rendered', () => {
        const registry = makeRegistry({ w1: {}, w3: {} })
        const ids = collectRenderedWidgetIDs(['w1', 'w2', 'w3'], registry)
        expect(Array.from(ids).sort()).toEqual(['w1', 'w3'])
    })

    test('descends into ScreenSegment children (mangled @ ids)', () => {
        const registry = makeRegistry({
            seg: { getChildren: () => [child('f1@Screen 1'), child('f2@Screen 1')] },
            'f1@Screen 1': {},
            'f2@Screen 1': {}
        })
        const ids = collectRenderedWidgetIDs(['seg'], registry)
        expect(Array.from(ids).sort()).toEqual(['f1@Screen 1', 'f2@Screen 1', 'seg'])
    })

    test('descends into Repeater children (mangled -N ids)', () => {
        const registry = makeRegistry({
            rep: { getChildren: () => [child('r1-0'), child('r1-1'), child('r1-2')] },
            'r1-0': {}, 'r1-1': {}, 'r1-2': {}
        })
        const ids = collectRenderedWidgetIDs(['rep'], registry)
        expect(Array.from(ids).sort()).toEqual(['r1-0', 'r1-1', 'r1-2', 'rep'])
    })

    test('descends two levels, Repeater inside ScreenSegment', () => {
        const registry = makeRegistry({
            seg: { getChildren: () => [child('rep@Screen 1', 'rep')] },
            'rep@Screen 1': { getChildren: () => [child('n1-0'), child('n1-1')] },
            'n1-0': {},
            'n1-1': {}
        })
        const ids = collectRenderedWidgetIDs(['seg'], registry)
        expect(Array.from(ids).sort()).toEqual(['n1-0', 'n1-1', 'rep@Screen 1', 'seg'])
    })

    test('terminates on a mutually referencing segment pair', () => {
        // ScreenSegment only guards against referencing its own screen, so a
        // A -> B -> A pair renders both screens inline. The visited set has to
        // stop the walk from recursing forever.
        const registry = makeRegistry({
            segA: { getChildren: () => [child('segB', 'segB')] },
            segB: { getChildren: () => [child('segA', 'segA')] }
        })
        const ids = collectRenderedWidgetIDs(['segA'], registry)
        expect(Array.from(ids).sort()).toEqual(['segA', 'segB'])
    })

    test('visits a widget referenced twice only once', () => {
        const registry = makeRegistry({ dup: {} })
        const ids = collectRenderedWidgetIDs(['dup', 'dup', 'dup'], registry)
        expect(Array.from(ids)).toEqual(['dup'])
    })

    test('tolerates a container whose children are not ready yet', () => {
        // ScreenSegment._childWidgets is undefined until the first renderScreen
        const registry = makeRegistry({ seg: { getChildren: () => undefined } })
        const ids = collectRenderedWidgetIDs(['seg'], registry)
        expect(Array.from(ids)).toEqual(['seg'])
    })

    test('tolerates a container returning junk child records', () => {
        const registry = makeRegistry({
            rep: { getChildren: () => [null, { widget: null }, { widget: { id: 'r1-0' } }] },
            'r1-0': {}
        })
        const ids = collectRenderedWidgetIDs(['rep'], registry)
        expect(Array.from(ids).sort()).toEqual(['r1-0', 'rep'])
    })

    test('handles a non array input and an empty screen', () => {
        const registry = makeRegistry({ w1: {} })
        expect(collectRenderedWidgetIDs(undefined, registry).size).toBe(0)
        expect(collectRenderedWidgetIDs([], registry).size).toBe(0)
    })
})

describe('WidgetTreeUtil - getContainerSuffix', () => {

    test('extracts the Repeater suffix', () => {
        expect(getContainerSuffix('w10071-2')).toBe('-2')
    })

    test('extracts the ScreenSegment suffix, including a screen name with a dash', () => {
        expect(getContainerSuffix('w10071@Screen 2')).toBe('@Screen 2')
        expect(getContainerSuffix('w10071@Screen-1')).toBe('@Screen-1')
    })

    test('returns empty for a generated, unmangled id', () => {
        expect(getContainerSuffix('w10071_82684')).toBe('')
    })

    test('returns empty for missing or non string ids', () => {
        expect(getContainerSuffix(undefined)).toBe('')
        expect(getContainerSuffix(null)).toBe('')
        expect(getContainerSuffix('')).toBe('')
    })
})

describe('WidgetTreeUtil - resolveContainerID', () => {

    test('appends the suffix when the candidate is registered', () => {
        const isRegistered = id => id === 'w5@Screen 2'
        expect(resolveContainerID('w5', '@Screen 2', isRegistered)).toBe('w5@Screen 2')
    })

    test('keeps the authored id when there is no suffix', () => {
        expect(resolveContainerID('w5', '', () => true)).toBe('w5')
    })

    test('keeps the authored id when the candidate is not registered', () => {
        // e.g. a ref that points at a widget outside the container
        const isRegistered = () => false
        expect(resolveContainerID('w5', '@Screen 2', isRegistered)).toBe('w5')
    })

    test('does not double mangle an already mangled target', () => {
        const isRegistered = () => true
        expect(resolveContainerID('w5-1', '@Screen 2', isRegistered)).toBe('w5-1')
        expect(resolveContainerID('w5@Other', '-0', isRegistered)).toBe('w5@Other')
    })

    test('passes the id through when there is no target', () => {
        expect(resolveContainerID(null, '@Screen 2', () => true)).toBe(null)
        expect(resolveContainerID(undefined, '@Screen 2', () => true)).toBe(undefined)
    })

    test('works without a registration predicate', () => {
        expect(resolveContainerID('w5', '@Screen 2')).toBe('w5@Screen 2')
    })
})
