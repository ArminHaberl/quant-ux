<template>
     <div class="MatcPlayer">
		<div class="MatcPlayerLeft">
			<div v-if="preparing" class="MatcLoading">Preparing recording...</div>
			<div class="MatcPlayerView" ref="container">
			</div>
			<div class="MatcPlayerNav">
				<div class="MatcPlayerTasks" ref="tasks">
				</div>
				<div class="MatcPlayerProgress" ref="progress">
				</div>
			</div>	
		
			<div class="MatcPlayerButtonBar">
				<div class="">
					<a data-dojo-attach-point="btnBack"><span class="mdi mdi-skip-previous"></span></a>
					<a data-dojo-attach-point="btnPlay"><span data-dojo-attach-point="iconPlay" class="mdi mdi-play"></span></a>
					<span class="MatcPlayerTime" data-dojo-attach-point="time"></span>
				</div>
			</div>
		</div>
		<div class="MatcPlayerEvents" data-dojo-attach-point="eventCntr">

		</div>
	</div>
</template>
<script>
import DojoWidget from 'dojo/DojoWidget'
import css from 'dojo/css'
import on from 'dojo/on'
import touch from 'dojo/touch'
import lang from 'dojo/_base/lang'
import domGeom from 'dojo/domGeom'
import Logger from 'common/Logger'
import DataFrame from 'common/DataFrame'
import HSlider from 'common/HSlider'
import DomBuilder from 'common/DomBuilder'
import Util from 'core/Util'
import RenderFactory from 'core/RenderFactory'
import Animation from 'core/Animation'
import Analytics from 'dash/Analytics'
import Preview from 'page/Preview'
import Core from 'core/Core'
import Services from 'services/Services'
import { getEventAnimations, expandAnimations } from 'core/engines/ScriptAnimationReplay'
import { isLifecycleState } from 'core/engines/ScriptStateReplay'
import ReplayStateIndex from 'core/engines/ReplayStateIndex'
import ReplayAnimationIndex from 'core/engines/ReplayAnimationIndex'

export default {
    name: 'Player',
	mixins:[DojoWidget, Util],
	props: ["app", "testSettings", "annotation", "sessionID", "eventsWithAnnimations", "pub", "mouse"],
    data: function () {
        return {
            running: false,
            preparing: false,
            currentTime: 0,
            lastEventPos: 0,
            animationTimeOffSet: 400,
            mode: "private",
            invisibleEvents: {
				"Animation": true,
				"SessionStart": true,
				"ScreenAnimation": true,
				"OverlayShowAnimation": true,
				"OverlayRemoveAnimation": true,
				"ValidationOk": true,
				"ScriptEffect": true,
				"MouseOut": true,
				"MouseOver": true,
				"WidgetInit": true
			}
        }
    },
	components: {},

    methods: {
      postCreate (){
			this.logger = new Logger('VideoPlayer');
			this.analytics = new Analytics();
			this.jwtToken = Services.getUserService().getToken()
			this.db = new DomBuilder()
			this.own(on(this.btnBack, touch.press, lang.hitch(this, "onBack")));
			this.own(on(this.btnPlay, touch.press, lang.hitch(this, "onPlay")));
			this.init()
		},

		init () {
			if (this.app) {
				this.setModel(this.app)
				/**
				 * Events are used as recorded. Do not normalise container child ids
				 * here: a ScreenSegment or Repeater copy is registered under its
				 * mangled id, and setWidgetState has to look it up under that same
				 * id. Stripping the suffix made every copy state miss, so
				 * repeaters never replayed. Names are resolved at display time
				 * instead, via analytics.toModelWidgetID.
				 */
				var df = new DataFrame(this.eventsWithAnnimations);
				var sessionGroup = df.groupBy("session");
				var session = sessionGroup.get(this.sessionID);
				this.mouseData = this.mouse
				this.setSession(session, this.sessionID)
			}
		},

		setMouse (m) {
			this.mouseData = m
		},

		setTestSettings (t) {
			this.testSettings = t
		},

		setDialog(dialog) {
			this.dialog = dialog
		},

		setModel(model){
			this.model = this.createInheritedModel(model);
			this.model = Core.addContainerChildrenToModel(this.model)
			this.initSize()
		},

		initSize () {
			this.previewWrapper = this.renderPreview()
		},

		async setSession(session,sessionID){
			this.logger.log(0, "setSession", "enter " + sessionID);
			const request = this._sessionRequest = (this._sessionRequest || 0) + 1;
			this.preparing = true;
			try {

				this.sessionID = sessionID;
				this.session = session;
				session.sortBy("time");
				this.events = session.as_array().map(event => Object.assign({}, event, {
					gesture: event.gesture ? lang.clone(event.gesture) : event.gesture
				}));


				/**
				 * Now we have to the WidgetClick events a little and move them forward
				 * if the trigger a screen transition, because otherwise the the animation
				 * is deleted.
				 * Also we fix ScreenGestures
				 */
				for(var i=0; i <this.events.length;i++){
					var event = this.events[i];
					var nextEvent = null;
					if(i +1 < this.events.length){
						nextEvent = this.events[i+1];
						if((nextEvent.type == "ScreenLoaded" || nextEvent.type == "ScreenAnimation") && ( event.type=="WidgetClick" || event.type == "ScreenGesture")){
							event.time -= this.animationTimeOffSet;
							event._transition = true;
						}
					}
				}

				/**
				 * Fix gestures
				 */
				this.fixGestures(this.events);


				/**
				 * no check for tasks
				 */
				this.taskMatches = this.getMatches();


				this.duration = Math.max(1, this.session.max("time") - this.session.min("time"));
				this.min = this.session.min("time");

				/**
				 * Find the animations a script recorded, and stretch the
				 * duration so a fade triggered by the last click still has
				 * room to play out. Must happen before render(), which takes
				 * the duration as the slider maximum, and before
				 * the animation index is built.
				 */
				this.collectScriptAnimations();


				/**
				 * init widget states
				 */
				 this._replayState = new ReplayStateIndex(this.events, this.getDefaultStates());
				 const cancelled = () => request !== this._sessionRequest || this._isDestroyed;
				 await this._replayState.build(cancelled);
				 if (request !== this._sessionRequest || this._isDestroyed) return;
				 for (let i = 0; i < this.events.length; i++) this.events[i]._replayIndex = i;


				 this.initMouseData();
				 this.render();

				 /**
				  * init animations
				  */
				 await this.initSparseAnimations(cancelled);
				 if (cancelled()) return;


				 this.lastEventPos =0;
				 this.setTime(0);
			} catch(e){
				console.error('VideoPlayer.setSession() > Error', e);
			} finally {
				if (request === this._sessionRequest) this.preparing = false;
			}
		},

		/**
		 * Index the recorded mouse samples without allocating slots for idle time.
		 */
		initMouseData(){
			var maxMouse = 0;
			var mouseStates = [];
			if(this.mouseData){

				var d = this.mouseData;
				for(var i=0; i< d.length; i++){
					var batch = d[i];
					for(var j=0; j < batch.t.length; j++){
						var e = {
							screen : batch.screen,
							time : batch.t[j],
							x : batch.x[j],
							y : batch.y[j],
							dur : batch.sample
						}
						mouseStates.push(e);
						maxMouse = Math.max(maxMouse, e.time)
					}
				}
				this.mouseData = null
			}
			mouseStates.sort((a, b) => a.time - b.time);
			this._mouseStates = mouseStates;
			this._lastMouseSample = null;
			this.duration = Math.max( maxMouse-this.min, this.duration);
		},


		/**
		 * Collect the animations a script recorded, per event, and stretch the
		 * duration of the replay to cover them.
		 *
		 * The schedules are resolved against the model once here and reused by
		 * the animation index, because a group animation has to be fanned out to
		 * its children to know how long the last of them takes, and both
		 * passes have to agree on those delays.
		 */
		collectScriptAnimations (){
			this._scriptAnimationSchedules = {};
			var end = 0;
			for(let i=0; i < this.events.length;i++){
				var event = this.events[i];
				var animations = getEventAnimations(event);
				if(animations.length === 0){
					continue;
				}
				var schedules = expandAnimations(this.model, animations);
				this._scriptAnimationSchedules[event.id] = schedules;
				var start = event.time - this.min;
				for(let j=0; j < schedules.length;j++){
					var schedule = schedules[j];
					end = Math.max(end, start + schedule.delay + schedule.duration);
				}
			}

			/**
			 * Two slots of tail. Playback stops at this.duration, so an
			 * animation that ends exactly there would never show its last
			 * frame, and with it the state the widget is left in.
			 */
			if(end > 0){
				this.duration = Math.max(this.duration, end + 60);
			}
		},

		async initSparseAnimations (cancelled) {
			this._animationIndex = new ReplayAnimationIndex(
				this.events, this.model, this.min, this.duration, new Animation(),
				(screen, pos) => this.getAbsolutePosition(screen, pos), this._scriptAnimationSchedules
			);
			await this._animationIndex.build(cancelled);
			if (cancelled()) return;
			this.events = this.events.filter(event => event.type !== 'Animation');
		},


		getAbsolutePosition(screenID, pos){
			var screen = this.scaledModel.screens[screenID];
			if(screen){
				var result = {
					x : Math.round(screen.w * pos.x),
					y : Math.round(screen.h * pos.y),
					w : Math.round(screen.w * pos.w),
					h : Math.round(screen.h * pos.h)
				};
				return result;
			}
		},


		/**
		 * This method gets the default state for every widget. It does this by renderibg each widget once, and calling the getState() method,
		 * whoich should be corretly initialized form the UIWidget objects during rendering!
		 */
		getDefaultStates(){
			this.logger.log(2, "getDefaultStates", "enter");

			var fac = new RenderFactory();
			fac.setJwtToken(this.jwtToken)
			fac.setModel(this.model); // FIXME: Shouldn't this be zoomed?
			fac.setMode("view");
			fac.setScaleFactor(1,1);

			var dummy = document.createElement("div");

			var states = {};
			var screenStates = {};

			for(var id in this.model.widgets){
				var widget = this.model.widgets[id];
				var screen = this.getParentScreen(widget);
				if(screen){
					if(!screenStates[screen.id]){
						screenStates[screen.id] = {};
					}
					var uiWidget = fac.createUIWidget(dummy,  widget);
					if(uiWidget){
						var state = uiWidget.getState();
						if(state){
							//this.logger.log(3, "getDefaultStates", "State for widget '" +id +"' (" + widget.name +  ") >> " + state.type + " :  "+ state.value);
							states[id] = state;
							screenStates[screen.id][id] = state;
						}
					}
				}

			}
			fac.cleanUp();
			return screenStates;
		},

		getMatches(){

			this.taskNames = {};
			if(this.testSettings){

				var session = new DataFrame(this.events);
				session = this.getActionEvents(session);

				var tasks = this.testSettings.tasks;
				for(var i=0; i < tasks.length; i++){
					this.taskNames[tasks[i].id] = tasks[i].name;
				}
				return this.analytics.getTaskPerformance(session, tasks, true);


			}

			return null;
		},

		onBack(e){
			this.stopEvent(e);
			if (this.preparing) return;
			this.currentTime =0;
			this.lastEventPos = 0;
			this.setTime(0);
		},

		onPlay(e){
			this.stopEvent(e);
			if (this.preparing) return;

			/**
			 * make sure we start from the beginning after we have ended!
			 */
			if(this.currentTime >= this.duration){
				this.currentTime =0;
				this.lastEventPos = 0;
			}

			if(!this.running){
				this.start();
			} else {
				this.stop();
			}
		},

		start(){
			this.running = true;
			css.add(this.iconPlay, "mdi-pause");
			css.remove(this.iconPlay, "mdi-play");
			this.lastLoop = new Date().getTime();
			requestAnimationFrame(lang.hitch(this, "loop"));
		},



		stop(){
			this.running = false;
			css.remove(this.iconPlay, "mdi-pause");
			css.add(this.iconPlay, "mdi-play");
		},


		loop(){
			var now = new Date().getTime();
			var dif = now - this.lastLoop;
			this.lastLoop = now;
			this.currentTime += dif;


			if(this.currentTime < this.duration){
				this.setTime(this.currentTime);
				if(this.running){
					requestAnimationFrame(lang.hitch(this, "loop"));
				}
			} else {
				// make sure we show the last event!
				this.setTime(this.duration, true);
				this.stop();
			}

		},



		render(){
			this.logger.log(2,"render","enter");


			this.preview = this.$new(Preview, {isPlayer:true});
			this.preview.setJwtToken(this.jwtToken)
			this.preview.placeAt(this.previewWrapper);
			this.preview.setModel(this.model);

			this.scaledModel = this.preview.model;

			this.slider = this.$new(HSlider);
			this.slider.setMax(this.duration);
			this.slider.setMarks(this.getAnnotation());
			this.slider.placeAt(this.$refs.progress);

			this.own(on(this.slider, "change", lang.hitch(this, "onSliderChange")));
			this.renderEventList();
			this.renderTaskBar()
		},

		renderPreview () {
			this.$refs.container.innerHTML="";
			var previewWrapper = document.createElement("div");
			css.add(previewWrapper, "MatcPlayerPreview");
			this.layout(previewWrapper);
			return previewWrapper
		},

		renderTaskBar () {
			if(	this.taskMatches){
				const tasks = this.taskMatches.as_dict('task')
				for (let id in this.taskNames) {
					const label = this.taskNames[id]
					let row =  tasks[id]
					if (row) {
						const start = (row.startTime - this.min) / this.duration
						const length = (row.endTime - row.startTime) / this.duration
						this.renderTask(start, length, label)
					}
				}
				if (Object.values(tasks).length === 0) {
					css.add(this.$refs.tasks, "MatcHidden")
				}
			}
		},

		renderTask (start, length, label) {			
			const bar = this.db
				.div('MatcPlayerTasksBarCntr')
				.div('MatcPlayerTasksBar', label)
				.build(this.$refs.tasks)
		
			bar.style.left = Math.min(97, (start * 100)) +'%'
			bar.style.width = Math.max(3, 100* length) +'%'
		},


		getAnnotation(){
			const result = [];
			if(	this.taskMatches){
				this.taskMatches.foreach(row => {
					const marker = {
						start : row.startTime - this.min,
						length : 0
					}
					result.push(marker);
				});
			}
			return result;
		},

		renderEventList(){
			this._visibleEvents = this.events.filter(e => !e.type || (!this.invisibleEvents[e.type] && !e.hidden));
			this._eventPage = 0;
			this.renderEventPage();
		},

		renderEventPage(){
			const list = this._visibleEvents;
			const pageSize = 200;
			const start = this._eventPage * pageSize;
			const end = Math.min(start + pageSize, list.length);

			this.eventCntr.innerHTML="";
			this.cleanUpTempListener();

			var parent = document.createElement("div");
			if (list.length > pageSize) {
				const nav = document.createElement('div');
				css.add(nav, 'MatcPlayerEventPages');
				const previous = document.createElement('button');
				previous.type = 'button';
				previous.textContent = 'Previous';
				previous.disabled = this._eventPage === 0;
				const label = document.createElement('span');
				label.textContent = `${start + 1}–${end} of ${list.length}`;
				const page = document.createElement('input');
				page.type = 'number';
				page.min = '1';
				page.max = String(Math.ceil(list.length / pageSize));
				page.value = String(this._eventPage + 1);
				page.setAttribute('aria-label', 'Event page');
				const next = document.createElement('button');
				next.type = 'button';
				next.textContent = 'Next';
				next.disabled = end === list.length;
				nav.appendChild(previous);
				nav.appendChild(label);
				nav.appendChild(page);
				nav.appendChild(next);
				parent.appendChild(nav);
				this.tempOwn(on(previous, 'click', () => { this._eventPage--; this.renderEventPage(); this.eventCntr.scrollTop = 0; }));
				this.tempOwn(on(page, 'change', () => {
					const number = Math.floor(Number(page.value));
					if (number >= 1 && number <= Number(page.max)) {
						this._eventPage = number - 1;
						this.renderEventPage();
						this.eventCntr.scrollTop = 0;
					} else {
						page.value = String(this._eventPage + 1);
					}
				}));
				this.tempOwn(on(next, 'click', () => { this._eventPage++; this.renderEventPage(); this.eventCntr.scrollTop = 0; }));
			}

			for(let i=start; i< end; i++){
				let e = list[i];
				let type = e.type;
				if(type){

					if(!this.invisibleEvents[type] && !e.hidden){
						var item = document.createElement("div");
						css.add(item, "MatcPlayerEvent");
						css.add(item, e.type);
						var txt = this.getMinute(e.time -this.min);
						if(type == "WidgetClick" || type == "WidgetChange" || type=="ValidationError" || type=="ValidationErrorLine"){
							if(e.state && (type == "WidgetClick" || type == "WidgetChange" )){
								txt += " - " +  this.getEventStateLabel(e.state);
							} else {
								txt += " - " + this.getEventLabel(e.type);
							}
							let widget = this.model.widgets[e.widget] ||
							this.model.widgets[this.analytics.toModelWidgetID(e.widget)];
							if(widget){
								txt +=" -  &quot;" + widget.name+"&quot;";
							} else {
								txt +=" -  &quot;" + e.widget +"&quot;";
							}
						} else if(type =="ScreenGesture" && e.gesture){
							let gesture = e.gesture;
							let screen = this.model.screens[e.screen];
							if(screen){
								txt += " - Screen " + this.getGestureLabel(gesture.type) + " -  &quot;" + screen.name +"&quot;";
							} else {
								txt += " - Screen " + this.getGestureLabel(gesture.type) + " - &quot;" + e.screen +"&quot;";
							}
					    } else if(type =="WidgetGesture" && e.gesture){
							let gesture = e.gesture;
							let screen = this.model.screens[e.screen];
							if(screen){
								txt += " - " + this.getGestureLabel(gesture.type) + " -  &quot;" + screen.name +"&quot;";
							} else {
								txt += " - " + this.getGestureLabel(gesture.type) + " - &quot;" + e.screen +"&quot;";
							}
							let widget = this.model.widgets[e.widget] ||
							this.model.widgets[this.analytics.toModelWidgetID(e.widget)];
							if(widget){
								txt +=" -  &quot;" + widget.name+"&quot;";
							} else {
								txt +=" -  &quot;" + e.widget +"&quot;";
							}
					    } else {
							var screen = this.model.screens[e.screen];
							if(screen){
								txt += " - " + this.getEventLabel(e.type) + " -  &quot;" + screen.name +"&quot;";
							} else {
								txt += " - " + this.getEventLabel(e.type) + " - &quot;" + e.screen +"&quot;";
							}

						}

						item.innerHTML= this.stripHTML(txt);
						parent.appendChild(item);
						this.tempOwn(on(item, touch.press, lang.hitch(this, "onEvent", e)));
					}
				} else {
					let item = document.createElement("div");
					css.add(item, "MatcPlayerEvent MatcPlayerTagEvent");
					let txt = this.getMinute(e.time -this.min) + " - Tag &quot;" + this.stripHTML( e.tag) + "&quot;";
					item.innerHTML=  txt;
					parent.appendChild(item);
					this.tempOwn(on(item, touch.press, lang.hitch(this, "onEvent", e)));

					let del = document.createElement("span");
					css.add(del, "mdi mdi-close-circle MatcPlayerEventRemove");
					item.appendChild(del);
					this.tempOwn(on(del, touch.press, lang.hitch(this, "removeTag", e)));
				}

			}
			this.eventCntr.appendChild(parent)
		},

		layout(previewWrapper){
			const container = this.$refs.container

			const cPos = domGeom.position(container);
			const pos = this.getScaledSize(cPos, "auto", this.model);

			previewWrapper.style.width = Math.round(pos.w) + "px";
			previewWrapper.style.height = pos.h + "px";
			container.style.height = pos.h + "px";
			container.appendChild(previewWrapper);

			const domPos = domGeom.position(this.domNode);
			this.eventCntr.style.height= Math.floor(domPos.h) + "px";

		

			if (this.dialog) {
				this.logger.log(-1,'layout', 'dialog >> ' +  domPos.h + ' x ' +  domPos.w)
				domPos.w += 0
				domPos.h += 0
				setTimeout(() => {
					this.dialog.resize(domPos)
				}, 30)
			}		
		},

		onEvent(e){
			if (this.preparing) return;
			this.currentTime = e.time - this.min;
			this.lastEventPos = 0;
			this.preview.resetAnimations();
			this.setTime(this.currentTime, true);
		},



		onSliderChange(v){
			if (this.preparing) return;
			this.currentTime = v;
			this.lastEventPos = 0;
			this.preview.resetAnimations();
			this.setTime(v, true);
		},

		/**
		 * Render of time t (which is relative to the end. Dunno why I did that...)
		 */
		setTime(t, forceMarker){

			/**
			 * The widget might already be destroyed....
			 */
			if(!this.time){
				return;
			}

			/**
			 * Show the time
			 */
			this.time.innerHTML = this.getMinute(t) + " / " + this.getMinute(this.duration)  + "";
			this.slider.setValue(t);


			/**
			 * Now get the event
			 */
			var event = this.getEvent(Math.floor(t));
			if (!event) return;

			/**
			 * Same-millisecond batches collapse: a ScreenLoaded(N) followed
			 * by the old overlay's OverlayRemoved is shadowed by getEvent(),
			 * which keeps only the last event at a given time. Detect the transition
			 * in the same batch and let it win, otherwise the new screen never
			 * renders until a later event re-renders it ("only appears on user
			 * interaction").
			 */
			if (event && event.type == "OverlayRemoved") {
				for (var si = Math.max(0, this.lastEventPos - 1); si >= 0; si--) {
					var pe = this.events[si];
					if (pe.time < event.time - 100) {
						break;
					}
					if (pe.type == "ScreenLoaded" || pe.type == "ScreenAnimation") {
						event = pe;
						break;
					}
				}
			}


			try {
				var replayState = this._replayState.get(event._replayIndex);
				/**
				 * Set screen or animate transition
				 */
				if(event.screen){

					if("ScreenAnimation" == event.type){
						this.preview.animateScreen(event, t, this.min);
					} else if(event.type == "OverlayRemoved" || event.type == "OverlayLoaded"){
						/**
						 * The screen field of these events is the screen the overlay
						 * belongs to, never a new transition target. For OverlayRemoved
						 * following a transition it is the stale pre-transition screen, so
						 * re-rendering it would revert the just-shown new screen. The
						 * transition is driven by the ScreenLoaded/ScreenAnimation
						 * event — skip these.
						 */
					} else {
						this.preview.setScreen(event.screen, event.scrollTop);
					}
				}

				/**
				 * Set overlays.
				 *
				 * 1) We render all overlays.
				 * 2) Then we run an animation if required
				 *
				 * A screen transition inherently clears all overlays
				 * (Preview.animateScreen() calls removeAllOverlays()). Applying
				 * the pre-transition overlay state here would re-stack the old
				 * overlay on top of the new screen, hiding it until another
				 * event re-renders the screen. Skip it for transitions; the
				 * correct overlay state resumes with the next non-transition event.

				 */
				var overlays = replayState.overlays;
				if(overlays && event.type != "ScreenAnimation"){
					this.preview.setOverlays(overlays);
				}
				if(event.type == "OverlayShowAnimation" || event.type == "OverlayRemoveAnimation"){

					this.preview.animateOverlay(event, t, this.min);

				} else if(event.type != "ScreenAnimation" && this.lastEvent && this.lastEvent.type == "OverlayShowAnimation"){

					/**
					 * Because of skipping or so, the animation might not have reached 100%,
					 * so we force fore the animation one mo time,
					 */
					this.preview.animateOverlay(this.lastEvent, t, this.min);
				}


				/**
				 * Show a click marker. We only show the marker if the delta is small
				 * and there and x and y values
				 */
				var tDelta = 0;
				if(forceMarker){
					tDelta = Math.abs((event.time -this.min) - t);
				}
				if(event.x> 0 && event.y >0 && tDelta < 100){
					this.preview.setMarker(event, forceMarker );
				}

				/**
				 * Apply visual effects produced by scripts before restoring the
				 * ordinary widget states for this event.
				 */
				this.preview.setScriptEffectState(replayState.effects)

				/**
				 * now update widget states
				 */
				var states = replayState.widgetStates;
				var valueStates = replayState.valueStates;
				for(var widgetID in states){
					var state = states[widgetID];

					/**
					 * A popup life cycle state (open, close, hover, validation)
					 * does not carry the widget's value. Re-apply the retained
					 * value state first, so a script prefill is not lost while
					 * the state timeline has moved on to life cycle states.
					 */
					if (valueStates && isLifecycleState(state) && valueStates[widgetID]) {
						this.preview.setWidgetState(widgetID, valueStates[widgetID], forceMarker, t +this.min);
					}

					this.preview.setWidgetState(widgetID, state, forceMarker, t +this.min);
				}

				/**
				 * Apply script data bindings after the ordinary widget states,
				 * so recorded data values win over static label defaults.
				 */
				this.preview.setScriptDataBindingState(replayState.data, replayState.touched)

				/**
				 * Set scroll
				 */
				this.setScroll(event, t, replayState.scroll);

				this.setMouseCursor(event, t);


				/**
				 * fire widget animations
				 */

				this.preview.setWidgetAnimationStates(this._animationIndex.get(t));

			} catch (err) {
				console.warn("VideoPlayer.setTime() > Error", err)
			}
			

			this.lastEventID = event.id;

			this.lastEvent = event;
		},


		setMouseCursor(event, t){
			const samples = this._mouseStates;
			let low = 0;
			let high = samples.length;
			while (low < high) {
				const mid = Math.floor((low + high) / 2);
				if (samples[mid].time <= t + this.min) low = mid + 1;
				else high = mid;
			}
			const sample = low ? samples[low - 1] : null;
			if (!sample) {
				this.preview.hideMouse();
				this._lastMouseSample = null;
				return;
			}
			if (sample !== this._lastMouseSample || event.screen !== this._lastMouseScreen) {
				this.preview.setMouse(sample);
				this._lastMouseSample = sample;
				this._lastMouseScreen = event.screen;
			}
		},

		setScroll(event, t, scrollState){

			if(scrollState){
				if(scrollState.children){
					if(!scrollState._scrollts){
						scrollState._scrollts = this.createTimeSeries(scrollState.children)
					}
					t = t + this.min;
					var scrollEvent = scrollState._scrollts.get(t); //this._getLastValueForTime(scrollState.children, t);
					if(scrollEvent){
						this.preview.setScroll(scrollEvent.value);
					} else {
						console.debug("setScroll()> No scrollEvent for event ", t);
					}
				} else {
					this.preview.setScroll(scrollState.value);
				}
			} else {
				console.warn("setScroll() > No scrollState for ", event.id);
			}


		},

		_getLastValueForTime(values, t){
			var result = null;
			if(values){
				/**
				 * we now the list is ordered. So we could use binay search, and save also the last position...
				 */
				for(var i=0; i< values.length; i++){
					var value = values[i];
					if(value.time <= t) {
						result = value;
					} else {
						return result;
					}
				}
			} else {
				console.warn("_getLastValueForTime() > No values passed");
			}
			return result;
		},


		/** Return the last event at or before the timestamp, including ties. */
		getEvent(t){
			let low = 0;
			let high = this.events.length;
			while (low < high) {
				const mid = Math.floor((low + high) / 2);
				if (this.events[mid].time - this.min <= t) low = mid + 1;
				else high = mid;
			}
			this.lastEventPos = Math.max(0, low - 1);
			return low ? this.events[low - 1] : null;
		},


		getMinute(t){
			var s = Math.round(t/1000);
			var min = Math.floor(s / 60);
			var sec = s % 60;
			if(sec < 10){
				sec = "0"+sec;
			}
			return min+":"+sec;
		}
    },
    mounted () {
    }
}
</script>
