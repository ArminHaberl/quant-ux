import * as Flat2Tree from '../../src/core/responsive/Flat2Tree'

/**
 * addLayoutType recursed with `addLayoutType(child, element)`, passing the
 * node itself as the useRows flag. element is always truthy, so the setting
 * was honoured only for the screen and every nested container took the row
 * branch. CSSPosition.getParentPosition checks isLayoutRow before
 * isLayoutGrid, so exported HTML used display:flex and percentage margins
 * instead of grid-template-columns for all nested containers.
 */
function model() {
    return {
        id: 'm1',
        name: 'Model',
        screenSize: { w: 100, h: 100 },
        widgets: {
            outer: { id: 'outer', type: 'Container', x: 0, y: 0, w: 100, h: 100, style: {}, props: {} },
            inner: { id: 'inner', type: 'Container', x: 0, y: 0, w: 100, h: 100, style: {}, props: {} },
            a: { id: 'a', type: 'Button', x: 0, y: 0, w: 40, h: 20, style: {}, props: {} },
            b: { id: 'b', type: 'Button', x: 0, y: 30, w: 40, h: 20, style: {}, props: {} }
        },
        screens: {
            s1: { id: 's1', name: 'S1', x: 0, y: 0, w: 100, h: 100, style: {}, props: {}, children: ['outer'] }
        },
        lines: {}
    }
}

function find(node, id) {
    if (!node) {
        return null
    }
    if (node.id === id) {
        return node
    }
    const children = node.children || []
    for (let i = 0; i < children.length; i++) {
        const found = find(children[i], id)
        if (found) {
            return found
        }
    }
    return null
}

function outerFor(useRows) {
    const result = Flat2Tree.transform(model(), { useRows: useRows, zoom: 1 })
    expect(result.screens.length).toBe(1)
    return find(result.screens[0], 'outer')
}

test('Flat2Tree.transform() > useRows=false keeps a nested container off the row layout', () => {
    const outer = outerFor(false)
    expect(outer).toBeTruthy()
    expect(outer.layout).toBeTruthy()
    expect(outer.layout.type).not.toBe('row')
})

test('Flat2Tree.transform() > useRows=true puts a nested container on the row layout', () => {
    const outer = outerFor(true)
    expect(outer).toBeTruthy()
    expect(outer.layout.type).toBe('row')
})