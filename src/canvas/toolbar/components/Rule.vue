<template>
     <div class="MatcRule"></div>
</template>
<script>
import DojoWidget from 'dojo/DojoWidget'
import css from 'dojo/css'
import lang from 'dojo/_base/lang'
import on from 'dojo/on'
import Logger from 'common/Logger'
import DomBuilder from 'common/DomBuilder'
import DropDownButton from 'page/DropDownButton'
import Input from 'common/Input'
import SegmentButton from 'page/SegmentButton'
import Layout from 'core/Layout'
import * as RuleModel from '../RuleModel'

const ROWS = RuleModel.ROWS.concat(["error"])

export default {
    name: 'Rule',
	mixins:[Layout, DojoWidget],
	props: ['l', 'app'],
    data: function () {
        return {
            /**
             * Copied, not referenced: Vue would walk a shared module object and
             * leave it reactive for every other importer.
             */
            widgetOutputTypes: Object.assign({}, RuleModel.WIDGET_OUTPUT_TYPES)
        }
    },
    components: {},
    methods: {
        postCreate (){
			this.logger = new Logger("Rule");
			this.db = new DomBuilder();
			this._rows = {};
		},

		setModel (model){
			this.model = model;
		},

		setScreenIDs (ids){
			this.screenIDs = ids;
		},

		setValue (line){
			this.line = lang.clone(line);
			this.value = this.line.rule;
			if(!this.value){
				this.value = {
					"restResponseStatus": "200",
					"databinding": "",
					"widget" : null,
					"operation" : null,
					"value" : null
				};
			}
			/**
			 * Make sure old rules work. New rules will have a type
			 */
			if (!this.value.type) {
				this.value.type = 'widget'
			}
			this._renderAll();
		},

		getValue (){
			return this.value;
		},

		_ruleWidget (){
			if (this.value && this.value.widget) {
				return this.model.widgets[this.value.widget];
			}
			return null;
		},

		isValid (){
			return RuleModel.isRuleValid(this.value, this._ruleWidget());
		},

		getErrorMessage (){
			return RuleModel.getRuleError(this.value, this._ruleWidget());
		},

		/**
		 * A rule is only half filled in while it is being edited, and a variable
		 * name is free text, so the caller gets somewhere to say what is missing.
		 */
		showError (message){
			this._clearRow("error");
			if (!message) {
				return;
			}
			const row = this._rows.error.node;
			const group = this.db.div("form-group").build(row);
			this.db.span("VommondFormErrorLabel", message).build(group);
		},

		/**********************************************************
		 * Rows
		 *
		 * Every row owns its node, its dojo widgets and its listeners so a
		 * change to one row can be rendered without touching the others. The
		 * dialog used to wipe domNode and rebuild all of them from every
		 * setter, which threw the child widgets away without destroying them
		 * (Input leaks the win.body() listener it adds when the suggestion list
		 * opens, and only Input.destroy() takes it off again) and re-armed the
		 * databinding focus timer on every interaction.
		 **********************************************************/
		_renderAll (){
			/**
			 * The first build, out of setValue(). Everything after it goes through
			 * _apply(). Rendering every row into the existing containers would
			 * produce the same DOM, since each renderer clears its own row first.
			 */
			this._clearAllRows();
			this.domNode.innerHTML = "";
			for (let i = 0; i < ROWS.length; i++) {
				this._rows[ROWS[i]] = {
					node: this.db.div("MatcRuleRow").build(this.domNode),
					widgets: [],
					listeners: []
				};
			}
			this._renderRows(RuleModel.ROWS);
			this._notifyResize();
		},

		_clearAllRows (){
			/**
			 * ActionButton mixes this component in for getRuleLabel and friends,
			 * so its methods exist without postCreate() ever having run.
			 */
			if (!this._rows) {
				return;
			}
			for (let i = 0; i < ROWS.length; i++) {
				this._clearRow(ROWS[i]);
			}
			this._rows = {};
		},

		_clearRow (name){
			const row = this._rows[name];
			if (!row) {
				return;
			}
			for (let i = 0; i < row.widgets.length; i++) {
				this._destroyWidget(row.widgets[i]);
			}
			for (let i = 0; i < row.listeners.length; i++) {
				try {
					row.listeners[i].remove();
				} catch (e) {
					console.error("Rule._clearRow() > ", name, e);
				}
			}
			row.widgets = [];
			row.listeners = [];
			row.node.innerHTML = "";
		},

		_destroyWidget (widget){
			try {
				/**
				 * $destroy runs beforeDestroy, which is where both the dojo
				 * listeners and Input.hideSuggestion() are released.
				 */
				if (widget && typeof widget.$destroy === "function") {
					widget.$destroy();
				} else if (widget && typeof widget.destroy === "function") {
					widget.destroy();
				}
			} catch (e) {
				console.error("Rule._destroyWidget() > ", e);
			}
		},

		_addWidget (name, widget){
			this._rows[name].widgets.push(widget);
			return widget;
		},

		_addListener (name, target, event, callback){
			const listener = on(target, event, callback);
			this._rows[name].listeners.push(listener);
			return listener;
		},

		/**********************************************************
		 * Turning a rule change into DOM work
		 *
		 * _apply() is the only thing here that re-renders. It renders exactly
		 * the rows the transition reported as invalid, and a transition in
		 * RuleModel decides that. So a setter cannot leave a row behind: it does
		 * not name rows at all. Rendering a row the user is currently pressing is
		 * what made an operator selection look lost, so the dependencies are
		 * deliberately one directional — see ROW_DEPENDENCIES in RuleModel.
		 **********************************************************/
		_apply (transition, value){
			const rows = transition(this.value, value);
			if (!rows) {
				/**
				 * Nothing changed. Both the DropDown and the SegmentButton emit on
				 * every press, and re-rendering on a no-op is what threw a chosen
				 * operator away.
				 */
				return false;
			}
			this._renderRows(rows);
			if (rows.length > 0) {
				this._notifyResize();
			}
			this._onChange();
			return true;
		},

		_renderRows (rows){
			for (let i = 0; i < rows.length; i++) {
				const row = this._rows[rows[i]];
				const render = RuleModel.ROW_RENDERERS[rows[i]];
				if (row && render) {
					this[render]();
				}
			}
		},

		_notifyResize (){
			/**
			 * The dialog measures itself once when it opens. The rule grows as
			 * it is filled in, so ActionButton keeps Dialog.resize() in sync
			 * from here. Nothing to measure while we are not in the document
			 * yet, which is the case until placeAt() has run.
			 */
			this.$nextTick(() => {
				if (!this.domNode || !document.body.contains(this.domNode)) {
					return;
				}
				this.emit("resize", this.domNode);
			});
		},

		beforeDestroy (){
			this._clearAllRows();
		},

		/**********************************************************
		 * Renderers
		 **********************************************************/
		renderType (){
			this._clearRow("type");
			const row = this._rows.type.node;
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Rule Type").build(group);
			const drpBox = this.$new(SegmentButton, {maxLabelLength:25});
			drpBox.setOptions(this.getTypeOption());
			drpBox.setValue(this.value.type);
			drpBox.placeAt(group);
			this._addWidget("type", drpBox);
			this._addListener("type", drpBox, "change", lang.hitch(this, "setType"));
		},

		renderDataBinding () {
			const rule = this.value;
			this._clearRow("databinding");
			this._dataBindingInput = null;
			if (rule.type !== 'databinding') {
				return;
			}
			const row = this._rows.databinding.node;
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Databinding Variable").build(group);

			/**
			 * Rules resolve a path against the data binding store, not the value
			 * of a widget's props.databinding map, so the picker offers paths.
			 * The union used to come from two lists that were concatenated
			 * without de-duplicating, which repeated a path once per widget
			 * producing it.
			 */
			const options = RuleModel.getAppVariablePaths(this.model).map(v => {
				return {value: v, label: v}
			});

			const input = this.$new(Input, {
				fireOnBlur: true,
				/**
				 * Otherwise the list opens downwards, on top of the operator and
				 * value rows right underneath it.
				 */
				top: true,
				placeholder: "Select Variable",
				formControl: true,
				isDropDown: true
			});
			input.placeAt(group);
			input.setValue(rule.databinding);
			input.setHints(options);
			this._addWidget("databinding", input);
			this._addListener("databinding", input, "change", lang.hitch(this, "setDataBinding"));
			this._dataBindingInput = input;
		},

		renderRest () {
			const rule = this.value;
			this._clearRow("rest");
			if (rule.type !== 'rest') {
				return;
			}
			const row = this._rows.rest.node;
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Response Type").build(group);
			const drpBox = this.$new(SegmentButton, {maxLabelLength:25});
			drpBox.setOptions([
				{value: "200", label: "OK"},
				{value: "4xx", label: "Error"},
			]);
			drpBox.setValue(rule.restResponseStatus);
			drpBox.placeAt(group);
			this._addWidget("rest", drpBox);
			this._addListener("rest", drpBox, "change", lang.hitch(this, "setRest"));
		},

		renderWidget (){
			const rule = this.value;
			this._clearRow("widget");
			if (rule.type !== 'widget') {
				return;
			}
			const row = this._rows.widget.node;
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Widget").build(group);
			const drpBox = this.$new(DropDownButton, {maxLabelLength:25});
			drpBox.setOptions(this.getUIWidgets());
			drpBox.setValue(rule.widget);
			drpBox.placeAt(group);
			this._addWidget("widget", drpBox);
			this._addListener("widget", drpBox, "change", lang.hitch(this, "setWidget"));
		},

		getRuleOperators (){
			const rule = this.value;
			if (rule.widget){
				const widget = this.model.widgets[rule.widget];
				if (!widget){
					console.warn("renderOperator() > No widget with id",rule.widget );
					return null;
				}
				const operators = RuleModel.getOperators(widget);
				if (operators.length === 0) {
					return null;
				}
				return operators;
			}
			if (rule.type === 'databinding' && rule.databinding) {
				return RuleModel.getDatabindingOperators();
			}
			return null;
		},

		renderOperator (){
			const rule = this.value;
			this._clearRow("operator");
			const operators = this.getRuleOperators();
			if (!operators) {
				return;
			}
			const row = this._rows.operator.node;
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Operator").build(group);
			const drpBox = this.$new(DropDownButton, {maxLabelLength:25});
			drpBox.setOptions(operators);
			drpBox.setValue(rule.operator);
			drpBox.placeAt(group);
			this._addWidget("operator", drpBox);
			this._addListener("operator", drpBox, "change", lang.hitch(this, "setOperator"));
		},

		renderValue (){
			const rule = this.value;
			this._clearRow("value");
			const row = this._rows.value.node;
			if (rule.widget && rule.operator && rule.operator !== "isValid") {
				const widget = this.model.widgets[rule.widget];
				if (!widget) {
					console.debug("renderValue() > No widget with id", rule.widget);
					return;
				}
				const type = RuleModel.getOutputType(widget);
				if (this["renderValue_" + type]) {
					this["renderValue_" + type](row, widget, rule);
					this.renderValue_isBinding(this.db.div("form-group").build(row));
				}
			} else if (rule.databinding && rule.operator) {
				this._renderValueInput(row, rule, null);
				this.renderValue_isBinding(this.db.div("form-group").build(row));
			}
		},

		renderValue_options (row, widget, rule){
			const group = this.db.div("form-group").build(row);
			this.db.label(null,"Value").build(group);
			const drpBox = this.$new(DropDownButton, {maxLabelLength:25});
			drpBox.setOptions(RuleModel.getOptions(widget));
			drpBox.setValue(rule.value);
			drpBox.placeAt(group);
			this._addWidget("value", drpBox);
			this._addListener("value", drpBox, "change", lang.hitch(this, "setRuleValue"));
		},

		renderValue_string (row, widget, rule){
			/**
			 * A TextBox is stored as a string but a numeric validation means it
			 * compares as a number.
			 */
			const validationType = RuleModel.getValidationType(widget);
			if (validationType === "int" || validationType === "double") {
				this._renderValueInput(row, rule, validationType);
			} else {
				this._renderValueInput(row, rule, null);
			}
		},

		renderValue_int (row, widget, rule){
			this._renderValueInput(row, rule, "int");
		},

		/**
		 * DomBuilder.formGroup() brings its own .form-group and label, so this
		 * builds straight into the row. It used to be handed a .form-group that
		 * the caller had already created and left behind an empty one, and the
		 * numeric variants appended to domNode instead, which put the value
		 * editor after the hint no matter which row came last.
		 */
		_renderValueInput (row, rule, type){
			const input = this.db.formGroup("MatcIgnoreOnKeyPress", "Value", rule.value, "").build(row);
			if (type) {
				this._addListener("value", input, "keyup", lang.hitch(this, "setRuleValueNumber", input, type));
			} else {
				this._addListener("value", input, "keyup", lang.hitch(this, "setRuleValueText", input));
			}
		},

		renderValue_isBinding (row) {
			this.db.span('MatcHint', 'Use ${variable} synthax to compare against databinding variables.').build(row)
		},

		/**********************************************************
		 * Candidates
		 **********************************************************/
		getTypeOption () {
			return RuleModel.getTypeOptions(this.getFromWidget());
		},

		getFromWidget () {
			return RuleModel.findFromWidget(this.model.widgets, this.line.from);
		},

		getUIWidgets (){
			return RuleModel.getUIWidgets(this.model, this.screenIDs, this.widgetOutputTypes);
		},

		/**
		 * Called by ActionButton once the dialog has finished its entry
		 * animation. Focusing from renderDataBinding() used to fight it: the
		 * timer was re-armed on every render, so the field grabbed the cursor
		 * back from whatever the user had just clicked.
		 */
		focusDataBinding (){
			if (this._dataBindingInput) {
				this._dataBindingInput.focus();
			}
		},

		/**********************************************************
		 * Setters
		 *
		 * Each one is a hand off to a transition and nothing else. See _apply().
		 **********************************************************/
		setType (type) {
			if (this._apply(RuleModel.applyType, type) && type === 'databinding') {
				/**
				 * Switching to the variable is a deliberate request for the field,
				 * so this is the one place besides opening the dialog where the
				 * cursor belongs. Doing it anywhere else would fight the user.
				 */
				this.focusDataBinding();
			}
		},

		setDataBinding (databinding) {
			this._apply(RuleModel.applyDataBinding, databinding);
		},

		setRest (restResponseStatus) {
			this._apply(RuleModel.applyRest, restResponseStatus);
		},

		setWidget (id){
			this._apply(RuleModel.applyWidget, id);
		},

		setOperator (value){
			this._apply(RuleModel.applyOperator, value);
		},

		setRuleValue (value){
			this._apply(RuleModel.applyRuleValue, value);
		},

		setRuleValueText (input){
			this._apply(RuleModel.applyRuleValue, input.value);
		},

		setRuleValueNumber (input, type){
			const value = RuleModel.parseRuleValue(input.value, type);
			if (value === null) {
				/**
				 * Keep the last valid value. The field is marked instead.
				 */
				css.add(input.parentNode, "has-error");
				return;
			}
			css.remove(input.parentNode, "has-error");
			this._apply(RuleModel.applyRuleValue, value);
		},

		_onChange (){
			/**
			 * Anything the user just touched is an attempt to fix it.
			 */
			this.showError(null);
		}
    },
    mounted () {
		if (this.app) {
			this.setModel(this.app)
		}
		if (this.l) {
			this.setValue(this.l)
			/**
			 * There is no dialog here to hand the focus over from.
			 */
			this.focusDataBinding()
		}
	}
}
</script>
