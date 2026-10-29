<template>
    <div class="MatcWidgetTypeVideo">
        <video v-if="url" :key="url" ref="video" class="MatcWidgetTypeVideoEl"
            :src="url" :style="videoStyle"
            :controls="mode !== 'edit'" playsinline preload="metadata"
            @timeupdate="onVideoProgress" @seeked="onVideoProgress" @ended="onVideoProgress">
            <track v-if="subtitle" :src="subtitle" kind="subtitles"
                srclang="en" label="Subtitles" :default="true" />
        </video>
        <div v-else class="MatcWidgetTypeVideoEmpty">
            <span class="mdi mdi-play"></span>
        </div>
    </div>
</template>
<script>
import DojoWidget from "dojo/DojoWidget";
import UIWidget from "core/widgets/UIWidget";
import VideoCompletion from "core/widgets/VideoCompletion";

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
            /**
             * Optional subtitles, as a plain URL to a WebVTT file, used verbatim
             * as the <track> src. Only a single track is supported and it is
             * always the default one, so the subtitles show as soon as the
             * video plays and the player only ever offers one choice.
             *
             * Must be WebVTT (.vtt). A .srt file will not load. And it has to
             * be same origin, like the video: the track is fetched with CORS
             * rules and no crossorigin attribute is set anywhere, so a track
             * on another origin is silently dropped rather than erroring.
             *
             * The language is hardcoded to English, so the captions menu reads
             * "English" regardless of the language the study is in. It is a
             * one line change to promote it to a second input if that ever
             * matters, since nothing else in the model depends on it.
             */
            subtitle: '',
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
            this._completion = new VideoCompletion();
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
            const url = props.url || '';
            if (url !== this.url) {
                this._completion.reset();
            }
            this.url = url;
            this.fit = props.fit || 'contain';
            this.subtitle = props.subtitle || '';
            this.setStyle(style, model);
        },

        onVideoProgress(event) {
            const video = event.target;
            if (this.mode !== 'simulator' || video.getAttribute('src') !== this.url) {
                return;
            }
            const props = (this.model && this.model.props) || {};
            if (this._completion.update(video.currentTime, video.duration, props.finishedPercentage, event.type === 'ended')) {
                this.emit('videoFinished');
            }
        },

        /**
         * The stylesheet fills the widget box and the native control bar owns
         * playback. Video has no getState(), so it stays out of the replay
         * timeline like GeoLocation.
         */
        getName() {
            return 'Video';
        }
    }
};
</script>
