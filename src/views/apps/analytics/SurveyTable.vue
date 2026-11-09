<template>

  <div>
  <div class="MatcCreateSearch MatcFlexColumns" v-if="hasSearch">
    <input type="search" class="MatcIgnoreOnKeyPress form-control" placeholder="Search"
      :value="searchQuery" @input="onSearch($event.target.value)"/>
  </div>

  <div class="MatcSurveySectionTableCntr" ref="tableCntr"
    v-if="sortedTable.rows.length > 0 && sortedTable.cols.length > 0">
    <table class="table">
    <thead>
      <tr v-if="showGroups">
        <th class="MatcSurveySectionTableNumber MatcSurveySectionTableBorderRight">
        </th>
        <th v-for="group in groups" :key="group.label" :colspan="group.count" class="MatcSurveySectionTableGroupLabel">
          <span class="MatcSurveySectionTableColLabel" v-if="group.count > 1">
            {{ group.label }}
          </span>

        </th>
        <th v-if="hasTasks" class="MatcSurveySectionTableBorderLeft"></th>
        <th class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableAction" v-if="hasVideo">X</th>
      </tr>

      <tr>
        <th class="MatcSurveySectionTableBorderRight MatcSurveySectionTableBorderBottom">
          <span class="MatcSurveySectionTableLabel">Test</span>
        </th>
        <th v-if="hasID"
          class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableBorderRight MatcSurveySectionTableBorderBottom">
          {{ $t('survey.id') }}
        </th>
        <template v-for="(col) in sortedTable.cols">
          <th v-if="col.hidden !== true" :key="col.key" class="MatcSurveySectionTableBorderBottom">
            <span class="MatcSurveySectionTableColLabel">
              {{ col.label }}
            </span>

          </th>
        </template>
        <th v-if="hasTasks" class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableBorderBottom">
          {{ $t('survey.tasks') }}
        </th>
        <th class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableAction MatcSurveySectionTableBorderBottom"
          v-if="hasVideo">
          {{ $t('survey.video') }}
        </th>
      </tr>
    </thead>

    <tbody>
      <tr v-for="r in visibleIndexes" :key="sortedTable.ids[r] || r">
        <td class="MatcSurveySectionTableBorderRight">
          <span class="MatcSurveySectionTableLabel">{{ sortedTable.labels[r] }}</span>
        </td>
        <td v-if="hasID" class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableBorderRight">
          <a :href="getVideoURL(sortedTable.ids[r])" target="_QUXvideo">
            {{ sortedTable.ids[r] }}
            <span class="mdi mdi-play-circle-outline"></span>
          </a>

        </td>
        <template v-for="col in sortedTable.cols">
          <td :key="col.key" v-if="col.hidden !== true">
            {{ sortedTable.rows[r][col.key] }}
          </td>
        </template>

        <td v-if="hasTasks" class="MatcSurveySectionTableBorderLeft  ">
          <div class="MatcTagCntr">
            <span v-for="task in sortedTable.tasks[r]" :key="task.task" class="tag">
              {{ task.taskName }}
              <span v-if="viewOptions.showTaskDetails">
                ({{ Math.round(task.duration / 1000) }}s | #{{ task.interactions }})
              </span>
            </span>
          </div>
        </td>

        <td class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableAction" v-if="hasVideo">
          <a :href="getVideoURL(sortedTable.ids[r])" class="MatcButton MatcButtonSecondary MatcButtonXS"
            target="_QUXvideo">
            <QIcon icon="Play" />
          </a>
        </td>
      </tr>
      <tr class="MatcSurveySectionTableSummary">
        <td class="MatcSurveySectionTableNumber MatcSurveySectionTableBorderRight">
          <QIcon icon="AVG" />
        </td>
        <td v-if="hasID" class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableBorderRight">
        </td>
        <td v-for="(value, i) in summary" :key="i">
          {{ value }}
        </td>
        <td v-if="hasTasks" class="MatcSurveySectionTableBorderLeft">
        </td>
        <td class="MatcSurveySectionTableBorderLeft MatcSurveySectionTableAction" v-if="hasVideo">
        </td>
      </tr>
    </tbody>
    </table>
  </div>

  <!--
    The pager mirrors the DOM of common/Table (vommondTable > pagination),
    so the global .vommondTable .pagination styles render it exactly like
    the pager of the Test tab. Every <li> carries an explicit key and the
    arrows are always rendered (empty at the boundary, like Table): an
    unkeyed <li> with a v-if next to a keyed v-for is the one sibling
    pattern Vue 2's patcher handles worst, which is what broke the arrows.
  -->
  <div class="vommondTable" v-if="hasPages">
    <div class="pagination pagination-small">
      <ul>
        <li :key="'pager-prev'" @click="goBackward()">
          <a v-if="pagePointer > 0"><span class="mdi mdi-chevron-left"></span></a>
        </li>
        <li v-for="page in pages" :key="page" :class="{active: page * itemsPerPage === pagePointer}"
          @click="setPage(page * itemsPerPage)">
          {{ page + 1 }}
        </li>
        <li :key="'pager-next'" @click="goForward()">
          <a v-if="pagePointer + itemsPerPage < filteredCount"><span class="mdi mdi-chevron-right"></span></a>
        </li>
      </ul>
    </div>
  </div>

  </div>

</template>
<style lang="scss">
@import '../../../style/components/survey_section.scss';
</style>
<script>
import Logger from 'common/Logger'
// import Analytics from "dash/Analytics";
// import lang from 'dojo/_base/lang'
import QIcon from '../../../page/QIcon'
import { getPageIndexes, getPageWindow, clampPagePointer, matchesSearch } from 'common/TableUtil'


export default {
  name: 'SurveyTable',
  mixins: [],
  props: ['test', 'app', 'events', 'annotation', 'viewOptions', 'pub', 'table'],
  data: function () {
    return {
      showGroups: false,
      /**
       * One <tr> per session used to be rendered for the complete data
       * volume; the rows are now paginated. The AVG summary row below the
       * table and the CSV download still work on all rows.
       */
      itemsPerPage: 25,
      itemPointer: 0,
      searchQuery: ''
    }
  },
  components: {
    QIcon
  },
  computed: {
    sortedTable() {

      return this.table
    },
    /**
     * The indexes of the rows that match the search, or null when no
     * search is active (the full row order is used then). The session id
     * and the label are searched in lockstep with the row cells.
     */
    searchHits () {
      if (!this.searchQuery) {
        return null
      }
      const table = this.sortedTable
      const rows = table.rows || []
      const ids = table.ids || []
      const labels = table.labels || []
      const tasks = table.tasks || []
      const hits = []
      for (let r = 0; r < rows.length; r++) {
        if (matchesSearch(rows[r], this.searchQuery) ||
            matchesSearch(ids[r], this.searchQuery) ||
            matchesSearch(labels[r], this.searchQuery) ||
            matchesSearch(tasks[r], this.searchQuery)) {
          hits.push(r)
        }
      }
      return hits
    },
    filteredCount () {
      if (this.searchHits) {
        return this.searchHits.length
      }
      const rows = this.sortedTable.rows
      return rows ? rows.length : 0
    },
    /**
     * Clamped on read, so a refetch that shrinks the data cannot point
     * the pager beyond the last page.
     */
    pagePointer () {
      return clampPagePointer(this.itemPointer, this.filteredCount, this.itemsPerPage)
    },
    /**
     * The row indexes of the current page, resolved through the search
     * hits, so rows, labels, ids and task tags stay in lockstep.
     */
    visibleIndexes () {
      const hits = this.searchHits
      const source = hits ? hits.length : this.filteredCount
      const offsets = getPageIndexes(source, this.pagePointer, this.itemsPerPage)
      if (!hits) {
        return offsets
      }
      return offsets.map(i => hits[i])
    },
    pages () {
      return getPageWindow(this.pagePointer, this.filteredCount, this.itemsPerPage)
    },
    hasPages () {
      return this.filteredCount > this.itemsPerPage
    },
    /**
     * The search box shows once the table has more than one page, or
     * while a search is active (so it does not vanish with the results).
     */
    hasSearch () {
      return this.filteredCount > this.itemsPerPage || this.searchQuery.length > 0
    },
    hasVideo() {
      return this.viewOptions.showVideo
    },
    hasID() {
      return this.viewOptions.showId
    },
    hasTasks() {
      return this.viewOptions.showTasksSucess || this.viewOptions.showTaskDetails
    },
    groups() {
      const groups = []
      if (this.table && this.table.cols) {
        const cols = this.sortedTable.cols;

        let lastGroup = { label: '' }
        cols.forEach(col => {
          if (col.type === 'data') {
            if (col.group !== lastGroup.label) {
              lastGroup = { label: col.group, count: 0 }
              groups.push(lastGroup)
            }
            lastGroup.count++
          }
        })

      }

      return groups
    },
    summary() {
      const result = []
      const data = this.table
      data.cols.forEach(col => {
        if (col.hidden !== true) {
          let sum = 0
          let count = 0
          data.rows.forEach(row => {
            let value = row[col.key]
            if (value !== '-') {
              /**
               * FIXME: We could check table.types and check for
               * the data types,.g. boolean, categorical etc.
               */
              if (!isNaN(value * 1)) {
                sum += value * 1
                count++
              }

            }
          })
          if (count > 0) {
            result.push(Math.round((sum / count) * 100) / 100)
          } else {
            result.push('-')
          }
        }
      })
      return result
    },
    urlPrefix() {
      if (this.pub) {
        return "examples";
      }
      return "apps";
    },
  },
  methods: {
    getVideoURL(id) {
      return "#/" + this.urlPrefix + "/" + this.app.id + "/replay/" + id + ".html";
    },
    onSearch (value) {
      /**
       * The raw value is stored for the input binding; matchesSearch()
       * normalizes (trim + lowercase) on its own.
       */
      this.searchQuery = value == null ? '' : value
      this.itemPointer = 0
      this.scrollToTop()
    },
    setPage (pointer) {
      this.itemPointer = pointer
      this.scrollToTop()
    },
    goBackward () {
      this.itemPointer = Math.max(this.pagePointer - this.itemsPerPage, 0)
      this.scrollToTop()
    },
    goForward () {
      this.itemPointer = this.pagePointer + this.itemsPerPage
      this.scrollToTop()
    },
    /**
     * The rows live in the overflow container; after a page change it
     * stays scrolled down at the pager, so the user would only see the
     * tail of the new page. Jump back to the first row, which is what
     * the Test tab shows without a scroll container.
     */
    scrollToTop () {
      const cntr = this.$refs.tableCntr
      if (cntr) {
        this.$nextTick(() => {
          cntr.scrollTop = 0
        })
      }
    }
  },
  watch: {
    table(v) {
      this.table = v
    }
  },

  mounted() {
    this.logger = new Logger('SurveyTable')
  }
}
</script>