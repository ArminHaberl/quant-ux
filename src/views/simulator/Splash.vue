
<template>
  
            <div :class="['MatcTestSplash MatcTestSplashMax MactMainGradient', {'MatcTestCustomSplash': hasSplash}]" data-dojo-attach-point="overlay" :style="splashBackground" v-if="hasSettings">
                <div v-if="hasSplash  && step < 5" class="MatcTestCustomSplashPowered">Powered by Quant-UX</div> 
                    <div :class="['MatcTestLogoCntr', {'MatcTestLogoCntrWide': step == 1}, {'MatcTestLogoCntrMax': step > 1}]" >
        

                    <div :class="['MatcTestProgressCntr']">
                        <div class="MatcTestProgressBar" >
                        </div>
                        <transition name="fade">
                         
                            <div v-if="step > 2" class="MatcTestPanel">
                                <div class="MatcTestHeader">
                                    <img src="../../style/img/QUXLogoBlack.svg" class="MatcStudioLogo" ref="logo"> 
                                    <span class="">Quant-UX</span>     
                                </div>

                                <div class="MatcTestContent" v-if="step === 6">
                                    <div class="MatcTestContentCntr">
                                        <h2>{{getNLS("simulator.password.title")}} </h2>
                                        <p v-html="getNLS('simulator.password.msg')"></p>
                                        <input v-model="password" class="form-control" @keypress.enter="setPassword"/>
                                        <div class="MatcButton MatcMarginTop" @click="setPassword()">
                                            {{getNLS("simulator.password.next")}}
                                        </div>
                                        <span class="MatcError" style="margin-left:20px">
                                            {{passwordError}}
                                        </span>
                                    </div>
                                </div>

                                <div class="MatcTestContent" v-if="step === 3">
                                    <div class="MatcTestContentCntr">
                                        <h2> {{getNLS("simulator.welcome.title")}}</h2>
                                        <div v-if="settings && settings.description" v-html="sanitizeText(settings.description)"></div>
                                        <template  v-else>
                                            <p v-html="getNlSWithReplacement('simulator.welcome.msg', {'name': model.name})"></p>
                                            <p v-html="getNlSWithReplacement('simulator.welcome.msg2', {'name': model.name})"></p>
                                        </template>
                                  
                                    </div>
                                    <div class="MatcMarginTop">
                                        <div class="MatcButton MatcButtonPrimary MatcTestStartButton" :class="{'MatcTestStartButtonDisabled': recaptchaPending}"	@click="onShowPrivacy()"	v-if="getUserTasks().length === 0">
                                                {{recaptchaPending ? getNLS("simulator.recaptcha.pending") : getNLS("simulator.welcome.next")}}
                                        </div>
                                        <div class="MatcButton MatcButtonPrimary MatcTestStartButton" :class="{'MatcTestStartButtonDisabled': recaptchaPending}"	@click="onShowTasks()" v-else>
                                                {{recaptchaPending ? getNLS("simulator.recaptcha.pending") : getNLS("simulator.welcome.showTasks")}}
                                        </div>
                                    </div>
                                    <span v-if="recaptchaError" class="MatcError" style="margin-left:20px">{{recaptchaError}}</span>
                                </div>
                                <div class="MatcTestContent" v-if="step === 4">
                                    <div class="MatcTestContentCntr">
                                        <!-- <h2>{{getNLS("simulator.tasks.title")}}</h2>
                                        <p >
                                            {{getNLS("simulator.tasks.msg")}}
                                        </p> -->
                                        <div class="MatcTestTaskList">
                                            <div v-for="t in getUserTasks()" :key="t.id" class="MatcTestTask">
                                                <h4>{{t.name}}</h4>
                                                <div class="MatcTestTaskDescription">
                                                    {{t.description}}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
    
                                    <div class="MatcMarginTop">
                                        <div class="MatcButton MatcButtonPrimary MatcTestStartButton" @click="onShowPrivacy()">
                                            {{getNLS("simulator.welcome.next")}}
                                        </div>
                                    </div>
                                </div>
                                <div class="MatcTestContent" v-if="step === 5">
                                    <div class="MatcTestContentCntr">
                                        <h2> {{getNLS("simulator.welcome.privacy-title")}}</h2>
                                        <template v-if="settings && settings.privacyMessage">
                                            <div v-html="sanitizeText(settings.privacyMessage)"></div>
                                        </template>
                                        <template v-else>
                                            <p v-html="getNLS('simulator.welcome.privacy')"></p>
                                            <p v-html="getNLS('simulator.welcome.privacy1')"></p>
                                        </template>
                                        <p v-if="!settings || !settings.privacyMessage" class="MatcMarginTopXL" v-html="getNLS('simulator.welcome.click-start')"></p>
                                    </div>
                                    <div class="MatcMarginTop">
                                        <div class="MatcButton MatcButtonPrimary MatcTestStartButton"	@click="onStart()">
                                                {{getNLS("simulator.welcome.start")}}
                                        </div>
                                    </div>
                                </div>
                            </div>
                     
                        </transition>
                    </div>
                    <transition name="logoFade" v-if="step == 0">
                        <div class="MatcLogoNew MatcSimulatorLoadingLogoAnimation"></div>
                    </transition>
                </div>
                <div class="MatcTestVersion">Quant-UX - v5.0.5  </div>
            </div>
    </template>
    <style>
    </style>
    <style lang="scss">
      @import "../../style/test.scss";
    </style>
    <style lang="sass">
    </style>
    
    <script>
    import lang from 'dojo/_base/lang'
    import Logger from 'common/Logger'
    import NLS from 'common/NLS'
    import Services from 'services/Services'
    import sanitizeHtml from 'sanitize-html';

    export default {
        name: 'Splah',
        props: ['settings', 'model', 'hash'],
        mixins:[NLS],
        data: function () {
            return {
                splashImage: null,
                step: 0,
                recaptchaError: '',
                recaptchaPending: false,
                recaptchaPassed: false
            }
        },
        components: {},
        computed: {
            hasWindows () {
                return navigator.platform.indexOf('Win') > -1
            },
            hasSplash () {
                return this.splashImage !== null
            },
            useRecaptcha () {
                return this.settings && this.settings.useRecaptcha === true
            },
            recaptchaConfig () {
                const config = Services.getConfig()
                return config && config.recaptcha ? config.recaptcha : null
            },
            showTasks () {
                if (this.settings && this.settings.showTaskInTest) {
                    return true
                }
                return false
            },
            hasSettings () {
                return this.settings !== null
            },
            menuWidth () {
                if (this.settings && this.settings.showTaskInTest) {
                    return 256
                }
                return 0
            },
            splashBackground () {
                if (this.splashImage) {
                      return `background-image: url(/rest/images/${this.hash}/${this.splashImage.url});`
                }
                return ''
            }
        },
        methods: {

            sanitizeText (text) {
                return sanitizeHtml(text);
            },
            onStart (e) {
                this.$emit("start", e)
            },

            passBotCheck (onPass) {
                if (this.recaptchaPending) {
                    return
                }
                if (this.recaptchaPassed || !this.useRecaptcha) {
                    onPass()
                    return
                }
                this.recaptchaPending = true
                this.verifyRecaptcha().then(ok => {
                    this.recaptchaPending = false
                    if (ok) {
                        this.recaptchaPassed = true
                        onPass()
                    }
                }).catch(() => {
                    this.recaptchaPending = false
                })
            },

            loadRecaptchaScript () {
                const config = this.recaptchaConfig
                const siteKey = config && config.siteKey
                if (window.grecaptcha && window.__quxRecaptchaKey === siteKey) {
                    return Promise.resolve()
                }
                if (!siteKey) {
                    return Promise.resolve()
                }
                if (!this._recaptchaPromise) {
                    this._recaptchaPromise = new Promise(resolve => {
                        const script = document.createElement('script')
                        script.src = 'https://www.google.com/recaptcha/api.js?render=' + siteKey
                        script.async = true
                        script.defer = true
                        script.onload = () => {
                            window.__quxRecaptchaKey = siteKey
                            resolve()
                        }
                        script.onerror = () => resolve()
                        document.head.appendChild(script)
                    })
                }
                return this._recaptchaPromise
            },

            verifyRecaptcha () {
                this.recaptchaError = ''
                const config = this.recaptchaConfig
                if (!config || !config.siteKey) {
                    this.recaptchaError = this.getNLS('simulator.recaptcha.errorNotConfigured')
                    return Promise.resolve(false)
                }
                return this.loadRecaptchaScript().then(() => {
                    return new Promise(resolve => {
                        if (!window.grecaptcha) {
                            this.recaptchaError = this.getNLS('simulator.recaptcha.errorNotConfigured')
                            resolve(false)
                            return
                        }
                        window.grecaptcha.ready(() => {
                            window.grecaptcha.execute(config.siteKey, { action: 'usertest' }).then(token => {
                                const base = (process.env.BASE_URL || '/').replace(/\/+$/, '')
                                fetch(base + '/captcha/verify', {
                                    method: 'POST',
                                    credentials: "same-origin",
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ token: token })
                                }).then(res => res.json().then(data => ({ status: res.status, data: data }))).then(result => {
                                    if (result.data && result.data.success) {
                                        resolve(true)
                                    } else {
                                        this.recaptchaError = this.getNLS(result.status === 503
                                            ? 'simulator.recaptcha.errorNotConfigured'
                                            : 'simulator.recaptcha.error')
                                        resolve(false)
                                    }
                                }).catch(() => {
                                    this.recaptchaError = this.getNLS('simulator.recaptcha.error')
                                    resolve(false)
                                })
                            }).catch(() => {
                                this.recaptchaError = this.getNLS('simulator.recaptcha.error')
                                resolve(false)
                            })
                        })
                    })
                })
            },

            onShowPrivacy () {
                this.passBotCheck(() => {
                    this.step = 5
                })
            },

            onShowTasks (){
                this.passBotCheck(() => {
                    this.step = 4
                })
            },
     
            setTestsettings (settings){
                this.logger.log(1,"setTestsettings","enter > ", settings);
                this.settings = settings;
                this.setCustomSplash(settings)
                setTimeout(() => this.hideLogo(), 500);
            },
            
            setCustomSplash (settings) {
                this.logger.log(1,"setCustomSplash","enter > ", settings);
                if (settings.splash) {
                    this.splashImage = settings.splash
                }
            },
    
            hideLogo () {
                this.logger.log(1,"hideLogo","enter" );
                this.step = 1
                setTimeout(lang.hitch(this,"expandWindow"),500);
            },
    
            expandWindow () {
                this.logger.log(1,"expandWindow","enter" );
                this.step = 2
                setTimeout(lang.hitch(this,"renderSettings"),1000);
            },
    
            renderSettings(){
                this.logger.log(2,"renderSettings","enter" );
                this.step = 3
            },
    
     
            getUserTasks (){
                const tasks = [];
                if (this.settings.tasks && this.settings.tasks){
                    for(let i=0; i< this.settings.tasks.length; i++){
                        const task = this.settings.tasks[i];
                        if (task.description && task.description != "Enter a description here"){
                            tasks.push(task);
                        }
                    }
                }
                return tasks;
            },
    
            getPricacy () {
                return this.getNLS("test.welcome.privacy");
            }   
      
        },
        watch: {
            model (m) {
                this.model = m
            },
            settings (s) {
                this.setTestsettings(s)
            },
            step (s) {
                if (s === 3 && this.useRecaptcha) {
                    this.loadRecaptchaScript()
                }
            }
        },
        mounted () {
            this.logger = new Logger('Splash');
        }
    }
    </script>
    