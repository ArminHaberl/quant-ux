<template>
  <div class="MatcWidgetTypeTextBox"></div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import css from "dojo/css";
import lang from "dojo/_base/lang";
import on from "dojo/on";
import topic from "dojo/topic";
import Color from "dojo/_base/Color";
import Logger from "common/Logger";
import UIWidget from "core/widgets/UIWidget";
import { toUSNumberString } from "core/widgets/NumberUtil";
import { validatesOnChange } from "../../util/ValidationTrigger";

export default {
  name: "TextBox",
  mixins: [UIWidget, DojoWidget],
  data: function() {
    return {
      value: null,
      mode: "edit",
      hasFocus: false
    };
  },
  components: {},
  methods: {
    postCreate () {
      this.log = new Logger("TextBox");
      if (this.mode == "simulator") {
        this.input = document.createElement("input");
        this.input.type = "text";
      } else {
        this.input = document.createElement("div");
        css.add(this.input, "MatcWidgetTypeTextBoxPreview");
      }
      css.add(this.input, "MatcWidgetTypeTextBoxInput");
      this.domNode.appendChild(this.input);
      this._borderNodes = [this.input];
      this._backgroundNodes = [this.input];
      this._paddingNodes = [this.input];
      this._shadowNodes = [this.input];
    },

    getAnimationNode () {
      return this.domNode.parentNode;
    },

    onSimulatorEvent (type, screenID, widgetID) {
      this.log.log(5, "onSimulatorEvent", this.model.id, type, "@" , screenID, widgetID)
      if (type != "ScreenScroll" && type != "Animation" && type != "ScreenGesture" && widgetID != this.model.id) {
        if (this.hasFocus) {
          this.input.blur();
        }
      }
    },

    wireEvents () {
      if (!this.wired) {
        this.own(this.addClickListener(this.domNode, lang.hitch(this, "onInputClick")));
        this.own(on(this.input, "focus", lang.hitch(this, "onFocus")));
        if (this.mode == "simulator") {
          this.own(on(this.input, "blur", lang.hitch(this, "onBlur")));
          this.own(on(this.input, "change", lang.hitch(this, "onChange")));
          this.own(topic.subscribe("MatcSimulatorEvent",lang.hitch(this, "onSimulatorEvent")));
        }
      }
      this.afterWiredEvents();
      this.wired = true;
      this.setAutoFocus(this.input);
      this.wireHover()
    },

    onDomMouseOver (e) {
      if (this.hasFocus || this.lastValidation === false) {
        return
      }
      if (this.model.hover) {
        this.emitAnimation(
          this.model.id,
          this.hoverAnimationDuration,
          this.model.hover
        );
      }
      this.emitMouseOver(e);
    },

    onDomMouseOut (e) {
      if (this.hasFocus || this.lastValidation === false) {
        return
      }
      if (this.model.hover) {
        if (this.value && this.model.active) {
          this.emitAnimation(
            this.model.id,
            this.hoverAnimationDuration,
            this.model.active
          );
        } else {
          this.emitAnimation(
            this.model.id,
            this.hoverAnimationDuration,
            this.model.style
          );
        }
      }
      this.emitMouseOut(e);
    },

    /**
     * For child classes to hook in
     */
    afterWiredEvents () {},

    getLabelNode () {
      return this.input;
    },

    onInputClick (e) {
      this.log.log(0, "onInputClick", "enter");
      this.stopPropagation(e);
      this.emitClick(e);
    },

    onFocus (e) {
      this.log.log(0, "onFocus", "enter >" + this.lastValidation);
      this.stopPropagation(e);
      this.hasFocus = true;
      this.keyUpListener = on(this.input,"keyup", lang.hitch(this, "onKeyUp"));
      this.keyDownListener = on(this.input,"keydown", lang.hitch(this, "onKeyDown"));
      this.inputListener = on(this.input,"input", lang.hitch(this, "onTextInput"));
      if (this.model.focus && this.lastValidation) {
        console.debug("onFocus", this.model.focus.color)
        this.emitAnimation(this.model.id, 200, this.model.focus);
      }

      this.emit("focus", {});
      this.afterFocus();
    },

    afterFocus () {
      this.initCompositeState(this._readValue());
    },

    onKeyUp () {
      this.log.log(3, "onKeyUp", "enter > ");
      this.addCompositeSubState(this._readValue());
      this.value = this._readValue();
      this.emit("keyUp", this._readValue());
    },

    /**
     * Fires for every value change, so typing, paste, cut and IME all land
     * here (keyUp misses a context menu paste). The error state shows and
     * clears while the user types, unless the validation was configured as
     * "On Page Navigation" (see util/ValidationTrigger).
     */
    onTextInput () {
      this.normalizeInput();
      if (validatesOnChange(this.model.props.validation)) {
        this.validate(this._readValue(), true);
      }
    },

    onKeyDown(e) {
      this.log.log(3, "onKeyDown", "enter > ");
      const key = e.which || e.keyCode;
      if (13 == key) {
        this.onEnterPressed();
      }
    },

    onEnterPressed () {
      this.input.blur();
      var gesture = {
        type: "KeyboardEnter"
      };
      this.emit("gesture", gesture);
    },

    onChange () {
      // force blur to flush out data binding before
      // any transitions are fired
      //this.onBlur()
      const gesture = {
        type: "InputChange"
      };
      this.emit("gesture", gesture);
    }, 


    onBlur (e) {
      this.log.log(-1, "onBlur", "enter");
      this.stopPropagation(e);
      this.normalizeInput();

      const v = this._readValue();

      this.emitCompositeState("text", v);
      this.emitDataBinding(v);

      const valid = this.validate(this._readValue(), true);
      if (valid) {
        if (this.model.focus) {
          this.emitAnimation(this.model.id, 0, this.style);
        }
      }
      this.value = this._readValue();
      this.cleanUp();
      this.hasFocus = false;
      this.emit("blur", {});
    },

    getStateOptions () {
      return {
        valid: this.lastValidation,
        focus: this.hasFocus
      };
    },

    getState () {
      return {
        type: "text",
        value: this._readValue(),
        options: {
          valid: this.lastValidation,
          focus: this.hasFocus
        }
      };
    },

    /**
     * Subclasses my overwrite this...
     */
    _readValue () {
      if (this.mode == "simulator") {
        const v = this.input.value;
        return this.isNumericValidation() ? toUSNumberString(v) : v;
      } else {
        /**
         * Not this.input.innerHTML: in "view" mode the placeholder is faked
         * by writing the label into the node (setPlaceholder), so the DOM
         * text is the placeholder label whenever no value is set. getState()
         * reads through here, and the player's getDefaultStates() would take
         * that label as the widget's default value.
         */
        return this.value;
      }
    },

    setState (state, t) {
      if (state && state.type == "text") {
        /**
         * If we have children its an animation...
         */
        if (state.children) {
          let substate = this.getLastSubState(state, t);
          if (substate) {
            let value = substate.value;
            this.setValue(value);
          }
        } else {
          this.setValue(state.value);
        }
      }
      if (state && state.type == "typing") {
        /**
         * DEPRECTAED:
         */
        let substate = this.getLastSubState(state, t);
        if (substate) {
          let value = substate.value;
          this.setValue(value);
        }
      }

      this.afterSetState(state, t);
    },

    /**
     * child classes can overwrite
     */
    afterSetState () {},

    cleanUp () {
      if (this.keyUpListener) {
        this.keyUpListener.remove();
      }
      delete this.keyUpListener;
      if (this.keyDownListener) {
        this.keyDownListener.remove();
      }
      delete this.keyDownListener;
      if (this.inputListener) {
        this.inputListener.remove();
      }
      delete this.inputListener;
    },

    render (model, style, scaleX, scaleY) {

      this.model = model;
      this.style = style;
      this._validStyle = lang.clone(style);
      this._scaleX = scaleX;
      this._scaleY = scaleY;

      if (model.props.options) {
        this.hasTypeahead = true;
        this.hints = model.props.options;
      } else {
        this.hints = [];
      }

      if (model.props.stringCase) {
        css.add(this.domNode, "MatcWidgetTypeTextBox" + model.props.stringCase);
      } else {
        css.remove(this.domNode, "MatcWidgetTypeTextBoxUpperCase");
        css.remove(this.domNode, "MatcWidgetTypeTextBoxLowerCase");
      }

      this.initLabel(model)

      if (model.props.validation && this.mode == "simulator") {
        const validation = model.props.validation;
        let type = validation.type;
        if (type == "custom") {
          type = validation.subtype;
        }
        /**
         * Never <input type="number">: the browser renders and accepts the
         * decimal separator of its own locale ("," on de-DE, "." on en-US)
         * and can sanitize a "." entry to empty. The input stays type="text"
         * and gets only the keyboard hint, so the widget owns the text and
         * toUSNumberString() keeps it in US format.
         */
        switch (type) {
          case "int":
            this.input.inputMode = "numeric";
            break;
          case "double":
            this.input.inputMode = "decimal";
            break;
          case "email":
            this.input.type = "email";
            break;
          case "phone":
            this.input.type = "tel";
            break;
          default:
            this.input.inputMode = "";
            break;
        }
      }

      /**
       * WbeKit cannot show the placeholder in the right color.. fucker. So
       * we have to set a pseudo class...
       */
      if (this.mode == "simulator") {
        /**
         * Create a unique class for this run of the simulator to avoid overwriting or some other
         * stuff
         *
         */
        const selector = model.id + "" + new Date().getTime();

        const placeholderStyle = {
          color: this.getPlaceHolderColor(style)
        };

        this.addCssClass(selector + "::-webkit-input-placeholder", placeholderStyle);

        /**
         * Add the pseudo class
         */
        css.add(this.input, selector);
      }

      this.beforeSetStyle(style, model);

      this.setStyle(style, model);
      this.onTextBoxRendered(model)
    },

    initLabel (model) {
      if (this.hasOwnValue()) {
        /**
         * A re-render (RenderFactory.updateWidget() for a script effect) must
         * not wipe a bound or typed value. In "view" mode setPlaceholder()
         * would overwrite the displayed text with the label while leaving
         * this.value alone, and every restore channel (setValue(),
         * setDataBinding()) no-ops on the this.value equality check, so the
         * player would keep showing the placeholder text where the recorded
         * value belongs. Only the label derived text is reset here, so a
         * script that changes the label of a widget that still shows its
         * label as its value keeps working.
         */
        return;
      }
      if (model.props.label) {
        if (model.props.placeholder) {
          this._labelValue = null;
          this.setPlaceholder(model.props.label);
        } else {
          this._labelValue = model.props.label;
          this.setValue(model.props.label, true);
        }
      }
    },

    /**
     * Whether the widget carries a value of its own (data binding or user
     * input) rather than the label text initLabel() derived. Child classes
     * that overwrite initLabel() reuse this for the same guard.
     */
    hasOwnValue () {
      return this.value != null && this.value !== undefined && this.value !== this._labelValue;
    },

    onTextBoxRendered () {

    },

    /**
     * Child classes can do something in here
     */
    beforeSetStyle () {},

    getPlaceHolderColor (style) {
      const c = new Color(style.color);
      c.a = 0.5;
      return c.toString();
    },

    addCssClass (selector, styles) {
      if (!this._styleNode) {
        this._styleNode = [];
      }
      const style = document.createElement("style");
      style.type = "text/css";
      style.setAttribute("matc", "true");
      let s = "." + selector + "{";
      for (let key in styles) {
        s += key + " :" + styles[key] + ";";
      }
      s += "}";
      style.innerHTML = s;
      document.getElementsByTagName("head")[0].appendChild(style);
      this._styleNode.push(style);
    },

    getValue () {
      return this.value;
    },

    /**
     * Whether the validation makes this a number field, which is the only
     * case in which a "," is a decimal separator rather than text. Resolves
     * the "custom" subtype the same way _validateValue() does.
     */
    isNumericValidation () {
      const validation = this.model && this.model.props ? this.model.props.validation : null;
      if (!validation) {
        return false;
      }
      const type = validation.type == "custom" ? validation.subtype : validation.type;
      return type == "int" || type == "double";
    },

    /**
     * Rewrite a localized decimal separator in the input to the US one as the
     * user types, so the field always reads the way the value is stored. The
     * common case is a 1:1 "," to "." replace and keeps the caret; rarer
     * rewrites ("1.234,56") clamp it.
     */
    normalizeInput () {
      if (this.mode != "simulator" || !this.isNumericValidation()) {
        return;
      }
      const raw = this.input.value;
      const normalized = toUSNumberString(raw);
      if (normalized !== raw) {
        const pos = this.input.selectionStart;
        this.input.value = normalized;
        if (pos != null && this.input.setSelectionRange) {
          const p = Math.min(pos, normalized.length);
          this.input.setSelectionRange(p, p);
        }
      }
    },

    unsetPlaceHolder () {
      css.remove(this.input, "MatcWidgetTypeTextBoxInputPlaceholder");
      this.input.style.color = this.style.color;
    },

    setPlaceholder (msg) {
      if (this.mode == "simulator") {
        this.input.placeholder = msg;
      } else {
        css.add(this.input, "MatcWidgetTypeTextBoxInputPlaceholder");
        this.input.innerHTML = msg;
        this.input.style.color = this.getPlaceHolderColor(this.style);
      }
    },

    setValue (value, ignoreValidation) {
      if (value != null && value != undefined) {
        if (this.isNumericValidation()) {
          value = toUSNumberString(value);
        }
        this.unsetPlaceHolder()
        const changed = this.value != value;
        /**
         * Write the DOM whenever it disagrees with the value, not only when
         * this.value changes: a re-render can reset the displayed text
         * (initLabel / setPlaceholder) without touching this.value, and the
         * replay re-applies the recorded value through this method at every
         * frame. Without the sync check those calls would no-op on the
         * this.value equality and leave the reset text on screen.
         */
        const domValue = this.mode == "simulator" ? this.input.value : this.input.innerHTML;
        if (changed || domValue != value) {
          this.value = value;
          if (this.mode == "simulator") {
            this.input.value = value;
          } else {
            this.input.innerHTML = value;
            if (this.model.props.placeholder) {
              if (this.model.props.label != value) {
                this.input.style.color = this.style.color;
              } else {
                this.input.style.color = this.getPlaceHolderColor(this.style);
              }
            }
          }
        }

        if (!ignoreValidation && changed) {
          this.validate(this.value, true);
        }
      }
    },

    _validateValue (value) {
      const validation = this.model.props.validation;
      if (validation) {
        let type = validation.type;
        if (type == "custom") {
          type = validation.subtype;
        }

        /**
         * Now come the rules
         */
        if (validation.required && value == "") {
          return false;
        }

        if (!value) {
          return true;
        }

        if (type == "int") {
          let re = /^-?[0-9]+$/;
          if (re.test(value)) {
            let inRange = true;
            if (validation.min != null && validation.min != undefined) {
              inRange = inRange && value >= validation.min;
            }

            if (validation.max != null && validation.max != undefined) {
              inRange = inRange && value <= validation.max;
            }

            return inRange;
          } else {
            return false;
          }
        }

        if (type == "email") {
          let re = /\S+@\S+\.\S+/;
          return re.test(value);
        }

        if (type == "phone") {
          let re = /^[\+]?([0-9]|[-\s\.])*$/;
          return re.test(value);
        }

        if (type == "date") {
          let re = /^[0-9]{1,2}(\/|-|\.)[0-9]{1,2}(\/|-|\.)[0-9]{2,4}$/;
          return re.test(value);
        }
        if (type == "time") {
          let re = /^[0-9]{2}(\/|-|\.|\:)[0-9]{1,2}$/;
          return re.test(value);
        }

        if (type == "double") {
          var re = /^-?[0-9]+((\.|,)[0-9]+)?$/;
          if (re.test(value)) {
            let inRange = true;
            if (validation.min != null && validation.min != undefined) {
              inRange = inRange && value >= validation.min;
            }

            if (validation.max != null && validation.max != undefined) {
              inRange = inRange && value <= validation.max;
            }

            return inRange;
          } else {
            return false;
          }
        }

        if (type == "string") {
          var operator = validation.operator;

          /**
           * if the value is undefined that is fine for me
           */
          if (value) {
            if (operator == "contains" && validation.text) {
              return value.indexOf(validation.text) >= 0;
            }

            if (operator == "equals" && validation.text) {
              return value == validation.text;
            }

            if (operator == "pattern" && validation.pattern) {
              var reg = new RegExp(validation.pattern);
              return reg.test(value);
            }

            if (operator == "length") {
              let validString = true;
              if (validation.min != null && validation.min != undefined) {
                validString = validString && value.length >= validation.min;
              }
              if (validation.max != null && validation.max != undefined) {
                validString = validString && value.length <= validation.max;
              }
              return validString;
            }
          }
        }
      }

      return true;
    },

    isValid: function(showError) {
      return this.validate(this._readValue(), showError);
    },

    _setDataBindingValue (v) {
      if (this.isQDate(v)) {
        v = this.convertQDateToString(v);
      }
      this.setValue(v);
    },

  

    beforeDestroy () {
      if (this._compositeState) {
        this.emitCompositeState("text", this.input.value);
      }

      this.cleanUpTempListener();

      try {
        if (this._styleNode) {
          for (var i = 0; i < this._styleNode.length; i++) {
            var node = this._styleNode[i];
            node.parentNode.removeChild(node);
          }
          delete this._styleNode;
        }
      } catch (e) {
        console.warn("TextBox.destroy()", e);
      }

      this.cleanUp();
    }
  },
  mounted() {}
};
</script>