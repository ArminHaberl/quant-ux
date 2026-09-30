
<template>
  <div
    :class="['MatcWidgetTypeScreenSegement', { 'MatcWidgetTypeScreenSegementOverFlow': hasOverflow }, { 'MatcWidgetTypeScreenSegementSnapp': hasSnapp }]">

  </div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import UIWidget from "core/widgets/UIWidget";
import DomBuilder from 'common/DomBuilder'
import Core from 'core/Core'
import Logger from 'common/Logger'
import lang from 'dojo/_base/lang'
import on from 'dojo/on'
import * as ScrollUtil from '../../util/ScrollUtil'

export default {
  name: "ScreenSegment",
  mixins: [UIWidget, DojoWidget],
  data: function () {
    return {
      model: {
        props: {}
      },
      hasXOverFlow: false,
      dataBindingValues: null
    };
  },
  computed: {
    hasOverflow() {
      return true
    },
    hasSnapp() {
      return this.model?.props?.snapp === true
    }
  },
  methods: {

    postCreate() {
      this._borderNodes = [this.domNode];
      this._backgroundNodes = [this.domNode];
      this._shadowNodes = [this.domNode];
    },

    wireEvents() {
      if (this.domNode) {
        /**
         * In Simulator mode we add scroll hacks if needed
         */
        ScrollUtil.addScrollIfNeeded(this.domNode, false)
        /**
         * scroll does not bubble, so the simulator's own ScrollMixin never sees
         * a scroll inside the segment. Emit it as a widget composite state, the
         * way MobileDropDown records its popup scroll, which the player already
         * knows how to replay.
         */
        this.own(on(this.domNode, "scroll", lang.hitch(this, "onSegmentScroll")))
      }
    },

    /**
     * How far the segment is scrolled, 0..1. A ratio rather than pixels,
     * because the player may render the same model at another scale and this
     * stays correct there, the same way Preview.setScroll normalises by the
     * screen height.
     */
    getSegmentScroll() {
      if (!this.domNode) {
        return 0
      }
      const max = this.domNode.scrollHeight - this.domNode.clientHeight
      if (max <= 0) {
        return 0
      }
      return Math.min(1, Math.max(0, this.domNode.scrollTop / max))
    },

    onSegmentScroll() {
      const now = new Date().getTime()
      /**
       * Throttle samples, then debounce the emit, so one gesture becomes one
       * event. Same numbers ScrollMixin uses for the screen level.
       */
      if (this._segmentLastSample && now - this._segmentLastSample < 30) {
        return
      }
      this._segmentLastSample = now
      if (this._compositeState) {
        this.addCompositeSubState(this.getSegmentScroll())
      } else {
        this.initCompositeState(this.getSegmentScroll())
      }
      clearTimeout(this._segmentScrollTimeout)
      this._segmentScrollTimeout = setTimeout(lang.hitch(this, "flushSegmentScroll"), 250)
    },

    flushSegmentScroll() {
      /**
       * emitCompositeState deletes _compositeState, so the next sample starts
       * a fresh gesture.
       */
      if (this._compositeState) {
        this.emitCompositeState("scroll", this.getSegmentScroll(), null)
      }
    },

    /**
     * The player seeds its per screen widget state map from getState(), and
     * only creates an entry for a screen when some widget on it returns
     * something truthy. Without this, a screen containing just a segment (and
     * boxes or images, which have no state of their own) would get no entry
     * and the recorded scroll would be dropped during replay. MobileDropDown
     * records its popup scroll the same way and has the same hole.
     *
     * A segment always starts unscrolled, so 0 is the honest default.
     */
    getState() {
      return {
        type: "scroll",
        value: 0
      }
    },

    /**
     * Replay. Scroll a segment by translating its inner container rather than
     * setting scrollTop, because the player does not run wireEvents and so has
     * no simplebar, which would show a native scrollbar the participant never
     * saw. Mirrors Preview.setScroll, which translates the screen div.
     */
    setState(state, t) {
      if (state && state.type === "scroll") {
        const substate = this.getLastSubState(state, t)
        /**
         * getLastSubState returns null before the first sample, which is what
         * happens when the player is scrubbed back before the gesture began.
         * Reset instead of leaving the previous offset in place.
         */
        this.applySegmentScroll(substate ? substate.value : 0)
      }
    },

    applySegmentScroll(value) {
      if (!this.cntr || !this.domNode) {
        return
      }
      const max = this.domNode.scrollHeight - this.domNode.clientHeight
      this.cntr.style.top = -value * max + "px"
    },

    beforeDestroy() {
      /**
       * Drop a gesture that was still inside the 250ms debounce when the
       * widget went away. DragNDrop instead flushes here, but emitting a
       * stateChange from inside RenderFactory.cleanUp would log an event
       * against a widget that is already being torn down.
       */
      clearTimeout(this._segmentScrollTimeout)
      delete this._segmentScrollTimeout
      delete this._compositeState
      delete this._segmentLastSample
    },

    setSymbol(s) {
      this.isSymbol = s
    },

    setZoomedModel(m) {
      this.app = m;
    },

    getChildren() {
      return this._childWidgets
    },

    getDataBindingChildren() {
      return this._childWidgets
    },

    update(widget) {
      /**
       * FIXME: we shoukd have here some kind of fast rendering!
       */
      this.render(widget, this.style, this._scaleX, this._scaleY)
    },

    updateChild(widget) {
      if (this._childWidgets) {
        let childWidget = this._childWidgets.find(c => c.parent === widget.id)
        if (childWidget) {
          childWidget.widget.style = widget.style;
          childWidget.widget.props = widget.props;
          this.factory.setStyle(childWidget.div, childWidget.widget);
        }
      }
    },

    render(widget, style, scaleX, scaleY) {

      /**
       * This is super slow for fast rendering, as we will redraw everzthing. We must
       * therefore reuse the items or have some kind of rerender() method if the
       * isUpdate parameter is set
       */
      this.model = widget;
      this.style = style;
      this._scaleX = scaleX;
      this._scaleY = scaleY;
      this.setStyle(style, widget);

  

      if (!this.isSymbol && this.app && widget.props.screenID) {
        this.logger.log(2, 'render', 'enter > full render')
        this.renderScreen(widget, widget.props.screenID)
      } else {
        this._screenID = ''
        const db = new DomBuilder()
        db.div('MatcWidgetTypeScreenSegementHint', 'Select a screen segment').build(this.domNode)
      }
    },

    renderScreen(widget, screenID) {

      const db = new DomBuilder()
      const screen = this.app.screens[screenID]
      if (screen) {

        const core = new Core()
        core.model = this.app

        /**
         * If the segment's target screen is the screen the segment itself
         * lives on, the surrounding renderer (preview/simulator) already
         * rendered those widgets. Re-rendering them here would stack a
         * duplicate copy on top of the originals (which replay may leave
         * blank). Skip them to avoid the overlapping copies.
         */
        const parentScreen = core.getParentScreen(widget, this.app)
        if (parentScreen && screenID === parentScreen.id) {
          this.logger.log(0, 'renderScreen', 'Skip self screen ' + screenID)
          return
        }

        /**
         * Attention: The core.sortedList is somehow reversed... So, we
         * prevent this by passing a new parameter.
         */
        const widgets = core.getSortedScreenChildren(this.app, screen, false)
        if (this.childrenAreModified(widgets)) {
          this.logger.log(-1, 'renderScreen', 'Exit because ne change')
          return
        }
        this.logger.log(-1, 'renderScreen', 'Start rendering')
       
        this._screenID = screenID
        this.domNode.innerHTML = ""
        this._childWidgets = [] 

        const cntr = db
          .div('MatcWidgetTypeScreenSegementCntr')
          .w(screen.w)
          .h(screen.h)
          .build()

        this._childLastModified = {}
        for (let i = 0; i < widgets.length; i++) {
          const childWidget = widgets[i];
          this._childLastModified[childWidget.id] = childWidget.modified
          const copy = lang.clone(childWidget)
          copy.inherited = childWidget.id
          copy.id = childWidget.id + '@' + parentScreen?.name

          const div = this.renderWidget(copy, screen, db)
          cntr.appendChild(div)

          const child = {
            parent: childWidget.id,
            widget: copy,
            div: div
          }

          this._childWidgets.push(child)
        }
        this.cntr = cntr
        this.domNode.appendChild(cntr)


      } else {
        db.div('MatcWidgetTypeScreenSegementHint', 'Screen segment does not exist').build(this.domNode)
      }
    },

    childrenAreModified (widgets) {
        if (this._childLastModified) {
          const modified = widgets.filter(w => {
            return this._childLastModified[w.id] !== w.modified
          })
          if (modified.length === 0) {
            return true
          }
        }
      return false
    },

    renderWidget(widget, screen, db) {
      const div = db.div('MatcBox MatcWidget')
        .w(widget.w)
        .h(widget.h)
        .top(widget.y - screen.y)
        .left(widget.x - screen.x)
        .build()

      this.factory.createWidgetHTML(div, widget);

      return div
    },

    setValue(value) {
      const newScreen = Object.values(this.app.screens).find(s => s.name === value)
      if (newScreen) {
        this.renderScreen(this.model, newScreen.id)
        this.emit('rerender', this)
      } else {
        this.logger.error('setValue', 'Screen with name ' + value + ' does not exist')
        this.renderScreen(this.model, this.model?.props?.screenID)
      }
    }
  },
  mounted() {
    this.logger = new Logger('ScreenSegment')
  }
};
</script>