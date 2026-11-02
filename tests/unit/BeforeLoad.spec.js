import { beginNavigation, getBeforeLoadLine, interceptBeforeLoad, recordNavigationLine, recordBeforeLoadNavigation } from '../../src/core/simulator/BeforeLoad'
import ModelUtil from '../../src/core/ModelUtil'
import * as TestUtil from './TestUtil'
import app from './data/simSimpleForm.json'

function simulator (lines, currentScreen = { id: 'previous' }) {
    return {
        runTimerLinesOnScreenLoad: true,
        currentScreen,
        screenHistory: [],
        logger: { warn: jest.fn(), error: jest.fn() },
        getFromLines: screen => lines.filter(line => line.from === screen.id),
        getLineForGesture: (items, event) => items.find(line => line.event === event),
        logLine (line, screenID) { this.screenHistory.push({ line, screenID }) },
        executeLine: jest.fn()
    }
}

function navigationHarness (lines, currentScreen) {
    const sim = simulator(lines, currentScreen)
    sim.rendered = []
    sim.navigate = (screen, options, context) => {
        const navigation = beginNavigation(sim, context)
        const render = () => {
            // Normal transitions pass through both the transition and screen renderer.
            if (interceptBeforeLoad(sim, screen, navigation, render)) return
            recordBeforeLoadNavigation(sim, options.line, navigation)
            sim.rendered.push({ screen: screen.id, options })
            sim.currentScreen = screen
        }
        if (!interceptBeforeLoad(sim, screen, navigation, render)) render()
    }
    return sim
}

/** Loaded actions used to run only after rendering, so they could not prevent a screen from appearing. */
test('intercepts a screen or overlay before rendering and runs only its first before-load link', () => {
    const lines = [
        { from: 'target', to: 'logic', event: 'beforeLoad' },
        { from: 'target', to: 'other', event: 'beforeLoad' },
        { from: 'target', to: 'loaded', event: 'loaded' }
    ]
    const sim = simulator(lines)
    const target = { id: 'target', style: { overlay: true } }
    expect(interceptBeforeLoad(sim, target)).toBe(true)
    expect(sim.executeLine).toHaveBeenCalledTimes(1)
    expect(sim.executeLine).toHaveBeenCalledWith('previous', null, lines[0], expect.objectContaining({ beforeLoad: true }))
    expect(sim.screenHistory).toEqual([])
})

/** Ordinary screens and editor previews must not accidentally start before-load actions. */
test('leaves normal and loaded links alone and honors disabled automatic triggers', () => {
    const line = { from: 'target', to: 'logic', event: 'loaded' }
    const sim = simulator([line])
    const screen = { id: 'target' }
    expect(interceptBeforeLoad(sim, screen)).toBe(false)
    line.event = 'beforeLoad'
    sim.runTimerLinesOnScreenLoad = false
    expect(getBeforeLoadLine(sim, screen)).toBeUndefined()
    expect(interceptBeforeLoad(sim, screen)).toBe(false)
    expect(sim.executeLine).not.toHaveBeenCalled()
})

/** A guard reached through logic must not leave a history entry for a screen that never opened. */
test('removes provisional history and records the real source only for a successful redirect', () => {
    const guard = { from: 'protected', to: 'logic', event: 'beforeLoad' }
    const sim = simulator([guard])
    const existing = { line: { to: 'previous' }, screenID: 'older' }
    sim.screenHistory.push(existing)
    const context = { sourceScreenID: 'previous', historyRecorded: false, visited: new Set() }
    recordNavigationLine(sim, { to: 'logic' }, 'previous', context)
    recordNavigationLine(sim, { to: 'protected' }, 'previous', context)
    expect(interceptBeforeLoad(sim, { id: 'protected' }, context)).toBe(true)
    expect(sim.screenHistory).toEqual([existing])

    const redirect = { from: 'logic', to: 'login' }
    recordBeforeLoadNavigation(sim, redirect, context)
    recordBeforeLoadNavigation(sim, redirect, context)
    expect(sim.screenHistory).toEqual([existing, { line: redirect, screenID: 'previous' }])
})

/** A guarded start screen has no current screen and must not create a fictitious back entry. */
test('runs the start-screen action without recording nonexistent history', () => {
    const guard = { from: 'start', to: 'login', event: 'beforeLoad' }
    const sim = simulator([guard], null)
    expect(interceptBeforeLoad(sim, { id: 'start' })).toBe(true)
    const context = sim.executeLine.mock.calls[0][3]
    expect(sim.executeLine.mock.calls[0][0]).toBe('start')
    recordBeforeLoadNavigation(sim, guard, context)
    expect(sim.screenHistory).toEqual([])
})

/** Redirecting back to a guarded screen, even asynchronously, must not recurse forever. */
test('stops redirect cycles while allowing a later independent attempt', async () => {
    const lines = [
        { from: 'a', to: 'b', event: 'beforeLoad' },
        { from: 'b', to: 'a', event: 'beforeLoad' }
    ]
    const sim = simulator(lines)
    sim.executeLine.mockImplementation(async (screenID, widgetID, line, context) => {
        await Promise.resolve()
        interceptBeforeLoad(sim, { id: line.to }, context)
    })
    expect(interceptBeforeLoad(sim, { id: 'a' })).toBe(true)
    await Promise.resolve()
    await Promise.resolve()
    expect(sim.executeLine).toHaveBeenCalledTimes(2)
    expect(sim.logger.warn).toHaveBeenCalledTimes(1)
    expect(interceptBeforeLoad(sim, { id: 'a' })).toBe(true)
    expect(sim.executeLine).toHaveBeenCalledTimes(3)
})

/** A rejected asynchronous action must not cause the blocked screen to load or an unhandled rejection. */
test('reports failed actions while keeping the screen blocked', async () => {
    const sim = simulator([{ from: 'target', event: 'beforeLoad', to: 'script' }])
    const error = new Error('script failed')
    sim.executeLine.mockRejectedValue(error)
    expect(interceptBeforeLoad(sim, { id: 'target' })).toBe(true)
    await Promise.resolve()
    expect(sim.logger.error).toHaveBeenCalledWith('beforeLoad', 'Action failed', error)
})

/** A guard choosing its own screen used to be rejected as a redirect loop. */
test('continues the original transition once and runs the guard again on a later visit', () => {
    const guard = { from: 'protected', to: 'check', event: 'beforeLoad' }
    const sim = navigationHarness([guard], { id: 'previous' })
    const screen = { id: 'protected' }
    const original = { line: { to: 'protected', animation: 'slide', duration: 500 }, overlay: false }
    sim.executeLine.mockImplementation((screenID, widgetID, line, context) => {
        sim.navigate(screen, { line: { to: 'protected' }, overlay: false }, context)
    })

    sim.navigate(screen, original)
    expect(sim.rendered).toEqual([{ screen: 'protected', options: original }])
    expect(sim.executeLine).toHaveBeenCalledTimes(1)
    expect(sim.screenHistory).toEqual([{ screenID: 'previous', line: original.line }])
    expect(sim.logger.warn).not.toHaveBeenCalled()

    sim.navigate(screen, original)
    expect(sim.executeLine).toHaveBeenCalledTimes(2)
    expect(sim.rendered).toHaveLength(2)
})

/** A guarded start screen or overlay must resume its original rendering mode. */
test.each([
    ['start screen', null, false],
    ['overlay', { id: 'previous' }, true]
])('continues a guarded %s', (label, current, overlay) => {
    const guard = { from: 'target', to: 'check', event: 'beforeLoad' }
    const sim = navigationHarness([guard], current)
    const screen = { id: 'target' }
    const original = { line: { to: 'target', animation: 'fade' }, overlay }
    sim.executeLine.mockImplementation((screenID, widgetID, line, context) => {
        sim.navigate(screen, { line: { to: 'target' }, overlay: !overlay }, context)
    })
    sim.navigate(screen, original)
    expect(sim.rendered).toEqual([{ screen: 'target', options: original }])
    expect(sim.screenHistory).toHaveLength(current ? 1 : 0)
})

/** A denial must redirect without ever rendering the protected screen. */
test('redirects to a different screen and leaves the original screen unopened', () => {
    const guard = { from: 'protected', to: 'check', event: 'beforeLoad' }
    const sim = navigationHarness([guard], { id: 'previous' })
    const redirect = { line: { to: 'login' }, overlay: false }
    sim.executeLine.mockImplementation((screenID, widgetID, line, context) => {
        sim.navigate({ id: 'login' }, redirect, context)
    })
    sim.navigate({ id: 'protected' }, { line: { to: 'protected' }, overlay: false })
    expect(sim.rendered).toEqual([{ screen: 'login', options: redirect }])
    expect(sim.screenHistory).toEqual([{ screenID: 'previous', line: redirect.line }])
})

/** A redirected screen may have its own guard, which must resume that screen rather than the first one. */
test('continues the innermost guarded redirect', () => {
    const lines = [
        { from: 'a', to: 'checkA', event: 'beforeLoad' },
        { from: 'b', to: 'checkB', event: 'beforeLoad' }
    ]
    const sim = navigationHarness(lines, { id: 'previous' })
    const redirect = { line: { to: 'b', animation: 'fade' }, overlay: true }
    sim.executeLine.mockImplementation((screenID, widgetID, line, context) => {
        sim.navigate({ id: 'b' }, line.to === 'checkA' ? redirect : { line: { to: 'b' }, overlay: false }, context)
    })
    sim.navigate({ id: 'a' }, { line: { to: 'a' }, overlay: false })
    expect(sim.rendered).toEqual([{ screen: 'b', options: redirect }])
    expect(sim.executeLine).toHaveBeenCalledTimes(2)
})

/** A guard can await data before choosing to resume the original navigation. */
test('continues after an asynchronous guard completes', async () => {
    const guard = { from: 'protected', to: 'check', event: 'beforeLoad' }
    const sim = navigationHarness([guard], { id: 'previous' })
    let finish
    const wait = new Promise(resolve => { finish = resolve })
    sim.executeLine.mockImplementation(async (screenID, widgetID, line, context) => {
        await wait
        sim.navigate({ id: 'protected' }, { line: { to: 'protected' } }, context)
    })
    const original = { line: { to: 'protected', animation: 'slide' }, overlay: false }
    sim.navigate({ id: 'protected' }, original)
    expect(sim.rendered).toEqual([])
    finish()
    await wait
    await Promise.resolve()
    expect(sim.rendered).toEqual([{ screen: 'protected', options: original }])
})

/** An async guard must not reopen its original screen after the user navigates elsewhere. */
test('ignores an outdated asynchronous continuation', async () => {
    const guard = { from: 'protected', to: 'check', event: 'beforeLoad' }
    const sim = navigationHarness([guard], { id: 'previous' })
    let finish
    const wait = new Promise(resolve => { finish = resolve })
    sim.executeLine.mockImplementation(async (screenID, widgetID, line, context) => {
        await wait
        sim.navigate({ id: 'protected' }, { line: { to: 'protected' }, overlay: false }, context)
    })
    sim.navigate({ id: 'protected' }, { line: { to: 'protected' }, overlay: false })
    const other = { line: { to: 'other' }, overlay: false }
    sim.navigate({ id: 'other' }, other)
    finish()
    await wait
    await Promise.resolve()
    expect(sim.rendered).toEqual([{ screen: 'other', options: other }])
    expect(sim.logger.warn).not.toHaveBeenCalled()
})

/** The new trigger must survive saving, scaling, undo, and redo like other line events. */
test('stores before-load triggers on screen links', () => {
    const source = TestUtil.clone(app)
    const id = Object.keys(source.lines)[0]
    source.lines[id].from = Object.keys(source.screens)[0]
    const [controller, model] = TestUtil.createController(source)
    const previousEvent = model.lines[id].event
    controller.updateLineProperties(id, 'event', 'beforeLoad')
    expect(ModelUtil.createScalledModelFast(model, 0.5, false).lines[id].event).toBe('beforeLoad')
    controller.undoChangeStack()
    expect(model.lines[id].event).toBe(previousEvent)
    controller.redoChangeStack()
    expect(model.lines[id].event).toBe('beforeLoad')
})
