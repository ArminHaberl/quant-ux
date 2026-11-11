
<template>
  <div class="MatcSurveySection">
      <div class="level">
      <div class="level-left">
        <h3 class="title level-item">
          <span data-nls="testSettingsTasks">{{$t('survey.header')}}</span>
          <HelpButton
            topic="survey.intro"
            :hasNotifications="false"
          />

       
        </h3>
      </div>
      <div class="level-right">
       
      
        <DropDownSelect
          class="MatcButtonSecondary"
          v-if="isLoaded && table.rows.length > 0 && table.cols.length > 0"
          ref="dropDown"
          :options="tableOptions" :l="$t('survey.options')" 
          @select="onChangeView" 
          @fullscreen="onFullScreen($event)"
          @download="downloadCVS"></DropDownSelect>

      </div>
    </div>

     <div>

      <SurveyTable 
          v-if="table && table.rows.length > 0 && table.cols.length > 0" 
          :app="app"
          :pub="pub"
          :events="events"
          :table="table"
          :viewOptions="viewOptions"
          :annotation="annotation"
          :test="test"/>

       <span class="MatcHint" v-else>
         {{$t('scatter.no-data')}}
       </span>
    </div>
    <SurveyDialog ref="dialog">

    </SurveyDialog>
	</div>
</template>
<style lang="scss">
    @import '../../../style/components/survey_section.scss';
</style>
<script>
import Logger from 'common/Logger'
import DropDownSelect from 'page/DropDownSelect'
import HelpButton from "help/HelpButton";
import Analytics from "dash/Analytics";
import SurveyTable from './SurveyTable'
import SurveyDialog from './SurveyDialog'

import { escapeCsv } from '../../../utils/csv';
import { deepFreeze } from 'common/Freeze';

export default {
    name: 'SurveySection',
    mixins:[],
    props: ['test', 'app', 'events', 'annotation', 'pub', 'annotationVersion'],
    data: function () {
        return {
          isLoaded: false,
          table: {rows: {}, cols:{}},
          viewOptions:{
            showTasksSucess: false,
            showTaskDetails: false,
            showVideo: false,
            showId: true
          }
        }
    },
    components: {
      'HelpButton': HelpButton,
      'DropDownSelect': DropDownSelect,
      'SurveyTable': SurveyTable,
      'SurveyDialog': SurveyDialog
    },
    computed: {
      tableOptions () {
      
        const cols = this.table.cols.filter(c => c.type=== 'data').map(c => {
            return {value: 'toggleColumn', label: c.label, check:true, selected: !c.hidden, callback: (selected) => this.toggleColumn(c, selected)}
        })        
        
        return cols.concat([
            {css:"MatcDropDownButtonLine"},
            {value: 'showTasksSucess', label: this.$t('survey.taskSuccess'), check:true, selected: this.viewOptions.showTasksSucess},
            {value: 'showVideo', label: this.$t('survey.showVideo'), check:true, selected: this.viewOptions.showVideo},
            //{value: 'showId', label:this.$t('survey.ids'), check:true},
            //{css:"MatcDropDownButtonLine"},
            //{value: 'fullscreen', label: this.$t('survey.fullscreen'), event:'fullscreen', icon:' mdi mdi-chart-bar'},
            {css:"MatcDropDownButtonLine"},
            {value: 'download', label: this.$t('survey.download'), event:'download', icon:'mdi mdi-download-outline'}
          ])
      },
      hasID () {
        return this.viewOptions.showId
      },
      hasTasks () {
        return this.viewOptions.showTasksSucess || this.viewOptions.showTaskDetails
      },
     
     
      downloadFileName () {
        if (this.app) {
          return this.app.name + '_survey.csv'
        }
        return 'Quant-UX_Survey.csv'
      }
    },
    methods: {
      getTable () {
        const analytics = new Analytics();
        /**
         * getSurveyAnswers() sorts a copy of the array and works on event
         * copies. It used to require a full JSON clone of the event log
         * (which becomes seconds of blocking work for large experiments);
         * a shallow slice is enough now.
         */
        const events = analytics.filterEvents(this.events.slice(), this.annotation)
        return analytics.getSurveyAnswers(events, 
          this.app, 
          this.test, 
          this.viewOptions
        )
      },
      onFullScreen () {
        if (this.$refs.dialog && this.$refs.dropDown) {
          this.$refs.dialog.show(this.$refs.dropDown.$el)
        }
      },
      refreshTable () {
        const table = this.getTable()
        /**
         * The rows are a read-only result: they are only rendered,
         * averaged and exported, and the table is rebuilt from scratch on
         * every change. Freezing the parallel arrays and their row objects
         * keeps the biggest per-tab derived structure (one row per
         * session) out of Vue's observer. The column objects stay mutable
         * on purpose: toggleColumn() writes col.hidden in place to show
         * and hide columns reactively.
         */
        deepFreeze(table.rows)
        deepFreeze(table.ids)
        deepFreeze(table.labels)
        deepFreeze(table.tasks)
        this.table = table
        this.isLoaded = true
      },
      toggleColumn (col, selected) {
          col.hidden = !selected
      },
      onChangeView (selection) {
        for (let key in selection) {
          this.$set(this.viewOptions, key, selection[key])
        }
      },
       downloadCVS () {

          const table = this.table
          /**
           * The rows go into the Blob as string parts: for experiments
           * with many sessions, building one joined string roughly
           * doubles the export's memory. The frozen table is only read.
           */
          const parts = ['#,' + table.cols.map(c => escapeCsv(c.label)).join(',') + "\n"];
          table.rows.forEach((row, r) => {
            parts.push(escapeCsv(r) + ',' + table.cols.map(c => escapeCsv(row[c.key])).join(',') + "\n")
          })

          const blob = new Blob(parts, {
            type: "text/csv;charset=utf-8;"
          });
          if (window.navigator.msSaveOrOpenBlob) {
            window.navigator.msSaveBlob(blob, this.downloadFileName)
          } else {
            const elem = window.document.createElement("a");
            elem.href = window.URL.createObjectURL(blob)
            elem.download = this.downloadFileName
            document.body.appendChild(elem)
            elem.click()
            document.body.removeChild(elem)
          }
        },
    },
    watch: {
      /**
       * The table used to be computed once at mount and never again:
       * event refetches, test edits and annotation changes (valid /
       * invalid) left it stale, and since the tab is keep-alive cached
       * there is no remount that would rebuild it either.
       */
      events () {
        this.refreshTable()
      },
      test () {
        this.refreshTable()
      },
      annotationVersion () {
        /**
         * Annotations are mutated in place, so the version is the
         * reactive trigger; the computation below reads the current
         * annotation array.
         */
        this.refreshTable()
      },
      viewOptions () {
        /**
         * The task columns (success, duration, interactions) are only
         * computed when their columns are shown.
         */
        this.refreshTable()
      }
    },
    mounted () {
      this.logger = new Logger('SurveySection')
      this.refreshTable()
    },
    /**
     * The keep-alive calls these hooks on the whole child tree, so the
     * survey table is released whenever the Results tab deactivates and
     * rebuilt on the next activation. The template reads table.rows, so
     * the release must not re-render the deactivated component - Vue
     * skips the render watcher while it is inactive, and activated()
     * refills the table before the next render runs.
     */
    deactivated () {
      this.table = null
    },
    activated () {
      if (!this.table) {
        this.refreshTable()
      }
    }
}
</script>