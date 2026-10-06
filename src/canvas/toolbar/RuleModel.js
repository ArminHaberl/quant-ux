/**
 * Pure rule logic for the logic-widget rule dialog.
 *
 * Everything in here has to be a plain function over plain data. Rule.vue is a
 * .vue file and jest.config.js deliberately ships no vue-jest transform, so a
 * component here is untestable; the decisions are kept on this side of the
 * boundary and covered by tests/unit/RuleModel.spec.js.
 *
 * The types in WIDGET_OUTPUT_TYPES are the model `type` of a widget, i.e. the
 * name used by the palette entries in src/themes/<set>/*.json, NOT the `name`
 * of the component in src/core/widgets/<Type>.vue.
 */

const WIDGET_OUTPUT_TYPES = {
	"ToggleButton": "active",
	"SegmentButton": "options",
	"SegmentPicker": "options",
	"DropDown": "options",
	"MobileDropDown": "options",
	"TextBox": "string",
	"TextArea": "string",
	"Password": "string",
	"CheckBox": "checked",
	"RadioBox": "checked",
	"RadioBox2": "checked",
	"IconToggleButton": "checked",
	"IconToggle": "checked",
	"LabeledCheckBox": "checked",
	"LabeledRadioBox": "checked",
	"LabeledIconToggle": "checked",
	"VisualPicker": "checked",
	"HSlider": "int",
	"Rating": "int",
	"CountingStepper": "int",
	"Spinner": "options",
	"Switch": "active",
	"DragNDrop": "pos",
	"Date": "date",
	"DateDropDown": "date",
	"RadioGroup": "options",
	"CheckBoxGroup": "options",
	"LabeledTextBox": "string",
	"LabeledTextArea": "string",
	"TypeAheadTextBox": "string"
}

/**
 * Operators offered for a databinding rule. Independent of the variable, so
 * changing the variable never invalidates a chosen operator.
 */
const DATABINDING_OPERATORS = [
	{"value": "==", label: "Equals (==)"},
	{"value": "!=", label: "Not Equals (!=)"},
	{"value": ">", label: "Bigger (>)"},
	{"value": "<", label: "Smaller (<)"},
	{"value": ">=", label: "Bigger Equals (>=)"},
	{"value": "<=", label: "Smaller Equals (<=)"}
]

/**********************************************************
 * Rows and transitions
 *
 * A transition mutates a rule and reports the rows it invalidated. Rule.vue has
 * a single re-render entry point that renders exactly what the transition
 * returned, so a setter cannot leave a row behind: it does not name rows at all.
 **********************************************************/

/**
 * The rows the dialog renders, in the order they appear.
 */
export const ROWS = ["type", "databinding", "rest", "widget", "operator", "value"]

/**
 * The renderer each row is drawn by, named as Rule.vue spells it.
 *
 * A map rather than a name convention, because the row key "databinding" is not
 * "renderDatabinding".
 */
export const ROW_RENDERERS = {
	"type": "renderType",
	"databinding": "renderDataBinding",
	"rest": "renderRest",
	"widget": "renderWidget",
	"operator": "renderOperator",
	"value": "renderValue"
}

/**
 * Every field a rule carries.
 */
const RULE_FIELDS = ["type", "databinding", "widget", "operator", "value", "restResponseStatus"]

/**
 * The fields each row reads when it renders.
 *
 * This is the whole reason the operator row went missing for a databinding
 * rule: getRuleOperators() returns null until there is a variable, so the row
 * depends on `databinding` and not only on `widget`. Putting the dependency
 * here rather than in Rule.vue is what makes it assertable.
 *
 * A row must not list its own field. renderDataBinding() reads
 * rule.databinding to pre-fill the input, but re-rendering on that would
 * destroy the very input the variable is being picked from.
 */
const ROW_DEPENDENCIES = {
	"type": ["type"],
	"databinding": ["type"],
	"rest": ["type", "restResponseStatus"],
	"widget": ["type"],
	"operator": ["type", "widget", "databinding"],
	"value": ["type", "widget", "databinding", "operator"]
}

/**
 * The rows to re-render after the given rule fields changed, in dialog order.
 *
 * An unknown field throws rather than resolving to nothing: a setter that names
 * a field this table does not know about is a bug, and the alternative is a
 * silent no-op that looks exactly like a row that has nothing to show.
 */
export function getDirtyRows (changedFields) {
	for (let i = 0; i < changedFields.length; i++) {
		if (RULE_FIELDS.indexOf(changedFields[i]) < 0) {
			throw new Error("getDirtyRows() > unknown rule field " + changedFields[i])
		}
	}
	return ROWS.filter(function (row) {
		return ROW_DEPENDENCIES[row].some(function (field) {
			return changedFields.indexOf(field) >= 0
		})
	})
}

/**
 * Switch the kind of rule. Nothing survives a change of kind, so every row is
 * rebuilt.
 */
export function applyType (rule, type) {
	if (rule.type === type) {
		return null
	}
	rule.type = type
	rule.operator = null
	rule.value = null
	rule.databinding = null
	rule.widget = null
	return getDirtyRows(["type"])
}

/**
 * Point the rule at a databinding variable.
 *
 * The operator row is reported because it does not exist until there is a
 * variable to compare, and its option list does not depend on which variable
 * that is, so a chosen operator is deliberately left in place.
 */
export function applyDataBinding (rule, databinding) {
	if (rule.type !== 'databinding' || rule.databinding === databinding) {
		return null
	}
	rule.databinding = databinding
	rule.value = null
	return getDirtyRows(["databinding"])
}

/**
 * Match on the response status of a Rest widget.
 */
export function applyRest (rule, restResponseStatus) {
	if (rule.restResponseStatus === restResponseStatus) {
		return null
	}
	rule.restResponseStatus = restResponseStatus
	rule.operator = null
	rule.value = null
	return getDirtyRows(["restResponseStatus", "operator", "value"])
}

/**
 * Point the rule at a widget. The available operators depend on the type of
 * that widget, so the operator row is rebuilt even though its own value is
 * cleared rather than changed.
 */
export function applyWidget (rule, id) {
	if (rule.widget === id) {
		return null
	}
	rule.widget = id
	rule.operator = null
	rule.value = null
	rule.databinding = null
	return getDirtyRows(["widget", "databinding"])
}

/**
 * Choose the comparison. Only the value row reads it, and the operator row is
 * left alone because it is the control the user is pressing.
 */
export function applyOperator (rule, operator) {
	if (rule.operator === operator) {
		return null
	}
	rule.operator = operator
	return getDirtyRows(["operator"])
}

/**
 * Set the value compared against. Nothing reads it except the value row, which
 * is the input currently being typed into, so no row is rebuilt.
 */
export function applyRuleValue (rule, value) {
	if (rule.value === value) {
		return null
	}
	rule.value = value
	return getDirtyRows(["value"])
}

/**
 * How a rule value is compared, derived from the type of the widget it is
 * attached to.
 */
export function getOutputType (widget) {
	if (!widget || !widget.type) {
		return null
	}
	return WIDGET_OUTPUT_TYPES[widget.type] || null
}

/**
 * The declared validation of a widget, e.g. {type:"int"}. Returns null when the
 * widget has none.
 */
export function getValidationType (widget) {
	if (widget && widget.props && widget.props.validation && widget.props.validation.type) {
		return widget.props.validation.type
	}
	return null
}

/**
 * The operators legal for a rule on `widget`.
 *
 * Values are de-duplicated: DropDownButton keys its list items by value
 * (src/common/DropDownButton.vue renderOptions), so a repeated value renders
 * twice and only the last copy is reachable.
 */
export function getOperators (widget) {
	const type = getOutputType(widget)
	const result = []
	switch (type) {
		case "checked":
			result.push({"value": "checked", label: "Checked"})
			result.push({"value": "notchecked", label: "Not Checked"})
			break
		case "active":
			result.push({"value": "active", label: "Active"})
			result.push({"value": "notactive", label: "Not Active"})
			break
		case "date":
			result.push({"value": "isValid", label: "Is valid"})
			break
		case "string":
			result.push({"value": "isValid", label: "Is valid"})
			result.push({"value": "==", label: "Equals (==)"})
			result.push({"value": "!=", label: "Not Equals (!=)"})
			result.push({"value": "contains", label: "Matches (~)"})
			break
		case "int":
			result.push({"value": "isValid", label: "Is valid"})
			result.push({"value": "==", label: "Equals (==)"})
			result.push({"value": "!=", label: "Not Equals (!=)"})
			pushComparisonOperators(result)
			break
		case "options":
			result.push({"value": "==", label: "Equals"})
			result.push({"value": "!=", label: "Not Equals"})
			break
		default:
			/**
			 * A widget we have no output type for. An empty list leaves the
			 * caller with a dropdown it cannot use, so it must not be shown as
			 * a selectable source. See isRuleValid(), which stays permissive
			 * for a rule that already points at such a widget.
			 */
			console.warn("getOperators() > not supported type", widget && widget.type, type)
			return []
	}

	/**
	 * A TextBox with a numeric validation is stored as a string but compares
	 * numerically, so it gets the comparison operators on top of the string
	 * ones. A "string" validation adds nothing: `contains` is already offered
	 * above and used to be pushed a second time with a different label, which
	 * left two unreachable entries in the list.
	 */
	if (type === "string") {
		const validationType = getValidationType(widget)
		if (validationType === "int" || validationType === "double") {
			pushComparisonOperators(result)
		}
	}

	return dedupeOperators(result)
}

/**
 * The operators offered for a rule that compares a databinding variable.
 */
export function getDatabindingOperators () {
	return DATABINDING_OPERATORS.slice()
}

function pushComparisonOperators (result) {
	result.push({"value": ">", label: "Bigger (>)"})
	result.push({"value": "<", label: "Smaller (<)"})
	result.push({"value": ">=", label: "Bigger Equals (>=)"})
	result.push({"value": "<=", label: "Smaller Equals (<=)"})
}

function dedupeOperators (operators) {
	const seen = {}
	const result = []
	for (let i = 0; i < operators.length; i++) {
		const value = operators[i].value
		if (!seen[value]) {
			seen[value] = true
			result.push(operators[i])
		}
	}
	return result
}

/**
 * The selectable values of a widget that has a fixed set of options.
 */
export function getOptions (widget) {
	const result = []
	const options = widget && widget.props && widget.props.options
	if (options) {
		for (let i = 0; i < options.length; i++) {
			result.push({"value": options[i], label: options[i]})
		}
	}
	return result
}

/**
 * The widgets a rule may point at, as {value:id,label:name}.
 *
 * When screenIDs is given the candidates are restricted to the widgets of those
 * screens, which is what ActionButton.getScreenIDs() collects: the screens on the
 * path leading into the logic widget. Falling back to the whole model means the
 * rule can reference a widget that does not exist on the screen it runs on, so
 * it is the last resort and not the default.
 */
export function getUIWidgets (model, screenIDs, outputTypes) {
	const types = outputTypes || WIDGET_OUTPUT_TYPES
	const result = []
	const seen = {}

	const add = (widget) => {
		if (!widget || !types[widget.type]) {
			return
		}
		if (!seen[widget.id]) {
			seen[widget.id] = true
			result.push({"value": widget.id, label: widget.name})
		}
	}

	if (!model) {
		return result
	}

	if (screenIDs && screenIDs.length > 0) {
		for (let i = 0; i < screenIDs.length; i++) {
			const screen = model.screens ? model.screens[screenIDs[i]] : null
			if (!screen) {
				console.warn("getUIWidgets() > No screen with id : ", screenIDs[i])
				continue
			}
			const children = screen.children || []
			for (let j = 0; j < children.length; j++) {
				add(model.widgets[children[j]])
			}
		}
	} else if (model.widgets) {
		for (let id in model.widgets) {
			add(model.widgets[id])
		}
	}

	result.sort(function (a, b) {
		return (a.label || "").localeCompare(b.label || "")
	})

	return result
}

/**
 * The logic widget that owns a line, used to decide which rule types apply.
 * A line of a Rest widget gets an extra "rest" type; an OR connector does not.
 */
export function findFromWidget (widgets, fromID) {
	if (!widgets || !fromID) {
		return null
	}
	for (let id in widgets) {
		const widget = widgets[id]
		if (widget && widget.id === fromID) {
			return widget
		}
	}
	return null
}

/**
 * The rule types offered in the dialog.
 */
export function getTypeOptions (fromWidget) {
	const result = [
		{value: "widget", label: "Widget"},
		{value: "databinding", label: "DataBinding"}
	]
	if (fromWidget && fromWidget.type === "Rest") {
		result.push({value: "rest", label: "Rest"})
	}
	return result
}

/**
 * Every databinding path reachable in the app, de-duplicated and sorted.
 *
 * This is the union Layout.getAllAppVariables() and getHintsAppVariables()
 * return, minus their duplicates: both walk every widget in the model and both
 * pushed rest hint keys unguarded, so two Rest widgets with the same response
 * produced the same path twice in the picker.
 *
 * The paths are the ones Simulator.getDataBindingByPath() resolves, i.e. keys of
 * the data binding store, not the values of a widget's props.databinding map.
 */
export function getAppVariablePaths (model) {
	const paths = []

	const add = (path) => {
		if (path && paths.indexOf(path) < 0) {
			paths.push(path)
		}
	}

	if (model && model.widgets) {
		for (let id in model.widgets) {
			const widget = model.widgets[id]
			if (!widget) {
				continue
			}
			const props = widget.props || {}

			if (props.databinding) {
				for (let key in props.databinding) {
					add(props.databinding[key])
				}
			}

			/**
			 * The rest widget keeps its output at a different place
			 */
			const output = props.rest ? props.rest.output : null
			if (output) {
				add(output.databinding)
				if (output.hints) {
					for (let key in output.hints) {
						add(key.replace(/_/g, "."))
					}
				}
			}

			/**
			 * Workflows can be bound to variables too
			 */
			if (widget.action && widget.action.type === "workflow" && widget.action.steps) {
				const steps = widget.action.steps
				for (let i = 0; i < steps.length; i++) {
					add(steps[i].databinding)
				}
			}
		}
	}

	paths.sort(function (a, b) {
		return a.localeCompare(b)
	})

	return paths
}

/**
 * Parse a value typed into the rule dialog. Returns null when it does not match
 * the expected type, which is the signal for the caller to mark the field.
 *
 * "double" used to be run through parseInt, so "1.5" was stored as 1 and the
 * rule silently compared against the wrong number.
 */
export function parseRuleValue (value, type) {
	if (value === null || value === undefined || value === "") {
		return null
	}
	const text = String(value).trim()
	if (type === "int") {
		if (/^-?[0-9]+$/.test(text)) {
			return parseInt(text, 10)
		}
		return null
	}
	if (type === "double") {
		const normalized = text.replace(",", ".")
		if (/^-?[0-9]+(\.[0-9]+)?$/.test(normalized)) {
			return parseFloat(normalized)
		}
		return null
	}
	return null
}

/**
 * Whether a rule can be saved.
 *
 * `widget` is the model widget rule.widget points at, or null when it cannot be
 * resolved. A rule we cannot check is accepted rather than locked out: the user
 * would have no way to fix it, since the dialog cannot show the offending row.
 */
export function isRuleValid (rule, widget) {
	if (!rule) {
		return false
	}
	if (rule.type === "rest") {
		return true
	}
	if (rule.type === "widget") {
		if (rule.widget == null || rule.operator == null) {
			return false
		}
		if (!widget) {
			return true
		}
		const operators = getOperators(widget)
		if (operators.length === 0) {
			return true
		}
		return operators.some(function (o) {
			return o.value === rule.operator
		})
	}
	if (rule.type === "databinding") {
		return rule.databinding != null && rule.databinding !== "" && rule.operator != null
	}
	return true
}

/**
 * The reason a rule cannot be saved, or "" when it can.
 */
export function getRuleError (rule, widget) {
	if (!rule) {
		return "The rule is empty"
	}
	if (rule.type === "rest") {
		return ""
	}
	if (rule.type === "widget") {
		if (rule.widget == null) {
			return "Select a widget"
		}
		if (rule.operator == null) {
			return "Select an operator"
		}
		if (widget) {
			const operators = getOperators(widget)
			if (operators.length > 0 && !operators.some(function (o) {
				return o.value === rule.operator
			})) {
				return "The operator " + rule.operator + " is not supported by this widget"
			}
		}
		return ""
	}
	if (rule.type === "databinding") {
		if (rule.databinding == null || rule.databinding === "") {
			return "Select a databinding variable"
		}
		if (rule.operator == null) {
			return "Select an operator"
		}
		return ""
	}
	return ""
}

/**
 * The one line summary shown on the rule button in the toolbar.
 *
 * The result is inserted as HTML, so the comparison operators stay escaped.
 */
export function getRuleLabel (rule, widgets) {
	if (!rule) {
		return "???"
	}
	const widget = rule.widget && widgets ? widgets[rule.widget] : null
	let label = "???"
	if (widget) {
		label = widget.name + " "
	} else if (rule.databinding) {
		label = '${' + rule.databinding + '}'
	} else if (rule.restResponseStatus === "200") {
		label = "Request OK"
	} else if (rule.restResponseStatus === "4xx") {
		label = "Request ERROR"
	}

	switch (rule.operator) {
		case "isValid":
			label += " is valid"
			break
		case "checked":
			label += " == checked"
			break
		case "notchecked":
			label += " != checked"
			break
		case "active":
			label += " == active"
			break
		case "notactive":
			label += " != active"
			break
		case "contains":
			label += " ~ "
			break
		case "==":
			label += " == "
			break
		case "!=":
			label += " != "
			break
		case ">":
			label += " &gt; "
			break
		case "<":
			label += " &lt; "
			break
		case ">=":
			label += " &gt;= "
			break
		case "<=":
			label += " &lt;= "
			break
		default:
			if (rule.operator != null) {
				console.warn("getRuleLabel() > not supported operator", rule.operator)
			}
	}

	if (rule.value) {
		label += rule.value
	}

	return label
}

export {WIDGET_OUTPUT_TYPES}
