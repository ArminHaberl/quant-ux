<template>
	<div>
	</div>
  </template>
  <script>

  export default {
	  name: 'AudioMixin',
	  methods: {
  
        executeAudio(widgetID, originalLine, navigation) {
            this.logger.log(-2,"executeAudio","enter >  widgetID:" + widgetID);
            const widget = this.model.widgets[widgetID]
            if (widget && widget.props?.file?.url) {
                const f = widget.props?.file
                const url = this.getAudioURL(f)           
                const audioElement = new Audio(url)
                audioElement.addEventListener("canplaythrough", () => {
                    /* the audio is now playable; play it if permissions allow */
                    audioElement.play();
                });
                audioElement.addEventListener("canplaythrough", () => {
                    /* the audio is now playable; play it if permissions allow */
                    audioElement.play();
                })
                audioElement.addEventListener("ended", () => {
                    this.logger.log(-2,"executeAudio","done");

                    const lines = this.getLinesForWidget(widget);
                    if (lines && lines.length === 1) {        
                        const screenID = this.currentScreen ? this.currentScreen.id : navigation && navigation.sourceScreenID
                        if (navigation && navigation.beforeLoad) {
                            this.executeLine(screenID, widgetID, lines[0], navigation)
                        } else if (this.currentScreen) {
                            this.renderTransition(lines[0], screenID);
                        }
                    }
                })
            

            } else {
                this.logger.log(-2,"executeAudio","enter > No audio for widgetID:" + widgetID);
            }
        },

        getAudioURL (file) {
            if (this.hash) {
                return "/rest/uploads/" + this.hash + "/" + file.url;
            } else if (this.jwtToken) {
                return "/rest/uploads/" + file.url + "?token=" + this.jwtToken;
            }
        }
      }
  }
  </script>
