
<template>
  <div class="MatcWidgetTypeRadioTable">
  </div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import UIWidget from "core/widgets/UIWidget";
//import {iconDOM} from 'page/QIconUtil'
import DomBuilder from "common/DomBuilder";
import { sanitizeObjectKey } from "common/SanitizeUtil";
import css from 'dojo/css'
// import touch from "dojo/touch";
// import on from "dojo/on";
// import domGeom from "dojo/domGeom";

export default {
  name: "SortableList",
  mixins: [UIWidget, DojoWidget],
  data() {
    return {
      value: {},
      styleArrowColor: '',
      validationActive: false,
      validationErrorActive: false,
      rowOrder: null
    };
  },
  computed: {
    arrowStyle () {
      let result = ''
      if (this.styleArrowColor) {
        result += 'color:' + this.styleArrowColor
      }
      return result
    }
  },
  components: {},
  methods: {
    postCreate() {
      this.cleanupRender()
    },

    cleanupRender () {
      this.removeAllChildren(this.domNode)
      // this.domNode.innerHTML = "";
      this._borderNodes = [];
      this._backgroundNodes = [];
      this._paddingNodes=[]
      this._shadowNodes = [];
      this._labelNodes = [this.domNode];
      this._radioNodes = []
      this._hookNodes = []
      this._rowLabelNodes = []
      this._rowLabels = {}
      this._rowHooks = {}
      this._rowNodes = {}
      this._tableBody = null
    },

    async moveUp (i, e) {
      if (i > 0) {
        await this.animateTransition(i, i-1)
        const a = this.value[i]
        const b = this.value[i-1]
        this.value[i-1] = a
        this.value[i] = b
      }
      this.renderChildren(this.value)
      this.wireEvents()
      this.onChange(e)
    },
 

    wireEvents () {      
      this._paddingNodes.forEach(node => {
        this.tempOwn(this.addClickListener(node, (e) => this.selectRadio(e, node)));
        // this.tempOwn(on(node, touch.over, () => this.hoveBtn(node)));
        // this.tempOwn(on(node, touch.out, () => this.hoveBtn()));
      })
    },

    selectRadio (e, node) {
      if (node.dataColName !== undefined && node.dataRowName !== undefined) {
        this.value[node.dataRowName] = node.dataColName;
        this.renderChecked(this.value)
      }
      this.onChange(e)
    },

    hoveBtn (node) {

      if (!this.model.hover) {
        return
      }
      if (this.currentHover) {
        this.currentHover.style.color = this.style.arrowColor
        this.currentHover.style.background = this.style.background
        this.setBorderColorForNode(this.currentHover, this.style)
      }
      this.currentHover = node
      if (node) {
        this.currentHover.style.color = this.style.arrowColorHover
        this.currentHover.style.background = this.model.hover.background
        this.setBorderColorForNode(this.currentHover, this.model.hover)
      }

    },
    

    resize() {
      //this.setChildSize(box, this.style, this.scaleX, this.scaleY);
    },


    _getRowNames (data) {
      const result = []
      const rows = data || []
      for (let i = 1; i < rows.length; i++) {
        if (rows[i]) {
          result.push(rows[i][0])
        }
      }
      return result
    },

    _arraysEqual (a, b) {
      if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
        return false
      }
      for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) {
          return false
        }
      }
      return true
    },

    _isRowOrderForData (order, data) {
      const rowNames = this._getRowNames(data)
      if (!Array.isArray(order) || order.length !== rowNames.length) {
        return false
      }
      return rowNames.every(rowName => order.indexOf(rowName) >= 0)
    },

    _normalizeRowOrder (order, data) {
      const rowNames = this._getRowNames(data)
      const result = []
      const used = {}
      const addRow = rowName => {
        const index = rowNames.indexOf(rowName)
        if (index >= 0 && !used[index]) {
          used[index] = true
          result.push(rowNames[index])
        }
      }

      if (Array.isArray(order)) {
        order.forEach(addRow)
      }
      rowNames.forEach(addRow)
      return result
    },

    _initializeRowOrder (data, randomize) {
      const rowNames = this._getRowNames(data)
      if (!randomize) {
        this.rowOrder = rowNames
      } else if (!this._isRowOrderForData(this.rowOrder, data)) {
        this.rowOrder = rowNames.slice()
        if (this.mode === 'simulator') {
          this.shuffleArray(this.rowOrder)
        }
      }
    },

    _getOrderedData (data) {
      const rows = data || []
      if (rows.length < 2) {
        return rows
      }

      const rowNames = this._getRowNames(rows)
      const ordered = [rows[0]]
      const used = {}
      const order = Array.isArray(this.rowOrder) ? this.rowOrder : rowNames
      order.forEach(rowName => {
        const index = rowNames.indexOf(rowName)
        if (index >= 0 && !used[index]) {
          used[index] = true
          ordered.push(rows[index + 1])
        }
      })
      rowNames.forEach((rowName, index) => {
        if (!used[index]) {
          used[index] = true
          ordered.push(rows[index + 1])
        }
      })
      return ordered
    },

    _setRowStyle (row, position) {
      const style = this.style || {}
      const isEven = position % 2 === 1
      if (isEven && (style.evenRowBackground || style.evenRowColor)) {
        row.style.background = style.evenRowBackground
        row.style.color = style.evenRowColor
      } else {
        row.style.background = style.background
        row.style.color = style.color
      }
    },

    _reorderRenderedRows () {
      if (!this._tableBody || !this.model || !this.model.props) {
        return
      }

      const data = this._getOrderedData(this.model.props.data)
      this._rowKeys = []
      for (let i = 1; i < data.length; i++) {
        const rowName = data[i][0]
        const row = this._rowNodes[rowName]
        if (row) {
          this._tableBody.appendChild(row)
          this._setRowStyle(row, i - 1)
          this._rowKeys[i] = rowName
        }
      }
    },

    setRowOrder (order) {
      const data = this.model && this.model.props ? this.model.props.data : []
      const normalized = this._normalizeRowOrder(order, data)
      const changed = !this._arraysEqual(this.rowOrder, normalized)
      this.rowOrder = normalized
      if (changed) {
        this._reorderRenderedRows()
      }
      return changed
    },

    render(model, style, scaleX, scaleY) {
      this.model = model;
      this.style = style;
      this._scaleX = scaleX;
      this._scaleY = scaleY;

      this._initializeRowOrder(model.props.data, !!model.props.randomize)
      this.renderTable()
    },

    renderTable () {
      this.cleanupRender()
      const data = this._getOrderedData(this.model.props.data)
      const table = this.db.table().build()
      this.renderHeader(table, data)
      this.renderRows(table, data)

      this.setStyle(this.style, this.model);
      this.setValue(this.value)
      this.domNode.appendChild(table)
    },

    renderHeader(table, data) {
      const cols = data[0]
      const thead = this.db.thead(cols).build(table)
      return thead
    },

    renderRows (table, data) {
      const tbody = this.db.tbody().build(table)
      this._tableBody = tbody
      this._rowKeys = []
      this._rowRadios = {}
      this._rowLabels = {}
      this._rowHooks = {}
      const header = data[0]
      for (let i = 1; i < data.length; i++) {
        const row = data[i]
        const rowName = row[0]
        const tr = this.db.tr().build(table)

        this._setRowStyle(tr, i - 1)

        const labelTD = this.db.td("MatcWidgetTypeRadioTableLabel").build(tr)
        this.db.span("", rowName).build(labelTD);
        this._rowLabelNodes.push(labelTD);
        this._rowKeys[i] = rowName
        this._rowNodes[rowName] = tr
        this._rowLabels[rowName] = labelTD
        this._rowHooks[rowName] = []
        this.registerRowRadio(rowName)

        for (let j=1; j < header.length; j++) {
          const colName = header[j]

          const td = this.db.td("").build(tr)
          const cntr = this.db.div("MatcWidgetTypeRadioCell").build(td)
          cntr.dataRowName = rowName
          cntr.dataColName = colName

          const radio = this.db.div("MatcWidgetTypeRadioBox MatcWidgetTypeRadioBox2 ").build(cntr)
          const hook = this.db.div("MatcWidgetTypeRadioBoxCircle").build(radio)
          this._borderNodes.push(radio)
          this._backgroundNodes.push(radio)
          this._radioNodes.push(radio)
          this._hookNodes.push(hook)
          this._paddingNodes.push(cntr)
          this._shadowNodes.push(radio)
          this._rowHooks[rowName].push(hook)

 
          this._rowRadios[rowName][colName] = radio
        }

      }

      return tbody
    },

    registerRowRadio (rowName) {
      const radios = {}
      this._rowRadios[rowName] = radios
      /**
       * Persisted event states have their keys sanitized for mongo. Register
       * the same map under the sanitized key as well, so replayed states
       * can be looked up.
       */
      this._rowRadios[sanitizeObjectKey(rowName)] = radios
    },

    renderChecked (value) {
      this._radioNodes.forEach(node => {
        css.remove(node, "MatcWidgetTypeRadioBoxChecked")
      })
      for (let k in value) {

        if (this._rowRadios[k]) {
          let v = value[k]
          if (this._rowRadios[k][v]) {
            let node = this._rowRadios[k][v]
            css.add(node, "MatcWidgetTypeRadioBoxChecked")
          }
        }
      }
    },

    _set_colorButton(parent, style) {
      const c = style.colorButton
      this._hookNodes.forEach(node => {
        node.style.background = c
      })
    },

    _set_labelWidth(parent, style) {
      const w = this._getBorderWidth(style.labelWidth);
      this._rowLabelNodes.forEach(node => {
        node.style.width = w + 'px'
      })
    },

    _set_radioSize(parent, style) {
        const s = this._getBorderWidth(style.radioSize);
        this._radioNodes.forEach(node => {
          node.style.width = s + "px"
          node.style.height = s + "px"
        })
    },

  
    getValue() {
      return this.value;
    },

    _setDataBindingValue(v) {
      if (!v) {
        v = {};
      }
      this.setValue(v);
    },

    setValue(value) {
      if (!value) {
        value = {};
      }
      this.value = value
      this.renderChecked(this.value)
      if (this.validationErrorActive) {
        /**
         * While a validation error is active, the row highlight is a pure
         * function of the current value: answered rows clear automatically.
         */
        this.showRowErrors()
      }
    },

    getState() {
      const state = {
        type: "select",
        value: this.value
      }
      const options = this.getStateOptions()
      if (options) {
        state.options = options
      }
      return state
    },

    setState(state) {
      if (state && state.type == "select") {
        if (state.options && Array.isArray(state.options.rowOrder)) {
          this.setRowOrder(state.options.rowOrder)
        }
        if (state.options && state.options.valid === true) {
          this.validationErrorActive = false
          this.hideRowErrors()
        } else if (state.options && state.options.valid === false) {
          this.validationErrorActive = true
        }
        this.setValue(state.value)
      } else if (state && state.type == "value") {
        /**
         * The "value" type state is logged by the ValidationError event,
         * e.g. when a transition was blocked because the table is invalid.
         */
        if (state.options && Array.isArray(state.options.rowOrder)) {
          this.setRowOrder(state.options.rowOrder)
        }
        this.validationErrorActive = true
        this.setValue(state.value)
      }
    },

    getStateOptions (validOverride) {
      const options = {}
      if (this.model && this.model.props && this.model.props.randomize && Array.isArray(this.rowOrder)) {
        options.rowOrder = this.rowOrder.slice()
      }
      if (validOverride !== undefined) {
        options.valid = !!validOverride
      } else if (this.model && this.model.props && this.model.props.validation && this.lastValidation !== undefined) {
        options.valid = !!this.lastValidation
      }
      if (Object.keys(options).length > 0) {
        return options
      }
      return null
    },

    _validateValue (value) {
      const validation = this.model.props.validation;
      if (validation && validation.required) {
        const data = this.model.props.data;
        if (data) {
          const expected = data.length - 1;
          return Object.keys(value || {}).length >= expected;
        }
      }
      return true;
    },

    isValid (showError) {
      return this.validate(this.value, showError);
    },

    emitValidationStateChange (value, isValid) {
      /**
       * The validity did not change the value, so no stateChange would be
       * logged by the clicks themselves. Emit one explicitly, so the replay
       * has an event that carries the validation state.
       */
      this.emit("stateChange", {
        type: "select",
        value: value,
        runTransition: false,
        options: this.getStateOptions(isValid)
      })
    },

    validate (value, showError, forceValidation) {
      if (showError == undefined) {
        showError = true
      }
      const validation = this.model.props.validation
      if (validation) {
        if (showError) {
          this.validationActive = true
        }
        const isValid = this._validateValue(value)
        if (showError) {
          if (isValid) {
            if (this.lastValidation != isValid || forceValidation) {
              this.hideRowErrors()
              this.emitValidationOK(value)
              this.emitValidationStateChange(value, isValid)
            }
          } else {
            this.showRowErrors()
            if (this.lastValidation != isValid || forceValidation) {
              this.emitValidationError(value)
              this.emitValidationStateChange(value, isValid)
            }
          }
        }
        this.lastValidation = isValid
      } else {
        this.lastValidation = true
      }
      return this.lastValidation
    },

    getUnansweredRows () {
      const rows = []
      const data = this.model.props.data || []
      for (let i = 1; i < data.length; i++) {
        const rowName = data[i][0]
        const answered = this.value && (this.value[rowName] || this.value[sanitizeObjectKey(rowName)])
        if (!answered) {
          rows.push(rowName)
        }
      }
      return rows
    },

    showRowErrors () {
      this.clearRowErrors()
      const error = this.model.error || {}
      this.getUnansweredRows().forEach(rowName => {
        const label = this._rowLabels[rowName]
        if (label) {
          css.add(label, "MatcWidgetTypeRadioTableRowError")
          if (error.color) {
            label.style.color = error.color
          }
        }
        const radios = this._rowRadios[rowName] || {}
        for (let col in radios) {
          const radio = radios[col]
          css.add(radio, "MatcWidgetTypeRadioTableRowError")
          if (error.background) {
            radio.style.background = error.background
          }
        }
        const hooks = this._rowHooks[rowName] || []
        hooks.forEach(hook => {
          if (error.colorButton) {
            hook.style.background = error.colorButton
          }
        })
      })
    },

    clearRowErrors () {
      const style = this.style || {}
      this._rowLabelNodes.forEach(label => {
        css.remove(label, "MatcWidgetTypeRadioTableRowError")
        label.style.color = style.color || ''
      })
      this._radioNodes.forEach(radio => {
        css.remove(radio, "MatcWidgetTypeRadioTableRowError")
        radio.style.background = style.background || ''
      })
      this._hookNodes.forEach(hook => {
        hook.style.background = style.colorButton || ''
      })
    },

    hideRowErrors () {
      this.clearRowErrors()
    },


    onChange(e) {
      this.stopEvent(e);
      this.emitDataBinding(this.value);
      this.emitStateChange("select", this.value, e);
      if (this.validationActive) {
        this.validate(this.value, true);
      }
    }
  },
  mounted() {
    this.db = new DomBuilder();
  }
};
</script>
