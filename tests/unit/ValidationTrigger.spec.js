import {
    TRIGGER_ON_CHANGE,
    TRIGGER_ON_NAVIGATE,
    getTrigger,
    validatesOnChange
} from '../../src/util/ValidationTrigger'

/**
 * The trigger lives on props.validation. Widgets authored before it existed have
 * no trigger at all, and those must keep validating on change, so "missing"
 * has to normalise to onChange rather than to something falsy.
 */
describe('ValidationTrigger', () => {

    describe('getTrigger', () => {

        test('defaults to onChange for a widget without validation', () => {
            expect(getTrigger(undefined)).toBe(TRIGGER_ON_CHANGE)
        })

        test('defaults to onChange when the trigger was never set', () => {
            expect(getTrigger({ required: true })).toBe(TRIGGER_ON_CHANGE)
        })

        test('returns the configured trigger', () => {
            expect(getTrigger({ trigger: TRIGGER_ON_CHANGE })).toBe(TRIGGER_ON_CHANGE)
            expect(getTrigger({ trigger: TRIGGER_ON_NAVIGATE })).toBe(TRIGGER_ON_NAVIGATE)
        })

        test('falls back to onChange for an unknown trigger', () => {
            expect(getTrigger({ trigger: 'onBlur' })).toBe(TRIGGER_ON_CHANGE)
            expect(getTrigger({ trigger: '' })).toBe(TRIGGER_ON_CHANGE)
            expect(getTrigger({ trigger: null })).toBe(TRIGGER_ON_CHANGE)
        })
    })

    describe('validatesOnChange', () => {

        test('is true when there is no validation at all', () => {
            expect(validatesOnChange(undefined)).toBe(true)
        })

        test('is true for a validation authored without a trigger', () => {
            expect(validatesOnChange({ required: true })).toBe(true)
        })

        test('is true for the onChange trigger', () => {
            expect(validatesOnChange({ trigger: TRIGGER_ON_CHANGE })).toBe(true)
        })

        test('is false for the onNavigate trigger', () => {
            expect(validatesOnChange({ trigger: TRIGGER_ON_NAVIGATE })).toBe(false)
        })

        test('is true for an unknown trigger, so nothing silently stops validating', () => {
            expect(validatesOnChange({ trigger: 'nonsense' })).toBe(true)
        })
    })
})