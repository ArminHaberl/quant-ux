import * as RuleModel from '../../src/canvas/toolbar/RuleModel'

function widget(type, props) {
    return { id: 'w1', name: 'A widget', type: type, props: props || {} }
}

function values(operators) {
    return operators.map(o => o.value)
}

describe('RuleModel.getOperators', () => {
    /**
     * A string widget with a "string" validation used to get `contains` twice:
     * once from the base list and once from the validation switch, under a
     * second label. DropDownButton keys its list items by value
     * (src/common/DropDownButton.vue renderOptions), so the second entry
     * overwrote the first and the operator list showed "Matches (~)" and
     * "Contains" as two rows that both emitted the same value, with only one of
     * them reachable and highlightable.
     */
    test('offers contains once for a string widget with a string validation', () => {
        const operators = RuleModel.getOperators(widget('TextBox', { validation: { type: 'string' } }))
        expect(values(operators)).toEqual(['isValid', '==', '!=', 'contains'])
    })

    /**
     * The comparison operators are appended for a numeric validation and must
     * not be repeated for a plain one. `contains` stays on the list, it was
     * there before and Simulator answers a non string with false.
     */
    test('adds the comparison operators once for a numerically validated TextBox', () => {
        const operators = RuleModel.getOperators(widget('TextBox', { validation: { type: 'int' } }))
        expect(values(operators)).toEqual(['isValid', '==', '!=', 'contains', '>', '<', '>=', '<='])
    })

    test('adds the comparison operators for a double validated TextBox', () => {
        const operators = RuleModel.getOperators(widget('TextBox', { validation: { type: 'double' } }))
        expect(values(operators)).toEqual(['isValid', '==', '!=', 'contains', '>', '<', '>=', '<='])
    })

    test('leaves a plain TextBox without the comparison operators', () => {
        const operators = RuleModel.getOperators(widget('TextBox'))
        expect(values(operators)).toEqual(['isValid', '==', '!=', 'contains'])
    })

    test('returns checked and notchecked for a CheckBox', () => {
        expect(values(RuleModel.getOperators(widget('CheckBox')))).toEqual(['checked', 'notchecked'])
    })

    test('returns active and notactive for a Switch', () => {
        expect(values(RuleModel.getOperators(widget('Switch')))).toEqual(['active', 'notactive'])
    })

    /**
     * An unmapped type produced an empty operator list, which put an empty
     * dropdown in the dialog with nothing to pick and no explanation. The empty
     * list is now what callers check to decide whether to show the row at all.
     */
    test('returns nothing for a widget type it has no output type for', () => {
        expect(RuleModel.getOperators(widget('ImageCarousel'))).toEqual([])
    })

    test('returns nothing for a missing widget', () => {
        expect(RuleModel.getOperators(null)).toEqual([])
    })

    test('maps the labeled widget variants the same as their plain counterpart', () => {
        expect(values(RuleModel.getOperators(widget('LabeledCheckBox')))).toEqual(['checked', 'notchecked'])
        expect(values(RuleModel.getOperators(widget('LabeledTextBox')))).toEqual(['isValid', '==', '!=', 'contains'])
        expect(values(RuleModel.getOperators(widget('IconToggle')))).toEqual(['checked', 'notchecked'])
    })
})

describe('RuleModel.isRuleValid', () => {
    /**
     * A rule saved against a TextBox kept its operator when the validation that
     * made the operator legal was removed from the widget, and the dialog then
     * rendered an operator row the rule could not satisfy.
     */
    test('rejects a widget rule whose operator the widget no longer supports', () => {
        const target = widget('TextBox')
        const rule = { type: 'widget', widget: 'w1', operator: '>' }
        expect(RuleModel.isRuleValid(rule, target)).toBe(false)
        expect(RuleModel.getRuleError(rule, target)).toBe('The operator > is not supported by this widget')
    })

    test('accepts a widget rule whose operator the widget supports', () => {
        const target = widget('CheckBox')
        const rule = { type: 'widget', widget: 'w1', operator: 'checked' }
        expect(RuleModel.isRuleValid(rule, target)).toBe(true)
        expect(RuleModel.getRuleError(rule, target)).toBe('')
    })

    /**
     * `isValid` needs no value, so a missing one is not a reason to refuse.
     */
    test('accepts isValid without a value', () => {
        const target = widget('TextBox')
        const rule = { type: 'widget', widget: 'w1', operator: 'isValid', value: null }
        expect(RuleModel.isRuleValid(rule, target)).toBe(true)
    })

    test('rejects a widget rule without a widget', () => {
        expect(RuleModel.isRuleValid({ type: 'widget', widget: null, operator: '==' }, widget('CheckBox'))).toBe(false)
    })

    test('rejects a widget rule without an operator', () => {
        const rule = { type: 'widget', widget: 'w1', operator: null }
        expect(RuleModel.isRuleValid(rule, widget('CheckBox'))).toBe(false)
        expect(RuleModel.getRuleError(rule, widget('CheckBox'))).toBe('Select an operator')
    })

    /**
     * An empty operator list means the widget type is not mapped. Refusing here
     * would lock the user out, because the dialog cannot render a row to fix it
     * in.
     */
    test('accepts a rule on a widget whose operator list is empty', () => {
        const rule = { type: 'widget', widget: 'w1', operator: '==' }
        expect(RuleModel.isRuleValid(rule, widget('ImageCarousel'))).toBe(true)
    })

    test('accepts a rule whose widget cannot be resolved', () => {
        const rule = { type: 'widget', widget: 'gone', operator: '==' }
        expect(RuleModel.isRuleValid(rule, null)).toBe(true)
    })

    test('rejects a databinding rule without a variable', () => {
        const rule = { type: 'databinding', databinding: '', operator: '==' }
        expect(RuleModel.isRuleValid(rule, null)).toBe(false)
        expect(RuleModel.getRuleError(rule, null)).toBe('Select a databinding variable')
    })

    test('accepts a databinding rule with a variable and an operator', () => {
        expect(RuleModel.isRuleValid({ type: 'databinding', databinding: 'a.b', operator: '==' }, null)).toBe(true)
    })

    test('needs neither an operator nor a value for a rest rule', () => {
        expect(RuleModel.isRuleValid({ type: 'rest', restResponseStatus: '200' }, null)).toBe(true)
        expect(RuleModel.getRuleError({ type: 'rest', restResponseStatus: '4xx' }, null)).toBe('')
    })

    test('rejects a missing rule', () => {
        expect(RuleModel.isRuleValid(null, null)).toBe(false)
    })
})

describe('RuleModel.parseRuleValue', () => {
    /**
     * The double branch ran parseInt, so "1.5" was stored as 1 and the rule
     * compared against the wrong number for the rest of the app's life.
     */
    test('keeps the fraction of a double', () => {
        expect(RuleModel.parseRuleValue('1.5', 'double')).toBe(1.5)
    })

    test('accepts a comma as the decimal separator for a double', () => {
        expect(RuleModel.parseRuleValue('1,5', 'double')).toBe(1.5)
    })

    test('accepts a negative double', () => {
        expect(RuleModel.parseRuleValue('-2.25', 'double')).toBe(-2.25)
    })

    test('accepts a whole double', () => {
        expect(RuleModel.parseRuleValue('3', 'double')).toBe(3)
    })

    test('rejects a double with letters', () => {
        expect(RuleModel.parseRuleValue('1.5a', 'double')).toBeNull()
    })

    test('rejects a fraction for an int', () => {
        expect(RuleModel.parseRuleValue('1.5', 'int')).toBeNull()
    })

    test('parses a negative int', () => {
        expect(RuleModel.parseRuleValue('-7', 'int')).toBe(-7)
    })

    test('rejects an empty value', () => {
        expect(RuleModel.parseRuleValue('', 'int')).toBeNull()
        expect(RuleModel.parseRuleValue(null, 'double')).toBeNull()
        expect(RuleModel.parseRuleValue(undefined, 'int')).toBeNull()
    })

    test('returns nothing for a type it does not parse', () => {
        expect(RuleModel.parseRuleValue('7', null)).toBeNull()
    })
})

describe('RuleModel.getAppVariablePaths', () => {
    function model(widgets) {
        return { widgets: widgets }
    }

    /**
     * Both Layout.getAllAppVariables() and getHintsAppVariables() pushed rest
     * hint keys without an indexOf guard, and Rule.vue concatenated the two
     * lists. Two Rest widgets returning the same field produced the same path
     * twice in the picker.
     */
    test('lists a rest hint path once for two widgets returning the same field', () => {
        const rest = (id) => ({
            id: id,
            props: { rest: { output: { databinding: id + 'Result', hints: { user_id: 'id' } } } }
        })
        const paths = RuleModel.getAppVariablePaths(model({ r1: rest('r1'), r2: rest('r2') }))
        expect(paths.filter(p => p === 'user.id').length).toBe(1)
    })

    test('turns the underscores of a hint key into a path', () => {
        const paths = RuleModel.getAppVariablePaths(model({
            r1: { id: 'r1', props: { rest: { output: { databinding: 'search', hints: { result_total: 'total' } } } } }
        }))
        expect(paths).toContain('result.total')
    })

    test('includes the databinding values a widget is bound to', () => {
        const paths = RuleModel.getAppVariablePaths(model({
            w1: { id: 'w1', props: { databinding: { default: 'selectedId' } } }
        }))
        expect(paths).toEqual(['selectedId'])
    })

    test('includes the databinding of a workflow step', () => {
        const paths = RuleModel.getAppVariablePaths(model({
            w1: { id: 'w1', props: {}, action: { type: 'workflow', steps: [{ databinding: 'stepResult' }] } }
        }))
        expect(paths).toEqual(['stepResult'])
    })

    test('skips a workflow step without a databinding', () => {
        const paths = RuleModel.getAppVariablePaths(model({
            w1: { id: 'w1', props: {}, action: { type: 'workflow', steps: [{}, { databinding: 'stepResult' }] } }
        }))
        expect(paths).toEqual(['stepResult'])
    })

    test('ignores a widget without props', () => {
        const paths = RuleModel.getAppVariablePaths(model({ w1: { id: 'w1' } }))
        expect(paths).toEqual([])
    })

    test('returns nothing for a missing model', () => {
        expect(RuleModel.getAppVariablePaths(null)).toEqual([])
    })

    test('sorts the paths', () => {
        const paths = RuleModel.getAppVariablePaths(model({
            w1: { id: 'w1', props: { databinding: { default: 'zebra' } } },
            w2: { id: 'w2', props: { databinding: { default: 'apple' } } }
        }))
        expect(paths).toEqual(['apple', 'zebra'])
    })
})

describe('RuleModel.getUIWidgets', () => {
    const model = {
        screens: {
            s1: { id: 's1', children: ['t1', 'b1'] },
            s2: { id: 's2', children: ['t2'] }
        },
        widgets: {
            t1: { id: 't1', name: 'Zulu', type: 'TextBox' },
            b1: { id: 'b1', name: 'Bravo', type: 'Button' },
            t2: { id: 't2', name: 'Alpha', type: 'CheckBox' }
        }
    }

    test('restricts the candidates to the given screens', () => {
        const result = RuleModel.getUIWidgets(model, ['s1'])
        expect(result.map(w => w.value)).toEqual(['t1'])
    })

    test('leaves out a widget whose type has no output type', () => {
        const result = RuleModel.getUIWidgets(model, ['s1'])
        expect(result.map(w => w.value)).not.toContain('b1')
    })

    test('falls back to the whole model when no screen is given', () => {
        const result = RuleModel.getUIWidgets(model, [])
        expect(result.map(w => w.value)).toEqual(['t2', 't1'])
    })

    test('sorts by label', () => {
        const result = RuleModel.getUIWidgets(model, [])
        expect(result.map(w => w.label)).toEqual(['Alpha', 'Zulu'])
    })

    /**
     * A screen can still list a widget that is no longer in the model, and the
     * lookup dereferenced it without a guard.
     */
    test('skips a child the model no longer has', () => {
        const broken = {
            screens: { s1: { id: 's1', children: ['gone'] } },
            widgets: {}
        }
        expect(RuleModel.getUIWidgets(broken, ['s1'])).toEqual([])
    })

    test('returns nothing for a missing model', () => {
        expect(RuleModel.getUIWidgets(null, ['s1'])).toEqual([])
    })
})

describe('RuleModel.getRuleLabel', () => {
    const widgets = { w1: { id: 'w1', name: 'Consent', type: 'CheckBox' } }

    /**
     * The widget name carries a trailing space and every operator is written
     * with its own padding, so the label reads with a double space. Kept as it
     * was: this string is already in saved toolbars.
 */
    test('labels a widget rule with the widget name', () => {
        const label = RuleModel.getRuleLabel({ type: 'widget', widget: 'w1', operator: 'checked' }, widgets)
        expect(label).toBe('Consent  == checked')
    })

    test('labels a databinding rule with its variable', () => {
        const label = RuleModel.getRuleLabel({ type: 'databinding', databinding: 'result.total', operator: '>' , value: 3}, {})
        expect(label).toBe('${result.total} &gt; 3')
    })

    test('labels a successful rest rule', () => {
        expect(RuleModel.getRuleLabel({ type: 'rest', restResponseStatus: '200' }, {})).toBe('Request OK')
    })

    test('labels a failed rest rule', () => {
        expect(RuleModel.getRuleLabel({ type: 'rest', restResponseStatus: '4xx' }, {})).toBe('Request ERROR')
    })

    /**
     * The label is inserted as HTML on the rule button, so the comparison
     * operators have to stay escaped.
     */
    test('escapes the comparison operators', () => {
        expect(RuleModel.getRuleLabel({ widget: 'w1', operator: '<' }, widgets)).toBe('Consent  &lt; ')
        expect(RuleModel.getRuleLabel({ widget: 'w1', operator: '>=' }, widgets)).toBe('Consent  &gt;= ')
        expect(RuleModel.getRuleLabel({ widget: 'w1', operator: '<=' }, widgets)).toBe('Consent  &lt;= ')
    })

    test('labels isValid', () => {
        expect(RuleModel.getRuleLabel({ widget: 'w1', operator: 'isValid' }, widgets)).toBe('Consent  is valid')
    })

    test('falls back for a rule that names no widget', () => {
        expect(RuleModel.getRuleLabel({ operator: '==' }, {})).toBe('??? == ')
    })

    test('does not warn for a rule without an operator yet', () => {
        expect(RuleModel.getRuleLabel({ widget: 'w1' }, widgets)).toBe('Consent ')
    })

    test('falls back for a missing rule', () => {
        expect(RuleModel.getRuleLabel(null, widgets)).toBe('???')
    })
})

describe('RuleModel.getTypeOptions', () => {
    /**
     * Only a line owned by a Rest widget can be matched on the response status,
     * so the third type is offered for that case alone.
     */
    test('offers rest for a line of a Rest widget', () => {
        expect(RuleModel.getTypeOptions({ type: 'Rest' }).map(t => t.value)).toEqual(['widget', 'databinding', 'rest'])
    })

    test('does not offer rest for an OR connector', () => {
        expect(RuleModel.getTypeOptions({ type: 'LogicOr' }).map(t => t.value)).toEqual(['widget', 'databinding'])
    })

    test('does not offer rest without a from widget', () => {
        expect(RuleModel.getTypeOptions(null).map(t => t.value)).toEqual(['widget', 'databinding'])
    })
})

describe('RuleModel.findFromWidget', () => {
    test('finds the widget a line starts at', () => {
        const widgets = { w1: { id: 'w1', type: 'Rest' } }
        expect(RuleModel.findFromWidget(widgets, 'w1')).toBe(widgets.w1)
    })

    test('returns nothing for a screen, which is a valid line origin', () => {
        expect(RuleModel.findFromWidget({ w1: { id: 'w1' } }, 's1')).toBeNull()
    })

    test('returns nothing without a model', () => {
        expect(RuleModel.findFromWidget(null, 'w1')).toBeNull()
    })
})

describe('RuleModel.getDatabindingOperators', () => {
    test('offers the six comparisons', () => {
        expect(RuleModel.getDatabindingOperators().map(o => o.value))
            .toEqual(['==', '!=', '>', '<', '>=', '<='])
    })

    test('has no repeated value, which would leave a list item unreachable', () => {
        const values = RuleModel.getDatabindingOperators().map(o => o.value)
        expect(values.length).toBe(new Set(values).size)
    })

    test('returns a copy, so a caller cannot corrupt the list for the next one', () => {
        const operators = RuleModel.getDatabindingOperators()
        operators.push({ value: 'contains', label: 'x' })
        expect(RuleModel.getDatabindingOperators().length).toBe(6)
    })
})

describe('RuleModel.getDirtyRows', () => {
    /**
     * The defect that prompted the table. getRuleOperators() returns null until
     * there is a variable, so the operator row is not merely re-rendered when
     * the variable changes, it is built for the first time. setDataBinding()
     * re-rendered only the value row and the dialog showed no operator at all
     * for a new databinding rule.
     */
    test('a variable change invalidates the operator row', () => {
        expect(RuleModel.getDirtyRows(['databinding'])).toEqual(['operator', 'value'])
    })

    /**
     * The operator row is the control being pressed, and nothing else reads the
     * operator, so it is the only row left alone.
     */
    test('an operator change invalidates only the value row', () => {
        expect(RuleModel.getDirtyRows(['operator'])).toEqual(['value'])
    })

    /**
     * Changing the kind of rule leaves nothing standing, so every row is rebuilt.
     */
    test('a type change invalidates every row', () => {
        expect(RuleModel.getDirtyRows(['type'])).toEqual(RuleModel.ROWS)
    })

    test('a widget change invalidates the operator and value rows', () => {
        expect(RuleModel.getDirtyRows(['widget'])).toEqual(['operator', 'value'])
    })

    test('a response status change invalidates the rest and value rows', () => {
        expect(RuleModel.getDirtyRows(['restResponseStatus', 'operator', 'value'])).toEqual(['rest', 'value'])
    })

    test('the value is read by nothing but the input being typed into', () => {
        expect(RuleModel.getDirtyRows(['value'])).toEqual([])
    })

    test('reports nothing for no change', () => {
        expect(RuleModel.getDirtyRows([])).toEqual([])
    })

    test('keeps the dialog order regardless of the order of the fields', () => {
        expect(RuleModel.getDirtyRows(['value', 'type', 'widget']))
            .toEqual(['type', 'databinding', 'rest', 'widget', 'operator', 'value'])
    })

    /**
     * A setter naming a field this table does not know about would resolve to
     * nothing and look exactly like a row with nothing to show, which is how the
     * bug above stayed invisible. Fail loudly instead.
     */
    test('throws on a field it does not know', () => {
        expect(() => RuleModel.getDirtyRows(['databindings'])).toThrow(/unknown rule field/)
    })

    test('throws on a field it does not know even when a real one is listed too', () => {
        expect(() => RuleModel.getDirtyRows(['type', 'operatorr'])).toThrow(/unknown rule field/)
    })
})

describe('RuleModel rule transitions', () => {
    function rule(overrides) {
        return Object.assign({
            type: 'widget',
            databinding: null,
            widget: null,
            operator: null,
            value: null,
            restResponseStatus: '200'
        }, overrides)
    }

    describe('applyType', () => {
        test('reports every row', () => {
            expect(RuleModel.applyType(rule(), 'databinding')).toEqual(RuleModel.ROWS)
        })

        test('clears the rest of the rule', () => {
            const r = rule({ widget: 'w1', operator: '==', value: 'x', databinding: 'a.b' })
            RuleModel.applyType(r, 'databinding')
            expect(r).toEqual(rule({ type: 'databinding' }))
        })

        test('changes nothing and reports nothing when the type is the same', () => {
            const r = rule({ operator: '==' })
            expect(RuleModel.applyType(r, 'widget')).toBeNull()
            expect(r.operator).toBe('==')
        })
    })

    describe('applyDataBinding', () => {
        /**
         * The regression: the operator row was never reported, so a new
         * databinding rule showed no operator.
         */
        test('reports the operator and value rows', () => {
            expect(RuleModel.applyDataBinding(rule({ type: 'databinding' }), 'a.b'))
                .toEqual(['operator', 'value'])
        })

        /**
         * The original complaint. Input.onBlur re-fires this setter, and
         * clearing the operator here is what threw a chosen operator away as
         * soon as the field lost focus.
         */
        test('leaves a chosen operator alone', () => {
            const r = rule({ type: 'databinding', databinding: 'old', operator: '>', value: '5' })
            RuleModel.applyDataBinding(r, 'new')
            expect(r.operator).toBe('>')
        })

        test('clears the value, which belonged to the old variable', () => {
            const r = rule({ type: 'databinding', databinding: 'old', value: '5' })
            RuleModel.applyDataBinding(r, 'new')
            expect(r.value).toBeNull()
        })

        test('changes nothing and reports nothing when the variable is the same', () => {
            const r = rule({ type: 'databinding', databinding: 'a.b', operator: '==' })
            expect(RuleModel.applyDataBinding(r, 'a.b')).toBeNull()
            expect(r.operator).toBe('==')
        })

        test('changes nothing when the rule is not a databinding rule', () => {
            const r = rule({ widget: 'w1' })
            expect(RuleModel.applyDataBinding(r, 'a.b')).toBeNull()
            expect(r.databinding).toBeNull()
        })
    })

    describe('applyOperator', () => {
        test('reports only the value row', () => {
            expect(RuleModel.applyOperator(rule({ widget: 'w1' }), '==')).toEqual(['value'])
        })

        test('clears nothing', () => {
            const r = rule({ type: 'databinding', databinding: 'a.b' })
            RuleModel.applyOperator(r, '>=')
            expect(r.databinding).toBe('a.b')
        })

        test('changes nothing and reports nothing when the operator is the same', () => {
            const r = rule({ operator: '==' })
            expect(RuleModel.applyOperator(r, '==')).toBeNull()
        })
    })

    describe('applyWidget', () => {
        /**
         * A new widget has a different set of operators, so the operator row is
         * rebuilt even though nothing it reads was set to a new non null value.
         */
        test('reports the operator and value rows', () => {
            expect(RuleModel.applyWidget(rule(), 'w1')).toEqual(['operator', 'value'])
        })

        test('clears the operator, the value and the variable', () => {
            const r = rule({ databinding: 'a.b', operator: '==', value: '5' })
            RuleModel.applyWidget(r, 'w1')
            expect(r).toEqual(rule({ widget: 'w1' }))
        })

        test('changes nothing and reports nothing when the widget is the same', () => {
            const r = rule({ widget: 'w1', operator: '==' })
            expect(RuleModel.applyWidget(r, 'w1')).toBeNull()
            expect(r.operator).toBe('==')
        })
    })

    describe('applyRest', () => {
        test('reports the rest and value rows', () => {
            expect(RuleModel.applyRest(rule({ widget: 'w1' }), '4xx')).toEqual(['rest', 'value'])
        })

        test('clears the operator and the value', () => {
            const r = rule({ operator: '==', value: '5' })
            RuleModel.applyRest(r, '4xx')
            expect(r.restResponseStatus).toBe('4xx')
            expect(r.operator).toBeNull()
            expect(r.value).toBeNull()
        })

        test('changes nothing and reports nothing when the status is the same', () => {
            const r = rule({ restResponseStatus: '200', operator: '==' })
            expect(RuleModel.applyRest(r, '200')).toBeNull()
            expect(r.operator).toBe('==')
        })
    })

    describe('applyRuleValue', () => {
        test('reports nothing, the value is only read by the input being typed into', () => {
            expect(RuleModel.applyRuleValue(rule(), '5')).toEqual([])
        })

        test('sets the value', () => {
            const r = rule()
            RuleModel.applyRuleValue(r, '5')
            expect(r.value).toBe('5')
        })

        test('changes nothing and reports nothing when the value is the same', () => {
            const r = rule({ value: '5' })
            expect(RuleModel.applyRuleValue(r, '5')).toBeNull()
        })
    })

    describe('invariants', () => {
        /**
         * A row that listed its own field would destroy the control the user is
         * pressing. renderDataBinding() does read rule.databinding to pre-fill
         * the input, so this is a real temptation and not a hypothetical one.
         */
        test('no transition ever rebuilds the row it is driven from', () => {
            expect(RuleModel.getDirtyRows(['databinding'])).not.toContain('databinding')
            expect(RuleModel.getDirtyRows(['operator'])).not.toContain('operator')
            expect(RuleModel.getDirtyRows(['type'])).toContain('type')
            expect(RuleModel.getDirtyRows(['value'])).not.toContain('value')
        })

        test('every rule field a transition writes is covered by the table', () => {
            const transitions = Object.keys(RuleModel).filter(k => /^apply[A-Z]/.test(k))
            expect(transitions.length).toBeGreaterThan(0)
            transitions.forEach(name => {
                expect(typeof RuleModel[name]).toBe('function')
            })
        })

        test('every exported transition is named after the apply convention', () => {
            const transitions = Object.keys(RuleModel).filter(k => /^[a-z]/.test(k) && /^(set|change|update)[A-Z]/.test(k))
            expect(transitions).toEqual([])
        })

        /**
         * Rule.vue renders a row by looking its method name up here. A row with
         * no entry would silently draw nothing, and an entry for a row that
         * does not exist would never be reached. The names are deliberately not
         * derivable from the keys: the "databinding" row is drawn by
         * renderDataBinding, so a name convention would get that one wrong, which
         * is the row the whole table exists for.
         */
        test('every row has exactly one renderer', () => {
            expect(Object.keys(RuleModel.ROW_RENDERERS)).toEqual(RuleModel.ROWS)
            RuleModel.ROWS.forEach(row => {
                expect(RuleModel.ROW_RENDERERS[row]).toMatch(/^render[A-Z]/)
            })
        })

        test('the databinding row is drawn by renderDataBinding, not renderDatabinding', () => {
            expect(RuleModel.ROW_RENDERERS.databinding).toBe('renderDataBinding')
        })
    })
})
