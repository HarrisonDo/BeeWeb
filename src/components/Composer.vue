<script setup lang="ts">
import { SendHorizontal } from 'lucide-vue-next';
import { nextTick, ref } from 'vue';

defineProps<{
  disabled: boolean;
  labels: Record<string, string>;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const text = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

function submit() {
  const value = text.value.trim();
  if (!value) return;
  emit('send', value);
  text.value = '';
  nextTick(resize);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  const shouldInsertNewline = isMac ? event.metaKey : event.ctrlKey;
  if (shouldInsertNewline) return;
  if (!event.shiftKey) {
    event.preventDefault();
    submit();
  }
}

function resize() {
  if (!textarea.value) return;
  textarea.value.style.height = 'auto';
  textarea.value.style.height = `${Math.min(150, textarea.value.scrollHeight)}px`;
}
</script>

<template>
  <footer class="composer">
    <textarea
      ref="textarea"
      v-model="text"
      rows="1"
      :placeholder="labels.composerPlaceholder"
      :disabled="disabled"
      @input="resize"
      @keydown="onKeydown"
    ></textarea>
    <button
      type="button"
      class="send icon-text-button"
      :title="labels.send"
      :disabled="disabled || !text.trim()"
      @click="submit"
    >
      <SendHorizontal :size="17" aria-hidden="true" />
      <span>{{ labels.send }}</span>
    </button>
  </footer>
</template>
