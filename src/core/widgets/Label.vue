
<template>
  <div class="MatcInlineEditable MatcWidgetTypeLabelInlineEditable"></div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import lang from "dojo/_base/lang";
import css from "dojo/css";
import UIWidget from "core/widgets/UIWidget";
import { buildChatSteps } from "core/widgets/LabelAnimationUtil";

export default {
  name: "Label",
  mixins: [UIWidget, DojoWidget],
  data: function () {
    return  {
      value: "",
      hackValueLabel: false
    };
  },
  components: {},
  methods: {
    postCreate () {
      this._borderNodes = [this.domNode];
      this._backgroundNodes = [this.domNode];
      this._shadowNodes = [this.domNode];
      this._paddingNodes = [this.domNode];
      this._labelNodes = [this.domNode];
    },

    wireEvents () {
      this.own(this.addClickListener(this.domNode, lang.hitch(this, "onClick")));
      this.wireHover()
    },

    onSimulatoStarted () {
      this.isSimulatorStarted = true
      if (this.isAnimated()) {
        if (this.isChatAnimation()) {
          this.startChatAnimation(this.model.props.label, this.animDuration)          
        } else {
          this.startNumberAnimation(this.animMax)
        }
      }
    },

    getLabelNode () {
      return this.domNode;
    },

    render (model, style, scaleX, scaleY) {
      this.model = model;
      this.style = style;
      this._scaleX = scaleX;
      this._scaleY = scaleY;

      if (this.isAnimated()) {
        this.animCurrent = model.props.min
        this.animMax = model.props.max
        this.animDuration = model.props.duration * 1
      }

      this.setStyle(style, model);
      /**
       * Only the running prototype/replay may allow text selection. The design
       * canvas renders the same widget class and needs to keep its own
       * selection, drag & inline edit behaviour.
       */
      this.setSelectable((this.mode === "simulator" || this.mode === "view") && !!model.props?.selectable)
      if (model.props && model.props.label) {
        this.setValue(model.props.label);
      } else {
        this.setValue('');
      }
    },

    setSelectable (selectable) {
      if (selectable) {
        css.add(this.domNode, "MatcWidgetSelectable");
      } else {
        css.remove(this.domNode, "MatcWidgetSelectable");
      }
    },


    /*
     * should be called when the widget was scalled, e.g. by
     */
    updateScale (model, style, scaleX, scaleY) {
      this.model = model;
      this.style = style;
      this._scaleX = scaleX;
      this._scaleY = scaleY;
      this.setStyle(style, model, true);
    },


    /**
    * Build in update scale and just set the font size
     */

    /**
     * Can be overwritten by children to have proper type conversion
     */
    _setDataBindingValue (v) {
      if (this.isQDate(v)) {
        v = this.convertQDateToString(v);
      } else if (this.isQDateRange(v)) {
        v = this.convertQDateToString(v.from) + ' - ' + this.convertQDateToString(v.to);
      } else if (typeof v === 'object' && !Array.isArray(v) && v !== null) {
        try {
          v = JSON.stringify(v, '  ', 2)
        } catch (err) {
          console.warn('Label._setDataBindingValue() Cannot convert JSON', v)
        }
      }
      this.stopChatAnimation()
      if (this.isAnimated() && this.isChatAnimation()) {
        this.startChatAnimation(v, this.animDuration)
        return
      }
      if (this.isAnimated() && !isNaN(v)) {
        this.startNumberAnimation(v)
        return
      }
      if (this.model.props && this.model.props.label) {
        const label = this.getLabelValue()
        v = this.replaceVaribale(label, v)
      }
      this.setValue(v);
    },

    getLabelValue () {
      return this.model.props && this.model.props.label
    },

    replaceVaribale (label, value) {
        if (label.indexOf("{0}") >= 0) {
           return label.replace("{0}", value);
        }
        if (label.indexOf("{value}") >= 0) {
           return label.replace("{value}", value);
        }
        return value
    },

    getValue () {
      return this.value;
    },

    setValue (value) {  
      value += "";
      if (this.value != value) {
        this.value = value;
        this.setInnerHTML(this.domNode, value);
      }
    },

    startChatAnimation (txt, animDuration, delay) {
        const text = txt != null ? String(txt) : ''
        if (text.length === 0) {
            this.stopChatAnimation();
            return;
        }

        /**
         * A second trigger has to replace the first, not join it. Both loops
         * shift from this same array, so leaving the old one running would
         * consume the steps twice as fast and finish in half the time. The
         * clearTimeout that used to be here was clearing a handle that was
         * never assigned, so it did nothing.
         */
        this.stopChatAnimation();

        this.animSteps = buildChatSteps(text, animDuration);
        this.animIsRunning = true;

        /**
         * Blank it now, not on the first frame. With a stagger the first frame
         * is `delay` ms away, and until it arrives the label would sit there
         * showing the whole text and then empty out and type it again, which
         * reads as a flash. The first step is already "", so this only moves
         * the same write earlier rather than adding one.
         *
         * The contract from here on is that the label reads as empty. That also
         * covers a re-trigger, since stopChatAnimation() leaves whatever was on
         * screen until the next frame replaces it.
         *
         * setInnerHTML and not setValue, because setValue would also reassign
         * this.value and the loop below never touches it: getValue() keeps
         * returning the whole text for as long as the typewriter runs.
         */
        this.setInnerHTML(this.domNode, '');

        if (delay > 0) {
            this._chatStartTimeout = setTimeout(() => {
                this._chatStartTimeout = null;
                this.runLabelAnimation("", text)
            }, delay);
        } else {
            this.runLabelAnimation("", text);
        }
    },

    stopChatAnimation () {
        this.animIsRunning = false
        this.animSteps = []
        if (this._chatRAF) {
            cancelAnimationFrame(this._chatRAF);
            this._chatRAF = null;
        }
        if (this._chatStartTimeout) {
            clearTimeout(this._chatStartTimeout);
            this._chatStartTimeout = null;
        }
    },

    startNumberAnimation (to) {
      /**
       * Shares animSteps and animIsRunning with the chat path, so a typewriter
       * still running would have its steps eaten by this loop.
       */
      this.stopChatAnimation();
      const label = this.getLabelValue()
      const diff = to - this.animCurrent
      const frames = (this.animDuration * 30)
      const step = diff / frames
      this.animSteps = []
 
      let x = this.animCurrent
      for (let i = 0; i < frames; i++) {
        this.animSteps.push(Math.round(x))
        x += step
      } 
      this.animSteps.push(to)
      this.animIsRunning = true
      this.runLabelAnimation(label, to)

    },

    runLabelAnimation (label, to, callback) {
        if (!this.animIsRunning || this._isDestroyed) {
          this.animCurrent = to
          return
        }
        if (this.animSteps.length > 0) {
          let value = this.animSteps.shift()
          value = this.replaceVaribale(label, value)
          /**
           * setInnerHTML, not setTextContent. setTextContent turns a newline
           * into the string "<br>" and then assigns it with textContent, which
           * does not parse HTML, so a multi line text came out as literal "<br>"
           * wherever a line break should have been. setValue() already uses
           * setInnerHTML for the same text on the same node, so this also makes
           * the static and the typed paths agree.
           */
          this.setInnerHTML(this.domNode, value);
          this._chatRAF = requestAnimationFrame(() => {
              this.runLabelAnimation(label, to, callback)
          })
        } else {
          this._chatRAF = null
          this.animCurrent = to
          if (callback) {
            callback()
          }
        }
    },

    isAnimated () {
      return this.model && this.model.props.animated
    },

    isChatAnimation () {
      return this.model && this.model.props.animation === 'chat'
    },

    getState () {
      return {
        type: "value",
        value: this.value
      };
    },

    setState (state) {
      /**
       * Hack for the time when we use the getValueLabel() mechnism!
       */
      if (this.hackValueLabel) {
        return;
      }
      if (state && state.type == "value") {
        this.setValue(state.value);
      }
    },

    resize (pos) {
      if (this.style.fontSize === "Auto" || this.style.fontSize === "a") {
        this.domNode.style.fontSize = pos.h * 0.95 + "px";
      }
    },

    _set_color (parent, style) {
      if (style.color) {
        this._set_gradient_color(parent, style)
      }
    },

    _set_fontSize (parent, style) {
      if (style.fontSize === "Auto" || this.style.fontSize === "a") {
        parent.style.fontSize = Math.round(this.model.h * 0.95) + "px";
      } else {
        var size = style.fontSize * this._scaleX;
        if (this._scaleX < 1) {
          size = size * 0.95;
        }
        parent.style.fontSize = Math.round(size) + "px";
      }
    },

    onClick (e) {
      this.stopEvent(e);
      this.emitClick(e);
    },

beforeDestroy () {
        this._isDestroyed = true
        this.stopChatAnimation()
    }


  
   
  },
  mounted() {}
};
</script>