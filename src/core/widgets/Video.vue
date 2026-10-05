<template>
    <div class="MatcWidgetTypeVideo">
        <video v-if="url" :key="url" ref="video" class="MatcWidgetTypeVideoEl"
            :src="url" :style="videoStyle"
            :controls="mode !== 'edit'" playsinline preload="metadata"></video>
        <div v-else class="MatcWidgetTypeVideoEmpty">
            <span class="mdi mdi-play"></span>
        </div>
    </div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import UIWidget from "core/widgets/UIWidget";

export default {
    name: "Video",
    mixins: [UIWidget, DojoWidget],
    data: function () {
        return {
            /**
             * The video file, as a plain URL. Absolute (https://host/clip.mp4)
             * and same origin relative paths (/quant-ux/videos/clip.mp4) both
             * work, because we use it verbatim as the src.
             *
             * Deliberately not the app upload endpoint: the backend serves
             * uploads at /rest/images/:appID and ImageREST.checkImage only
             * accepts jpg, png, jpeg, gif and svg, so nothing but an image can
             * be uploaded there. AudioPlayer.props.file points at /rest/uploads,
             * which does not exist in the deployed backend at all.
             */
            url: '',
            /**
             * How the video fills the widget box. contain letterboxes and never
             * distorts, cover fills the box and crops. Defaults to contain
             * because stretching a video looks broken.
             */
            fit: 'contain',
            style: {},
            model: {}
        };
    },
    components: {},
    computed: {
        videoStyle() {
            return { objectFit: this.fit };
        }
    },
    methods: {
        postCreate() {
            this._borderNodes = [this.$el];
            this._backgroundNodes = [this.$el];
            this._shadowNodes = [this.$el];
            this._paddingNodes = [this.$el];
            this._labelNodes = [this.$el];
        },

        render(model, style, scaleX, scaleY) {
            this.model = model;
            this.style = style;
            this._scaleX = scaleX;
            this._scaleY = scaleY;
            const props = (model && model.props) || {};
            this.url = props.url || '';
            this.fit = props.fit || 'contain';
            this.setStyle(style, model);
        },

        /**
         * No resize() and no wireEvents() on purpose. The stylesheet already
         * fills the widget box with width/height 100%, and the native control
         * bar owns every interaction, so the widget has nothing to measure and
         * nothing to listen for. It also has no getState(), so it stays out of
         * the replay timeline like GeoLocation.
         */
        getName() {
            return 'Video';
        }
    }
};
</script>