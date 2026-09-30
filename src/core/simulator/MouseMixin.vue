<template>
  <div></div>
</template>
<script>
import domGeom from "dojo/domGeom";
import Services from "services/Services";

/**
 * Samples per document. Was hardcoded inline before.
 */
const MOUSE_FLUSH_SIZE = 20;

/**
 * Flush a batch that has been sitting unsent this long, so the tail of a
 * session does not wait for the sample count or for a clean destroy.
 */
const MOUSE_STALE_MS = 2000;

export default {
  name: "MouseMixin",
  methods: {
    onWidgetMouse(e, clicked) {
      if (this.logMouse) {
        var pos = this.getMouse(e);
        var now = new Date().getTime();

        /**
         * Widget events we sample with a higher precision,
         * as otherwise the animations get bumpy
         */
        if (now - this.lastMouse > this.mouseSampleRate) {
          this.initMouseEvent(this.mouseSampleRate);
          this._mouseMoveEvent.x.push(pos.x);
          this._mouseMoveEvent.y.push(pos.y);
          this._mouseMoveEvent.c.push(clicked);
          this._mouseMoveEvent.t.push(now);
          this.flushMouse();
          this.lastMouse = now;
        }
      }
    },

    onMouseWheel(e) {
      this.onMouseMove(e);
    },

    onMouseMove(e) {
      if (this.logMouse) {
        var pos = this.getMouse(e);
        var now = new Date().getTime();
        /**
         * Sample rate 200ms. the rest will be interpolated in the
         * browser via css animations... Anyhow store the sample rate
         * so we adapt later in the browser
         */
        if (now - this.lastMouse > this.mouseSampleRate) {
          this.initMouseEvent(this.mouseSampleRate);

          this._mouseMoveEvent.x.push(pos.x);
          this._mouseMoveEvent.y.push(pos.y);
          this._mouseMoveEvent.c.push(0);
          this._mouseMoveEvent.t.push(now);

          this.flushMouse();

          this.lastMouse = now;
        }
      }
    },

    initMouseEvent(sampleRate) {
      if (!this._mouseMoveEvent) {
        var user = this.getUser();
        var session = this.getSession();

        this._mouseMoveEvent = {
          x: [],
          y: [],
          c: [],
          t: [],
          user: user,
          session: session,
          screen: this.currentScreen.id,
          sample: sampleRate,
          /**
           * When this batch was opened, so a stale one still gets shipped.
           */
          started: new Date().getTime(),
        };

        if (this.currentOverlay) {
          this._mouseMoveEvent.screen = this.currentOverlay.id;
        }
      }
    },

    /**
     * Decide whether the pending batch should go out now.
     *
     * force is used at screen and overlay transitions, because initMouseEvent
     * stamps the screen once per batch, so a batch that spans a transition
     * would label every sample after it with the wrong screen.
     */
    flushMouse(force) {
      if (!this._mouseMoveEvent || this._mouseMoveEvent.x.length === 0) {
        return
      }
      const stale = new Date().getTime() - this._mouseMoveEvent.started > MOUSE_STALE_MS
      if (!force && this._mouseMoveEvent.x.length < MOUSE_FLUSH_SIZE && !stale) {
        return
      }
      if (this._mouseSending) {
        /**
         * A send is in flight. Its completion path flushes again, so just
         * remember that a flush was asked for. Sending here would serialise
         * the same batch a second time, which is how 57% of the stored mouse
         * samples ended up duplicated.
         */
        this._mouseFlushAgain = true
        return
      }
      this.sendMouse()
    },

    async sendMouse() {
      this.logger.log(3, "sendMouse", "enter");
      if (!this._mouseMoveEvent) {
        return
      }
      this.eventCount++;
      if (this.eventCount > this.maxEventCount) {
        console.warn("sendMouse() Too many events");
      }
      /**
       * Detach the batch before the await, not after it. Samples that arrive
       * while the POST is in flight then go into a fresh batch instead of
       * being dropped by a delete that used to sit after the await, and they
       * get stamped with the correct screen.
       */
      const batch = this._mouseMoveEvent
      this._mouseMoveEvent = null
      this._mouseSending = true
      try {
        if (this.logData && this.hash) {
          let res = await Services.getModelService().saveMouse(
            this.model.id,
            this.hash,
            batch
          );
          this.onMouseSaved(res);
        } else {
          this.logger.log(2, "sendMouse", "not logged, dropped " + batch.x.length + " samples");
        }
      } finally {
        this._mouseSending = false
        if (this._mouseFlushAgain) {
          this._mouseFlushAgain = false
          this.flushMouse(true)
        }
      }
    },

    onMouseSaved() {},

    getMouse(e, isFixedPosition) {
      if (e && this.currentScreen) {
				var domPos = domGeom.position(this.domNode);
				var pos = this._getMousePosition(e); // use form dojo widget

				/**
				 * Somehow compensate of scrolling. If we have fixed position
				 * ignore the scroll.
				 *
				 * FIXME: This does not work at all!
				 */
				if (!isFixedPosition) {
					var doc = document.documentElement;
					var top = (window.pageYOffset || doc.scrollTop) - (doc.clientTop || 0);
					domPos.y += top;
				} else {
					/**
					 * FIXME: What about the Scroller.js which set the x to negative... we should check that somehow...
					 */
				}

				/**
				 * get pixel position in domNode
				 */
				pos.x -= domPos.x;
				pos.y -= domPos.y;

				/**
				 * make relative to compensate different scalings
				 */
				pos.x = Math.min(1, Math.round((pos.x / this.currentScreen.w) * 1000) / 1000 );
				pos.y = Math.min(1, Math.round((pos.y / this.currentScreen.h) * 1000) / 1000 );
				return pos;
			}
			return { x: -1, y: -1 };
    },
  },
};
</script>