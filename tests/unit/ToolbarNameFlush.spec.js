/**
 * The toolbar name inputs (widgetName / screenName / groupName) are single,
 * shared DOM elements which get repopulated for whatever is selected. The
 * selection fields (_selectedWidget etc) are assigned *after* cleanUp() has
 * already run _flushInputFields(), so the flush used to write the shared
 * input's contents into whichever object was selected at that moment.
 *
 * The visible symptom was widget names changing by themselves: renaming a
 * widget in the layer list while a *different* widget was selected pushed
 * the new name into the selected widget via the flush.
 *
 * The fix tracks which model id owns each input and only writes while that
 * owner is still the selected object. The guard has to sit in BOTH writers:
 * the flush in _flushInputFields() and the 'change' event that
 * _blurInputFields() provokes, since both funnel through setWidgetName().
 *
 * NOTE: Toolbar.vue is a .vue file and cannot be imported under this jest
 * config (no vue-jest transform, testEnvironment: node). So the ownership
 * contract is reproduced here as a plain-JS model of the shipped logic in
 * Toolbar.vue _flushInputFields / onModelNameChange / setWidgetName / cleanUp.
 */

function createToolbarState () {
	return {
		_selectedWidget: null,
		input: '',
		ownerID: null
	}
}

/** Mirrors showWidgetProperties(): fills the input and stamps the owner. */
function selectWidget (state, id, name) {
	state._selectedWidget = { id }
	state.input = name
	state.ownerID = id
}

/** Mirrors Toolbar.onModelNameChange(), reached from the layer list. */
function onModelNameChange (state, id, txt) {
	state.input = txt
	state.ownerID = state._selectedWidget && state._selectedWidget.id === id ? id : null
}

/** Mirrors Toolbar._flushInputFields(); returns the flushed value or null. */
function flushInputFields (state) {
	const selectedID = state._selectedWidget ? state._selectedWidget.id : null
	if (state.ownerID && state.ownerID === selectedID) {
		return state.input
	}
	return null
}

/** Mirrors Toolbar.cleanUp()'s teardown of the owner ids. */
function cleanUp (state) {
	state._selectedWidget = null
	state.ownerID = null
}

/**
 * Mirrors Toolbar.setWidgetName(), the choke point both entry points share:
 * the flush in _flushInputFields() and the 'change' event which
 * _blurInputFields() provokes. Returns the written value or null.
 */
function setWidgetName (state, value) {
	if (state._selectedWidget && state.ownerID === state._selectedWidget.id) {
		return value
	}
	return null
}

test('ToolbarNameFlush - renaming another widget in the layer list must not touch the selection', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	// The layer list renames a different widget. The shared input now holds
	// that foreign name while Alpha is still the selected object.
	onModelNameChange(state, 'wBeta', 'NewBeta')

	// A later model change re-enters the flush via cleanUp().
	expect(flushInputFields(state)).toBe(null)
})

test('ToolbarNameFlush - renaming the selected widget in the layer list is still flushed', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	onModelNameChange(state, 'wAlpha', 'Renamed')

	expect(state.ownerID).toBe('wAlpha')
	expect(flushInputFields(state)).toBe('Renamed')
})

test('ToolbarNameFlush - a name typed into the toolbar still commits on selection change', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	// The user types; ownership still belongs to Alpha.
	state.input = 'TypedName'
	expect(flushInputFields(state)).toBe('TypedName')
})

test('ToolbarNameFlush - cleanUp clears the owner so a stale input is never flushed', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	cleanUp(state)

	expect(state.ownerID).toBe(null)
	expect(flushInputFields(state)).toBe(null)
})

test('ToolbarNameFlush - no selection and no owner does not flush on a null === null match', () => {
	const state = createToolbarState()
	state._selectedWidget = null
	state.ownerID = null
	state.input = 'leftover'

	expect(flushInputFields(state)).toBe(null)
})

/**
 * The blur path is a second, independent writer. cleanUp() calls
 * _blurInputFields() right after the flush, and blurring an input the user
 * typed into fires 'change', which reaches setWidgetName() directly.
 */
test('ToolbarNameFlush - a name typed into the toolbar commits through the blur path', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	state.input = 'TypedName'

	// change fires on blur -> onWidgetNameChange -> setWidgetName
	expect(setWidgetName(state, state.input)).toBe('TypedName')
})

test('ToolbarNameFlush - typing, then renaming another widget in the layer list, must not leak on blur', () => {
	const state = createToolbarState()
	selectWidget(state, 'wAlpha', 'Alpha')

	// The user types into the name field, which marks it dirty.
	state.input = 'TypedName'

	// The layer list then renames a different widget. That overwrites the
	// shared input with a foreign name and drops the ownership, but the field
	// is still dirty, so the upcoming blur will fire 'change'.
	onModelNameChange(state, 'wBeta', 'NewBeta')

	expect(flushInputFields(state)).toBe(null)
	expect(setWidgetName(state, state.input)).toBe(null)
})