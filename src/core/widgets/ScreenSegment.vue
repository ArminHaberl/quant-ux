
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
         * a scroll inside the segment, and neither would a bubble phase
         * listener here. Capture does propagate, so this catches the scroll of
         * whatever descendant actually scrolls.
         *
         * That matters because on Windows addScrollIfNeeded tags the segment
         * with data-simplebar and simplebar re-parents the content into a
         * .simplebar-content-wrapper, which becomes the scroll container. The
         * segment itself then has nothing left to overflow, so its scrollTop
         * stays 0. simplebar does that from a MutationObserver, so the wrapper
         * does not exist yet at this point either, which is why we listen on
         * the segment and resolve the real scroller from the event target.
         *
         * passive because we never preventDefault, so there is no reason to
         * sit in the scroll's critical path.
         */
        this.own(on(this.domNode, "scroll", lang.hitch(this, "onSegmentScroll"), { capture: true, passive: true }))
      }
    },

    /**
     * The element that actually scrolls. Either the segment itself, when
     * nothing re-parented its content, or a scrollable descendant of it such as
     * simplebar's content wrapper. Anything else is ignored so an unrelated
     * inner scroller cannot be mistaken for the segment.
     */
    getSegmentScrollNode(target) {
      if (!this.domNode || !target) {
        return null
      }
      if (target === this.domNode) {
        return this.domNode
      }
      if (!this.domNode.contains(target)) {
        return null
      }
      if (target.scrollHeight - target.clientHeight <= 0) {
        return null
      }
      return target
    },

    /**
     * How far the given node is scrolled, 0..1. A ratio rather than pixels,
     * because the player may render the same model at another scale and this
     * stays correct there, the same way Preview.setScroll normalises by the
     * screen height.
     */
    getSegmentScroll(node) {
      if (!node) {
        return 0
      }
      const max = node.scrollHeight - node.clientHeight
      if (max <= 0) {
        return 0
      }
      return Math.min(1, Math.max(0, node.scrollTop / max))
    },

    onSegmentScroll(e) {
      const node = this.getSegmentScrollNode(e && e.target)
      if (!node) {
        return
      }
      const now = new Date().getTime()
      /**
       * Throttle samples, then debounce the emit, so one gesture becomes one
       * event. Same numbers ScrollMixin uses for the screen level.
       */
      if (this._segmentLastSample && now - this._segmentLastSample < 30) {
        return
      }
      this._segmentLastSample = now
      this._segmentScrollNode = node
      if (this._compositeState) {
        this.addCompositeSubState(this.getSegmentScroll(node))
      } else {
        this.initCompositeState(this.getSegmentScroll(node))
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
        this.emitCompositeState("scroll", this.getSegmentScroll(this._segmentScrollNode), null)
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
      /**
       * Measure how far the content actually reaches, not how tall the
       * embedded screen claims to be. The inner container is built with the
       * target screen's declared height, but its children are absolutely
       * positioned and can sit below that, so a screen declared shorter than
       * its own content would never scroll far enough to reveal the lower
       * part. A consent form is the obvious case: the boxes sit well down the
       * page, so if the range is short they never come into view at all.
       *
       * Cannot use domNode.scrollHeight either, that is 570 whenever simplebar
       * has re-parented the content, so the segment looks like it has nothing
       * to scroll. And this stays correct whether the inner container computes
       * as position absolute, which is what the player sees, or static, which
       * is what simplebar forces.
       */
      let contentH = this.cntr.offsetHeight
      const children = this.cntr.children
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const bottom = child.offsetTop + child.offsetHeight
        if (bottom > contentH) {
          contentH = bottom
        }
      }
      const range = Math.max(0, contentH - this.domNode.clientHeight)
      this.cntr.style.top = -value * range + "px"
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
      delete this._segmentScrollNode
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