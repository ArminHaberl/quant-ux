<template>
  <div class="StudioOverviewTabContent">
    <div>
      <h3>{{ $t('app.description')}}</h3>
      <AutoTextArea  :inline="true" v-model="app.description" @blur="onChangeDescription" :placeholder="$t('app.description-hint')"/>
    </div>

    <div>
      <h3 class="" >{{ $t('app.screen-list')}}</h3>
      <ScreenList :app="app" :pub="isPublic" class="MatcMarginTop" />
    </div>
  </div>
</template>
<script>
import ScreenList from "page/ScreenList";
import AutoTextArea from 'page/AutoTextArea'

export default {
  name: "StudioDesignTab",
  props: ["app", "isPublic"],
  data: function () {
    return {};
  },
  components: {
    ScreenList: ScreenList,
    AutoTextArea: AutoTextArea
  },
  methods: {
    onChangeDescription (e) {
      this.$emit("change", e)
    }
  },
  computed: {},
  watch: {},
  async mounted() {
  }
};
</script>
