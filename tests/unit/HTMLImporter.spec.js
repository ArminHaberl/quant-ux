import HTMLImporter from '../../src/core/ai/HTMLImporter'

/**
 * scalledApp scaled y and w but left x and h alone. It only runs when the
 * imported content is wider than the target screen, and in that case the
 * unscaled x positions pushed widgets off the right edge of the screen and
 * the unscaled heights overlapped each other.
 */
function wideApp() {
    /**
     * Two widgets side by side, so the content is 800 wide and the target
     * screen is 400: f = 0.5.
     */
    return {
        screenSize: { w: 400, h: 800 },
        widgets: {
            left: { id: 'left', type: 'Button', x: 0, y: 100, w: 200, h: 40, style: {} },
            right: { id: 'right', type: 'Button', x: 600, y: 200, w: 200, h: 40, style: { fontSize: 20 } }
        },
        screens: {
            s1: { id: 's1', name: 'S1', x: 0, y: 0, w: 800, h: 800, children: ['left', 'right'] }
        },
        lines: {}
    }
}

test('HTMLImporter.scalledApp() > scales x as well as y', () => {
    const app = wideApp()
    new HTMLImporter().scalledApp(app)
    expect(app.widgets.left.x).toBe(0)
    /**
     * Was 600, which is far outside the 400 wide target screen.
     */
    expect(app.widgets.right.x).toBe(300)
})

test('HTMLImporter.scalledApp() > scales h as well as w', () => {
    const app = wideApp()
    new HTMLImporter().scalledApp(app)
    expect(app.widgets.left.h).toBe(20)
    expect(app.widgets.right.h).toBe(20)
})

test('HTMLImporter.scalledApp() > scales w and y as before', () => {
    const app = wideApp()
    new HTMLImporter().scalledApp(app)
    expect(app.widgets.left.w).toBe(100)
    expect(app.widgets.left.y).toBe(50)
    expect(app.widgets.right.y).toBe(100)
})

test('HTMLImporter.scalledApp() > scales the font size', () => {
    const app = wideApp()
    new HTMLImporter().scalledApp(app)
    expect(app.widgets.right.style.fontSize).toBe(10)
})

test('HTMLImporter.scalledApp() > leaves everything alone when it already fits', () => {
    const app = wideApp()
    app.screenSize = { w: 800, h: 800 }
    new HTMLImporter().scalledApp(app)
    expect(app.widgets.right.x).toBe(600)
    expect(app.widgets.right.h).toBe(40)
})