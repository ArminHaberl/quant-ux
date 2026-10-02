<template>
  <div>
  </div>
</template>
<script>
import RestEngine from 'core/RestEngine'

export default {
	name: 'RestMixin',
  methods: {

    async initLoadRest() {
      this.logger.log(2,"initLoadRest","enter");

      if (this.doNotExecuteScripts) {
          this.logger.log(2,"initLoadRest","exit > Do not run" );
          return
      }
      const widgets = this.getLoadRests()
      for (let i=0; i< widgets.length; i++) {
          const widget = widgets[i]
          /**
           * Awaited: callers await initLoadRest() before rendering the first
           * screen. Firing and forgetting meant rendering continued with empty
           * dataBindingValues and no WidgetInit for the bound widgets.
           */
          await this.executeRest(widget)
      }
      this.logger.log(2,"initLoadRest","exit", this.dataBindingValues );
    },

    getLoadRests () {
        return Object
            .values(this.model.widgets)
            .filter(w => w.type === 'Rest' && w.props.trigger === 'load')
    },

    async initRepeatRest() {
      this.logger.log(2,"initRepeatRest","enter");

      if (this.doNotExecuteScripts) {
          this.logger.log(2,"initRepeatRest","exit > Do not run" );
          return
      }
      this._repeatRestIntervals = []
      const widgets = this.getRepeatRests()
      for (let i=0; i< widgets.length; i++) {
          const widget = widgets[i]
          const id = setInterval(() => {
            this.executeRest(widget)
          }, widget.props.delay * 1000)
          this._repeatRestIntervals.push(id)
      }
      this.logger.log(2,"initRepeatRest","exit", this.dataBindingValues );

    },


    getRepeatRests () {
        return Object
            .values(this.model.widgets)
            .filter(w => w.type === 'Rest' && w.props.trigger === 'repeat')
    },


    cleanUpRepeatRests () {
        this.logger.log(2,"cleanUpRepeatRests","enter" );
        if (this._repeatRestIntervals) {
            this._repeatRestIntervals.forEach(id => {
                clearInterval(id)
            })
        }
      
    },


    async executeRest (widget) {
      this.logger.log(1,"executeRest","enter >  rest:" + widget.id);

      const rest = widget.props.rest
      
      /**
       * get al the data we need!
       */
      const requiredDataBindings = RestEngine.getNeededDataBings(rest)
      let data = {}
      requiredDataBindings.forEach(path => {
        const value = this.getDataBindingByPath(path)
        data[path] = value
      })

      try {
        const result = await RestEngine.run(rest, data)
        const databinding = rest.output && rest.output.databinding
        if (databinding) {
          this.setDataBindingByKey(databinding, result)
          // since 4.0.70 we also can the data binding...
          this.updateAllDataBindings(this.currentScreen.id, databinding, result)
          this.logger.log(-1, "executeRest","set data " + databinding, this.dataBindingValues);
        }
        return true
      } catch (e) {
        /**
         * Guarded the same way as the try branch: dereferencing rest.output
         * here threw a second TypeError out of the catch, which rejected
         * executeRest and took down the caller's await as well.
         */
        const databinding = rest.output && rest.output.databinding
        if (databinding) {
          this.setDataBindingByKey(databinding, "ERROR")
        }
        this.logger.error("executeRest","error", e);
        this.emit('onRestError', e, rest, data)
      }
      return false
    }
  }
}
</script>