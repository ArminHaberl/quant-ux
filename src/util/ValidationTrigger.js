/**
 * When a widget checks its validation and shows its error.
 *
 * The trigger lives on the validation itself (props.validation.trigger), because
 * it describes when the validation that was authored for a field should run.
 *
 *   "onChange"    the default, and what every screen published before this
 *                 option existed does implicitly: validate as soon as the value
 *                 changes, including changes that arrive through a data binding.
 *
 *   "onNavigate"  validate only when the user tries to leave the page. This
 *                 matters for widgets that write to their own bound variable:
 *                 every such write echoes back through
 *                 Simulator.onUIWidgetDataBinding -> updateAllDataBindings ->
 *                 UIWidget.setDataBinding, so an "onChange" widget validates on
 *                 every single interaction even when the user did not type
 *                 anything.
 *
 * Note that "onNavigate" only produces a visible error if the transition line
 * the user follows has validation.all set ("All fields valid"), because
 * Simulator.canPerformTransition() returns early when it is not.
 */

export const TRIGGER_ON_CHANGE = 'onChange'
export const TRIGGER_ON_NAVIGATE = 'onNavigate'

/**
 * The trigger configured for a validation, normalised.
 *
 * @param validation the props.validation object, may be undefined
 * @return TRIGGER_ON_CHANGE or TRIGGER_ON_NAVIGATE
 */
export function getTrigger (validation) {
    const trigger = validation && validation.trigger
    return trigger === TRIGGER_ON_NAVIGATE ? TRIGGER_ON_NAVIGATE : TRIGGER_ON_CHANGE
}

/**
 * Whether a widget should validate in response to value changes, as opposed to
 * waiting for a page navigation.
 *
 * Anything we do not recognise falls back to "onChange", so a widget that has no
 * validation at all, or one authored before the trigger existed, keeps the
 * behaviour it always had.
 *
 * @param validation the props.validation object, may be undefined
 * @return boolean
 */
export function validatesOnChange (validation) {
    return getTrigger(validation) !== TRIGGER_ON_NAVIGATE
}