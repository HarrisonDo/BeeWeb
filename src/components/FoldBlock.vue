<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
  collapseLabel: string;
  className?: string;
  expandLabel: string;
  summary?: string;
  text: string;
  title: string;
}>(), {
  className: '',
  summary: '',
});

const expanded = ref(false);
const shouldCollapse = computed(() => props.text.split('\n').length > 3 || props.text.length > 180);
const preview = computed(() => {
  const plain = (props.summary || props.text).replace(/\s+/g, ' ').trim();
  return plain.length > 56 ? `${plain.slice(0, 56)}...` : plain;
});
</script>

<template>
  <section class="fold-card codex-fold" :class="[className, { collapsed: shouldCollapse && !expanded, expanded }]">
    <button
      v-if="shouldCollapse"
      type="button"
      class="codex-fold-head"
      :title="expanded ? collapseLabel : expandLabel"
      @click="expanded = !expanded"
    >
      <span class="fold-chevron" aria-hidden="true"></span>
      <span class="codex-fold-title">{{ title }}</span>
      <span class="codex-fold-preview">{{ preview }}</span>
    </button>
    <div v-else class="fold-head">
      <span class="fold-chevron open" aria-hidden="true"></span>
      <span>{{ title }}</span>
    </div>
    <div v-if="summary" class="fold-summary">{{ summary }}</div>
    <div class="fold-content">{{ text }}</div>
  </section>
</template>
