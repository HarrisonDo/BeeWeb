<script setup lang="ts">
import { computed, ref } from 'vue';

const props = withDefaults(defineProps<{
  className?: string;
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
  return plain.length > 48 ? `${plain.slice(0, 48)}...` : plain;
});
</script>

<template>
  <section class="fold-card" :class="[className, { collapsed: shouldCollapse && !expanded }]">
    <div class="fold-head">
      <span class="fold-dot"></span>
      <span>{{ title }}</span>
      <span v-if="shouldCollapse" class="fold-preview">{{ preview }}</span>
      <button v-if="shouldCollapse" type="button" class="fold-toggle" @click="expanded = !expanded">
        {{ expanded ? 'Collapse' : 'Expand' }}
      </button>
    </div>
    <div v-if="summary" class="fold-summary">{{ summary }}</div>
    <div class="fold-content">{{ text }}</div>
  </section>
</template>
