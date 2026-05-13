<script setup lang="ts">
import { nextTick, ref } from 'vue';

defineProps<{
  disabled: boolean;
}>();

const emit = defineEmits<{
  send: [text: string];
}>();

const text = ref('');
const textarea = ref<HTMLTextAreaElement | null>(null);

function submit() {
  const value = text.value.trim();
  if (!value) return;
  emit('send', value);
  text.value = '';
  nextTick(resize);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  if (event.ctrlKey || event.metaKey) return;
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
      placeholder="Type a message. Ctrl/Cmd+Enter inserts a newline."
      :disabled="disabled"
      @input="resize"
      @keydown="onKeydown"
    ></textarea>
    <button type="button" class="send" :disabled="disabled || !text.trim()" @click="submit">Send</button>
  </footer>
</template>
