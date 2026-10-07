import ScriptAPI from '../../src/core/engines/ScriptAPI'

test('Test ScriptAPI() >  Roundtrip', async () => {

    let app = {
        "version": 2.1,
        "screens": {
            's1': {
                id: 's1',
                name: 'a',
                style: {
                    background: '#fff'
                },
                children: ['w1', 'w2', 'w3']
            },
            's2': {
                id: 's2',
                name: 'b',
                style: {
                    background: '#fff'
                },
                children: ['w5', 'w6', 'w7']
            }
        },
        "widgets": {
            'w1': {
                id: 'w1',
                name: 'b',
                style: {
                    background: 'red'
                }
            },
            'w2': {
                id: 'w2',
                name: 'c',
                style: {
                    display: 'none',
                    background: 'red'
                }
            },
            'w3': {
                id: 'w3',
                name: 'd',
                style: {
                    background: 'yellow'
                }
            },
            'w4': {
                id: 'w4',
                name: 'd',
                style: {
                    display: 'none',
                    background: 'red'
                }
            },
            'w5': {
                id: 'w5',
                name: 'e',
                style: {
                    display: 'none',
                    background: 'red'
                }
            },
            'w6': {
                id: 'w6',
                name: 'f',
                style: {
                    display: 'none',
                    background: 'red'
                }
            },
            'w7': {
                id: 'w7',
                name: 'g',
                style: {
                    display: 'none',
                    background: 'red'
                }
            },
        },
        "groups": {
            "g1": {
                id: 'g1',
                name: 'g',
                children: ['w1', 'w2']
            },
            "g2": {
                name: 'g',
                id: 'g2',
                children: ['w5', 'w6', 'w7']
            }
        },
        "templates": {}
    }
    const viewModel = {}
    const api = new ScriptAPI(app, viewModel)
    const screenA = api.getScreen('a')
    expect(screenA).not.toBeUndefined()
    expect(screenA.getName()).toBe('a')

    const screenB = api.getScreen('b')
    expect(screenB).not.toBeUndefined()
    expect(screenB.getName()).toBe('b')
   
    const widgetB = screenA.getWidget('b')
    expect(widgetB).not.toBeUndefined()
    expect(widgetB.getName()).toBe('b')
    expect(widgetB.isHidden()).toBe(false)

    const widgetC = screenA.getWidget('c')
    expect(widgetC).not.toBeUndefined()
    expect(widgetC.getName()).toBe('c')
    expect(widgetC.isHidden()).toBe(true)

    const g1 = screenA.getGroup('g')
    expect(g1).not.toBeUndefined()
    expect(g1.qModel.id).toBe('g1')
    expect(g1.isHidden()).toBe(false)

    const g2 = screenB.getGroup('g')
    expect(g2).not.toBeUndefined()
    expect(g2.qModel.id).toBe('g2')
    expect(g2.isHidden()).toBe(true)

    screenA.setStyle({'background': 'black'})
    let deltas = api.getAppDeltas()
    expect(deltas.length).toBe(1)
    expect(deltas[0].type).toBe('Screen')
    expect(deltas[0].id).toBe('s1')
    expect(deltas[0].key).toBe('style')
    expect(deltas[0].style.background).toBe('black')

    widgetB.setStyle({'color': 'red'})
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(2)
    expect(deltas[1].type).toBe('Widget')
    expect(deltas[1].id).toBe('w1')
    expect(deltas[1].key).toBe('style')
    expect(deltas[1].style.color).toBe('red')

    widgetB.setProp({'label': 'ABC'})
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(3)
    expect(deltas[2].type).toBe('Widget')
    expect(deltas[2].id).toBe('w1')
    expect(deltas[2].key).toBe('props')
    expect(deltas[2].props.label).toBe('ABC')

    widgetB.hide()
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(4)
    expect(deltas[3].type).toBe('Widget')
    expect(deltas[3].id).toBe('w1')
    expect(deltas[3].key).toBe('style')
    expect(deltas[3].style.display).toBe('none')

    widgetB.show()
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(5)
    expect(deltas[4].type).toBe('Widget')
    expect(deltas[4].id).toBe('w1')
    expect(deltas[4].key).toBe('style')
    expect(deltas[4].style.display).toBe('block')


  
    g1.hide()
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(7)
    expect(deltas[5].type).toBe('Widget')
    expect(deltas[5].id).toBe('w1')
    expect(deltas[5].key).toBe('style')
    expect(deltas[5].style.display).toBe('none')
    expect(deltas[6].type).toBe('Widget')
    expect(deltas[6].id).toBe('w2')
    expect(deltas[6].key).toBe('style')
    expect(deltas[6].style.display).toBe('none')


g2.hide()
    deltas = api.getAppDeltas()
    expect(deltas.length).toBe(10)

})


describe('ScriptAPI animate()', () => {

    function setup() {
        const app = {
            screens: {
                s1: { id: 's1', name: 'a', style: {}, children: ['w1', 'w2'] }
            },
            widgets: {
                w1: { id: 'w1', name: 'b', style: { display: 'none' } },
                w2: { id: 'w2', name: 'c', style: {} }
            },
            groups: {
                g1: { id: 'g1', name: 'g', children: ['w1', 'w2'] }
            }
        }
        const api = new ScriptAPI(app, {})
        return { app, api, screen: api.getScreen('a') }
    }

    test('records a fade as a self contained delta', () => {
        const { api, screen } = setup()
        screen.getWidget('b').animate('fadeIn', { duration: 500 })

        const deltas = api.getAppDeltas()
        expect(deltas.length).toBe(1)
        expect(deltas[0]).toEqual({
            type: 'WidgetAnimation', id: 'w1', animation: 'fadeIn', duration: 500
        })
    })

    test('defaults the duration', () => {
        const { api, screen } = setup()
        screen.getWidget('b').animate('fadeOut')
        expect(api.getAppDeltas()[0].duration).toBe(300)
    })

    /**
     * A delta is not a style merge. It must not carry a key, so nothing can
     * route it through ScriptToModel and collapse the tween into one frame.
     */
    test('the delta carries no style key to merge on', () => {
        const { api, screen } = setup()
        screen.getWidget('b').animate('fadeIn')
        const delta = api.getAppDeltas()[0]
        expect(delta.key).toBeUndefined()
        expect(delta.style).toBeUndefined()
        expect(delta.props).toBeUndefined()
    })

    test('names the valid animations when it does not know one', () => {
        const { screen } = setup()
        expect(() => screen.getWidget('b').animate('zoomIn'))
            .toThrow(/Unknown animation "zoomIn".*fadeIn, fadeOut/)
    })

    test('rejects the group only animation on a widget', () => {
        const { screen } = setup()
        expect(() => screen.getWidget('b').animate('reveal')).toThrow(/Unknown animation/)
    })

    /**
     * QScreen extends QModel, so animate() is on a screen unless it is stopped.
     * A screen is not in the widget registry, so it could only ever fall back to
     * the instant change.
     */
    test('refuses to animate a screen', () => {
        const { screen } = setup()
        expect(() => screen.animate('fadeIn')).toThrow(/not supported on a screen/)
    })

    test('records a group reveal against the group, not its children', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('reveal', { step: 120 })

        const deltas = api.getAppDeltas()
        expect(deltas.length).toBe(1)
        expect(deltas[0]).toEqual({
            type: 'GroupAnimation', id: 'g1', animation: 'reveal', duration: 300, step: 120, order: 'screen'
        })
    })

    /**
     * The order goes on the delta rather than being resolved once, because a
     * recording is replayed later against whatever model is current and has to
     * keep the order it was made with.
     */
    test('records the order a group reveal was asked for', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('reveal', { order: 'model' })
        expect(api.getAppDeltas()[0].order).toBe('model')
    })

    /**
     * The order the children were added to the group in is neither shown on the
     * canvas nor changeable on it, so it cannot be the default. Screen order is
     * the one the author can see.
     */
    test('defaults a group reveal to the screen order', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('reveal')
        expect(api.getAppDeltas()[0].order).toBe('screen')
    })

    test('records the order on every group animation, staggered or not', () => {
        const { api, screen } = setup()
        const group = screen.getGroup('g')
        group.animate('fadeIn')
        group.animate('fadeOut')
        group.animate('typewriter')
        expect(api.getAppDeltas().map(d => d.order)).toEqual(['screen', 'screen', 'screen'])
    })

    test('refuses an order it cannot resolve', () => {
        const { screen } = setup()
        expect(() => screen.getGroup('g').animate('reveal', { order: 'zOrder' }))
            .toThrow(/Unknown order "zOrder".*model, screen/)
    })

    /**
     * A widget has one element and nothing to order against, so it takes no
     * order at all.
     */
    test('a widget animation carries no order', () => {
        const { api, screen } = setup()
        screen.getWidget('b').animate('fadeIn')
        expect(api.getAppDeltas()[0].order).toBeUndefined()
    })

    test('defaults the per child step', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('reveal')
        expect(api.getAppDeltas()[0].step).toBe(60)
    })

    /**
     * A group reveal is one delta. Fanning it out here would put every child in
     * the same frame, which is the staggered timing lost.
     */
    test('does not fan a group reveal out into per child deltas', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('reveal')
        expect(api.getAppDeltas().length).toBe(1)
    })

    /**
     * hide(), show() and toggle() already work on a group, because QModel routes
     * them through setStyle and QGroup overrides that to fan out per child. The
     * gap was animate(), which only accepted reveal.
     */
    test('a group fades alongside a widget', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('fadeIn')
        expect(api.getAppDeltas()[0].animation).toBe('fadeIn')
    })

    /**
     * hide(), show() and toggle() already work on a group: QModel routes them
     * through setStyle, and QGroup overrides setStyle to fan out one Widget delta
     * per child. That is the behaviour group visibility rests on, and it has
     * nothing to do with animate(), so it is pinned here on its own.
     */
    test('hide, show and toggle already fan out over a group children', () => {
        const { api, screen } = setup()
        const group = screen.getGroup('g')

        group.hide()
        expect(api.getAppDeltas().map(d => [d.type, d.id, d.style.display]))
            .toEqual([['Widget', 'w1', 'none'], ['Widget', 'w2', 'none']])

        group.show()
        expect(api.getAppDeltas().slice(2).map(d => [d.type, d.id, d.style.display]))
            .toEqual([['Widget', 'w1', 'block'], ['Widget', 'w2', 'block']])

        group.toggle()
        expect(api.getAppDeltas().slice(4).map(d => [d.type, d.id, d.style.display]))
            .toEqual([['Widget', 'w1', 'none'], ['Widget', 'w2', 'none']])
    })

    test('a group accepts every animation a widget does, plus reveal', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('fadeIn')
        screen.getGroup('g').animate('fadeOut')
        screen.getGroup('g').animate('reveal')
        expect(api.getAppDeltas().map(d => d.animation)).toEqual(['fadeIn', 'fadeOut', 'reveal'])
    })

    test('a group fade carries a duration like a widget fade does', () => {
        const { api, screen } = setup()
        screen.getGroup('g').animate('fadeOut', { duration: 700 })
        expect(api.getAppDeltas()[0].duration).toBe(700)
    })

    test('rejects an animation neither a widget nor a group offers', () => {
        const { screen } = setup()
        expect(() => screen.getGroup('g').animate('zoomIn'))
            .toThrow(/Unknown animation "zoomIn".*fadeIn, fadeOut, reveal/)
    })

    /**
     * animate() is additive. It must not disturb the API every existing script
     * already uses, or a prototype that only ever hid and showed things would
     * change meaning.
     */
    test('leaves show, hide and toggle exactly as they were', () => {
        const { api, screen } = setup()
        const widget = screen.getWidget('b')

        widget.show()
        widget.hide()
        widget.toggle()

        const deltas = api.getAppDeltas()
        expect(deltas.map(d => [d.type, d.key, d.id, d.style.display]))
            .toEqual([
                ['Widget', 'style', 'w1', 'block'],
                ['Widget', 'style', 'w1', 'none'],
                ['Widget', 'style', 'w1', 'block']
            ])
    })

    test('isHidden still reads the model and not the pending deltas', () => {
        const { screen } = setup()
        const widget = screen.getWidget('b')
        expect(widget.isHidden()).toBe(true)
        widget.animate('fadeIn')
        expect(widget.isHidden()).toBe(true)
    })

    /**
     * Two animations on the same widget in one script run are applied in order.
     * An instant hide after a fade out wins, because the fade is still running
     * when the style lands. Documented rather than defended against.
     */
    test('records animations in the order they were asked for', () => {
        const { api, screen } = setup()
        const widget = screen.getWidget('b')
        widget.animate('fadeIn', { duration: 100 })
        widget.hide()
        widget.animate('fadeOut', { duration: 200 })

        expect(api.getAppDeltas().map(d => d.type))
            .toEqual(['WidgetAnimation', 'Widget', 'WidgetAnimation'])
    })
})
