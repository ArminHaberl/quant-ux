import ModelUtil from '../../src/core/ModelUtil'

test('Test ModelUtil.scaleToSelection() >  ', async () => {
    const result = ModelUtil.scaleToSelection({w:100, h: 200, x:1000, y:1000}, {w:200, h: 200}, 'RightDown')
    expect(result.w).toBe(200)
    expect(result.h).toBe(400)


    const result2 = ModelUtil.scaleToSelection({w:200, h: 100, x:1000, y:1000}, {w:100, h: 200}, 'LeftUp')
    expect(result2.h).toBe(50)
    expect(result2.w).toBe(100)


    const result3 = ModelUtil.scaleToSelection({w:200, h: 100, x:1000, y:1000}, {w:100, h: 200}, 'South')
    expect(result3.h).toBe(200)
    expect(result3.w).toBe(400)

    const result4 = ModelUtil.scaleToSelection({w:200, h: 100, x:1000, y:1000}, {w:100, h: 200}, 'North')
    expect(result4.h).toBe(200)
    expect(result4.w).toBe(400)
})

test('Test ModelUtil.scaleToSelectionWidthOrHeight() >  ', async () => {
    const result = ModelUtil.scaleToSelectionWidthOrHeight({w:100, h: 200, x:1000, y:1000}, {w:200, h: 200}, 'South')
    expect(result.w).toBe(200)
    expect(result.h).toBe(400)


    const result2 = ModelUtil.scaleToSelectionWidthOrHeight({w:200, h: 100, x:1000, y:1000}, {w:100, h: 200, snapp:{type: 'RightDown'}}, 'RightDown')
    expect(result2.h).toBe(200)
    expect(result2.w).toBe(400)
})

test('Test ModelUtil.getViewModeStyle() >  No Template', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        style: {a:4, b:5, c:6},
        hover: {}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'style')

    expect(style.a).toBe(4)
    expect(style.b).toBe(5)
    expect(style.c).toBe(6)
})

test('Test ModelUtil.getViewModeStyle() >  Template', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        template: 't1',
        style: {},
        hover: {}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'style')

    expect(style.a).toBe(1)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)
})

test('Test ModelUtil.getViewModeStyle() >  Template:hover', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        template: 't1',
        style: {},
        hover: {}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'hover')

    expect(style.a).toBe(11)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)
})

test('Test ModelUtil.getViewModeStyle() >  Template Overwrite', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        template: 't1',
        style: {a:111},
        hover: {}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'style')

    expect(style.a).toBe(111)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)
})


test('Test ModelUtil.getViewModeStyle() >  Template:Hover Overwrite', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        template: 't1',
        style: {a:111},
        hover: {c:333}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'hover')

    expect(style.a).toBe(11)
    expect(style.b).toBe(2)
    expect(style.c).toBe(333)
})

test('Test ModelUtil.getViewModeStyle() >  Template:Hover Bug', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11}
            }
        }
    }
    let widget = {
        template: 't1',
        style: {a:111}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'hover')

    expect(style.a).toBe(11)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)
})

test('Test ModelUtil.setMergedTemplateStyle() > unlink template ', async () => {


  let widget = {
      style: {
          a: 11,
      }
  }

  let template = {
    style: {
        a: 1,
        b: 2,
        c: 3
    },
    hover: {
        a: 4,
        b: 5,
        c: 6
    }
  }

  ModelUtil.setMergedTemplateStyle(widget, template, 'style')
  ModelUtil.setMergedTemplateStyle(widget, template, 'hover')
  expect(widget.style.a).toBe(11)
  expect(widget.style.b).toBe(2)
  expect(widget.hover.a).toBe(4)
})

test('Test ModelUtil.setStylesNotInTemplate() > relink template ', async () => {


    let widget = {
        style: {
            a: 11,
            b: 2,
            c: 3
        },
        hover: {
            a: 4,
            b: 5,
            c: 66
        }
    }
  
    let template = {
      style: {
          a: 1,
          b: 2,
          c: 3
      },
      hover: {
          a: 4,
          b: 5,
          c: 6
      }
    }
  
    ModelUtil.setStylesNotInTemplate(widget, template, 'style')
    ModelUtil.setStylesNotInTemplate(widget, template, 'hover')
    expect(widget.style.a).toBe(11)
    expect(widget.style.b).toBe(undefined)
    expect(widget.style.c).toBe(undefined)
    expect(widget.hover.a).toBe(undefined)
    expect(widget.hover.c).toBe(66)
})


test('Test ModelUtil.getMergedTemplate() > No Variant', async () => {

    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11, b:22},
                error: {c:33}
            },
            't2': {
                variantOf: 't1',
                style: {a:4},
                hover: {a:111},
                error: {a:1111, c:333}
            }
        }
    }

    const template = ModelUtil.getMergedTemplate('t1', app)
    const style = template.style
    expect(style.a).toBe(1)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)

    const hover = template.hover
    expect(hover.a).toBe(11)
    expect(hover.b).toBe(22)

    const error = template.error
    expect(error.a).toBeUndefined()
    expect(error.c).toBe(33)
})


test('Test ModelUtil.getMergedTemplate() > variant', async () => {



    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11, b:22},
                error: {c:33}
            },
            't2': {
                variantOf: 't1',
                style: {a:4},
                hover: {a:111},
                error: {a:1111, c:333}
            }
        }
    }

    const template = ModelUtil.getMergedTemplate('t2', app)
    const style = template.style
    expect(style.a).toBe(4)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)

    const hover = template.hover
    expect(hover.a).toBe(111)
    expect(hover.b).toBe(22)

    const error = template.error
    expect(error.a).toBe(1111)
    expect(error.c).toBe(333)
})



test('Test ModelUtil.getViewModeStyle() > variant no overwrites', async () => {



    const app = {
        templates: {
            't1': {
                style: {a:1, b:2, c:3},
                hover: {a:11, b:22}
            },
            't2': {
                variantOf: 't1',
                style: {a:4},
                hover: {a:111}
            }
        }
    }
    let widget = {
        template: 't2',
        style: {},
        hover: {}
    }
    const style = ModelUtil.getViewModeStyle(widget, app, 'style')
    expect(style.a).toBe(4)
    expect(style.b).toBe(2)
    expect(style.c).toBe(3)

    const hover = ModelUtil.getViewModeStyle(widget, app, 'hover')
    expect(hover.a).toBe(111)
    expect(hover.b).toBe(22)
})


describe('ModelUtil.getOrderedGroupChildren() > ', () => {

    /**
     * Small inline model rather than a fixture: the whole point is the order the
     * three coordinates imply, so the numbers have to be readable next to the
     * widget they belong to.
     */
    function model (children, positions) {
        const widgets = {}
        children.forEach(id => {
            const pos = positions[id] || {}
            widgets[id] = { id: id, x: pos.x, y: pos.y }
        })
        return { widgets: widgets, groups: { g1: { id: 'g1', name: 'g', children: children } } }
    }

    test('screen order runs top to bottom', () => {
        const m = model(['w1', 'w2', 'w3'], {
            w1: { x: 0, y: 300 }, w2: { x: 0, y: 100 }, w3: { x: 0, y: 200 }
        })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w2', 'w3', 'w1'])
    })

    test('screen order runs left to right within a line', () => {
        const m = model(['w1', 'w2', 'w3'], {
            w1: { x: 300, y: 100 }, w2: { x: 100, y: 100 }, w3: { x: 200, y: 100 }
        })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w2', 'w3', 'w1'])
    })

    /**
     * The original defect: a reveal staggered by model.groups[id].children, an
     * order that neither the canvas nor the layer list shows and that
     * LayerUtil.getGroupChanges() case 2 leaves untouched when a child is
     * reordered within its group. Here the group declares bottom first.
     */
    test('screen order ignores the declaration order of the group', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 900 }, w2: { x: 0, y: 10 } })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'model')).toEqual(['w1', 'w2'])
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w2', 'w1'])
    })

    /**
     * A recording made before the order was written on the delta has none, and
     * must keep the declaration order rather than pick up the screen order.
     */
    test('no order means the declaration order', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 900 }, w2: { x: 0, y: 10 } })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m)).toEqual(['w1', 'w2'])
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, undefined)).toEqual(['w1', 'w2'])
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'model')).toEqual(['w1', 'w2'])
    })

    test('an unknown order is the declaration order', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 900 }, w2: { x: 0, y: 10 } })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'zOrder')).toEqual(['w1', 'w2'])
    })

    /**
     * Two elements at the same spot have no screen order between them, so the
     * declaration order decides and the result stays stable across runs.
     */
    test('two elements at the same spot keep the declaration order', () => {
        const m = model(['w1', 'w2', 'w3'], {
            w1: { x: 10, y: 10 }, w2: { x: 10, y: 10 }, w3: { x: 10, y: 10 }
        })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w1', 'w2', 'w3'])
    })

    /**
     * The harness models in the script specs carry no coordinates at all. A NaN
     * in a comparator would hand the result to the engine's sort, so they have to
     * compare equal and land on the declaration order instead.
     */
    test('a widget without coordinates counts as the origin', () => {
        const m = model(['w1', 'w2', 'w3'], {
            w1: { x: 0, y: 0 }, w2: {}, w3: { x: 0, y: 0 }
        })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w1', 'w2', 'w3'])
    })

    test('a coordinate that is not a number counts as the origin', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 'nope' }, w2: { x: 0, y: 0 } })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w1', 'w2'])
    })

    /**
     * A child that is not in the model has no coordinates either, so it counts
     * as the origin and takes the first place in the stagger. It cannot animate
     * anyway, but it does push everything after it one step along.
     */
    test('a child that is not in the model sorts to the origin', () => {
        const m = model(['w1', 'gone'], { w1: { x: 0, y: 50 } })
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['gone', 'w1'])
    })

    /**
     * getAllGroupChildren() flattens a sub group after the direct children, and
     * the sort has to work across the seam rather than per group.
     */
    test('sub group children are sorted in with the direct ones', () => {
        const m = model(['w1'], { w1: { x: 0, y: 500 }, w3: { x: 0, y: 100 } })
        m.groups.g1.groups = ['g2']
        m.groups.g2 = { id: 'g2', name: 'sub', children: ['w3'] }
        expect(ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')).toEqual(['w3', 'w1'])
    })

    /**
     * This runs while a recording replays, so it must not write to the model.
     * Core.fixMissingZValue() is the pattern deliberately not copied here.
     */
    test('does not write to the model', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 50 } })
        const before = JSON.stringify(m.widgets)
        ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')
        expect(JSON.stringify(m.widgets)).toBe(before)
    })

    test('the group children are not mutated', () => {
        const m = model(['w1', 'w2'], { w1: { x: 0, y: 50 }, w2: { x: 0, y: 10 } })
        ModelUtil.getOrderedGroupChildren(m.groups.g1, m, 'screen')
        expect(m.groups.g1.children).toEqual(['w1', 'w2'])
    })

    test('a group without children is empty', () => {
        expect(ModelUtil.getOrderedGroupChildren({ id: 'g1', name: 'g' }, {}, 'screen')).toEqual([])
    })

})
