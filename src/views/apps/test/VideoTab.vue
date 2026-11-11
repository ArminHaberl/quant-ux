<template>
  <div class="MatcTest">
    <section class="">

        <div class="box is-shadowless">

            <h3 class="title">Screen Recording</h3>
       

       

          <VideoPlayer
            v-if="eventsWithAnnimations.length > 0"
            :app="app"
            :sessionID="sessionID"
            :testSettings="test"
            :annotation="annotation"
            :eventsWithAnnimations="eventsWithAnnimations"
            :mouse="mouseEvents"
            @change="onAnnotationChange"
          />
          <div v-else class="MatcLoading">Loading...</div>
          <div class=" MatcSessionDetails">
            <div>
              <VideoAnnotation
                :appID="app.id"
                :sessionID="sessionID"
                :test="test"
                :annotation="currentAnnotation"
                :pub="pub"
                :event="currentEvents"
                @change="onAnnotationChange"
              />
            </div>
      
          
            <p>Test Performed {{currentDate}}</p>      
            
          </div>
        </div>


        <!-- <div class="box is-shadowless ">
          <h3 class="title">Test name</h3>
          <input class="form-control" v-model="sessionStart.label" @change="onChangeSessionLabel" placeholder="Enter a name for the test"/>
        </div> -->
        <!-- Player -->

    </section>
    <!-- Player & Annotations -->

  </div>
</template>
<script>
import Logger from "common/Logger";
import DojoWidget from "dojo/DojoWidget";
import DataFrame from "common/DataFrame";
import Services from "services/Services";
import Util from "core/Util";
import VideoAnnotation from "views/apps/test/VideoAnnotation";
import VideoPlayer from "views/apps/test/VideoPlayer";

export default {
  name: "Test",
  mixins: [DojoWidget, Util],
  props: ["app", "test", "annotation", "events", "sessionModel"],
  data: function() {
    return {
      sessionID: "",
      hasComments: false,
      eventsWithAnnimations: [],
      sessionStart: '',
      mouseEvents: []
    };
  },
  components: {
    VideoAnnotation: VideoAnnotation,
    VideoPlayer: VideoPlayer
  },
  computed: {
    pub() {
      return this.$route.meta && this.$route.meta.isPublic;
    },
    currentAnnotation() {
      var annotation = this._getSessionAnnotation(
        this.annotation,
        this.app.id,
        this.sessionID
      );
      // legacy annotations did not had tasks
      if (!annotation.tasks) {
        annotation.tasks = {};
        annotation.isValid = true;
      }
      return annotation;
    },
    currentEvents() {
      if (this.sessionModel) {
        /**
         * The shared model has the events grouped by session once per
         * data load. The previous lookup here sorted and regrouped the
         * complete event log on every recompute of this computed
         * whenever anything reactive in the replay tab changed.
         */
        return this.sessionModel.getSession(this.sessionID)
      }
      if (this.events) {
        var df = new DataFrame(this.events);
        df.sortBy("time");
        var sessionGroup = df.groupBy("session");
        var session = sessionGroup.get(this.sessionID);
        return session;
      }
      return null;
    },
    currentDate() {
      let events = this.currentEvents;
      if (events) {
        return this.formatDate(events.min("time"));
      }
      return "-";
    }
  },
  methods: {
    onAnnotationChange(change) {
      let old = this.annotation.find(a => change.id === a.id);
      if (old) {
        old.isValid = change.isValid;
      } else {
        this.annotation.push(change);
      }
      this.$emit("change", this.annotation);
    },
    load() {
      this.sessionID = this.$route.params.session;
      const sessionID = this.sessionID;
      this.eventsWithAnnimations = [];
      this.mouseEvents = [];
      this._loading = true
      Promise.all([
        this.modelService.findEventsBySession(this.app.id, sessionID),
        this.modelService.findMouseBySession(this.app.id, sessionID)
      ]).then(values => {
        this._loading = false
        if (this.sessionID === sessionID) this.onLoaded(values[0], values[1]);
      }).catch(error => {
        this._loading = false
        this.logger.error("load", error)
      });
    },
    onChangeSessionLabel () {
      this.modelService.updateEvent(this.app.id, this.sessionStart)
      this.$root.$emit("Success", "Test name was updated");
    },
    onLoaded(events, mouse) {
       const start = events.find(e => e.type === 'SessionStart')
       if (start) {
          this.sessionStart = start
       }
       this.mouseEvents = mouse;
       this.eventsWithAnnimations = events;
    },

    /**
     * There should be only *ONE* session annotation or *NONE*. This method ensures
     * the uniqueness and creates an empty annoation if needed!
     *
     * The code was before in Annoation.js
     */
    _getSessionAnnotation(annotations, appID) {
      annotations = annotations.filter(a => a.reference === this.sessionID);
      if (annotations.length > 1) {
        /**
         * This should not happen, but we have seen it happeing. We delete this now...
         */
        console.warn("Too many annotations!");
        for (var i = 1; i < annotations.length; i++) {
          var a = annotations[i];
          this.modelService.deleteAnnotation(this.app.id, a.id);
        }
      }
      if (annotations.length >= 1) {
        return annotations[0];
      } else {
        return {
          appID: appID,
          type: "session",
          reference: this.sessionID,
          tasks: {},
          isValid: true,
          sessions: {}
        };
      }
    }
  },
  watch: {
    $route() {
      this.load();
    }
  },
  async mounted() {
    this.logger = new Logger("VideoTab");
    this.logger.info("mounted", "exit");
    this.modelService = Services.getModelService(this.$route);
    this.load();
  },
  /**
   * The replay buffers of the last selected session (its complete event
   * and mouse log) are the biggest per-tab memory. The keep-alive cache
   * releases them on deactivate and refetches them on the next
   * activation: mounted() and the $route watcher are the only other load()
   * callers, so a reactivation would otherwise show an empty replay.
   */
  deactivated() {
    this.eventsWithAnnimations = [];
    this.mouseEvents = [];
  },
  activated() {
    if (this.sessionID && this.eventsWithAnnimations.length === 0 && !this._loading) {
      this.load();
    }
  }
};
</script>
