/** Return the first pre-load link, using the same ordering as Loaded links. */
export function getBeforeLoadLine (simulator, screen) {
    if (!simulator.runTimerLinesOnScreenLoad || !screen) return
    return simulator.getLineForGesture(simulator.getFromLines(screen), 'beforeLoad')
}

/** A new user navigation supersedes any pending asynchronous guard. */
export function beginNavigation (simulator, context) {
    if (context) return context
    simulator._navigationSequence = (simulator._navigationSequence || 0) + 1
    return {
        sequence: simulator._navigationSequence,
        sourceScreenID: simulator.currentScreen && simulator.currentScreen.id,
        historyRecorded: false,
        visited: new Set(),
        pending: []
    }
}

export function isNavigationActive (simulator, context) {
    return !simulator.isDestroyed && (!context || context.sequence === simulator._navigationSequence)
}

function reportFailure (simulator, result) {
    if (result && typeof result.catch === 'function') {
        result.catch(error => simulator.logger.error('beforeLoad', 'Action failed', error))
    }
}

/** Intercept an attempt before any screen rendering or cleanup takes place. */
export function interceptBeforeLoad (simulator, screen, context, resume) {
    const navigation = beginNavigation(simulator, context)
    if (!isNavigationActive(simulator, navigation)) return true
    if (!screen) return false
    if (navigation.bypassScreenID === screen.id) return false
    const line = getBeforeLoadLine(simulator, screen)
    if (!line) return false

    const pending = navigation.pending || (navigation.pending = [])
    const current = pending[pending.length - 1]
    if (current && current.screenID === screen.id) {
        pending.pop()
        const previousBypass = navigation.bypassScreenID
        navigation.bypassScreenID = screen.id
        try {
            reportFailure(simulator, current.resume())
        } catch (error) {
            simulator.logger.error('beforeLoad', 'Action failed', error)
        } finally {
            navigation.bypassScreenID = previousBypass
        }
        return true
    }
    if (!navigation.visited) navigation.visited = new Set()
    if (!navigation.beforeLoad && navigation.historyEntries && simulator.screenHistory) {
        navigation.historyEntries.forEach(entry => {
            const index = simulator.screenHistory.indexOf(entry)
            if (index >= 0) simulator.screenHistory.splice(index, 1)
        })
        navigation.historyRecorded = false
    }
    navigation.beforeLoad = true
    if (navigation.visited.has(screen.id)) {
        simulator.logger.warn('beforeLoad', 'Redirect loop at screen ' + screen.id)
        return true
    }
    navigation.visited.add(screen.id)
    pending.push({ screenID: screen.id, resume })

    try {
        reportFailure(simulator, simulator.executeLine(navigation.sourceScreenID || screen.id, null, line, navigation))
    } catch (error) {
        simulator.logger.error('beforeLoad', 'Action failed', error)
    }
    return true
}

/** Remember provisional history so a later pre-load interception can undo it. */
export function recordNavigationLine (simulator, line, screenID, context) {
    simulator.logLine(line, screenID)
    if (context) {
        context.historyRecorded = true
        if (simulator.screenHistory && simulator.screenHistory.length) {
            if (!context.historyEntries) context.historyEntries = []
            context.historyEntries.push(simulator.screenHistory[simulator.screenHistory.length - 1])
        }
    }
}

/** Record only the screen actually left, and only when a redirect succeeds. */
export function recordBeforeLoadNavigation (simulator, line, context) {
    if (context && context.beforeLoad && !context.historyRecorded && context.sourceScreenID) {
        simulator.logLine(line, context.sourceScreenID)
        context.historyRecorded = true
    }
}
