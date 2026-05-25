<script setup lang="ts">
import { Paperclip, SendHorizontal, Square, X } from 'lucide-vue-next';
import { nextTick, ref } from 'vue';
import type { ClientAttachment } from '../protocol/types';

const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

const props = defineProps<{
  disabled: boolean;
  hasPendingTurns: boolean;
  labels: Record<string, string>;
}>();

const emit = defineEmits<{
  send: [text: string, attachments: ClientAttachment[]];
  stop: [];
}>();

const text = ref('');
const attachments = ref<ClientAttachment[]>([]);
const fileInput = ref<HTMLInputElement | null>(null);
const textarea = ref<HTMLTextAreaElement | null>(null);
const uploadWarnings = ref<string[]>([]);
const isMac = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);

function submit() {
  const value = text.value.trim();
  if (!value && !attachments.value.length) return;
  emit('send', value, attachments.value);
  text.value = '';
  attachments.value = [];
  uploadWarnings.value = [];
  if (fileInput.value) fileInput.value.value = '';
  nextTick(resize);
}

function triggerPrimaryAction() {
  if (props.hasPendingTurns) {
    emit('stop');
    return;
  }
  submit();
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Enter') return;
  const shouldInsertNewline = isMac ? event.metaKey : event.ctrlKey;
  if (shouldInsertNewline) {
    event.preventDefault();
    insertNewlineAtCursor();
    return;
  }
  if (!event.shiftKey) {
    event.preventDefault();
    triggerPrimaryAction();
  }
}

function insertNewlineAtCursor() {
  const input = textarea.value;
  if (!input) {
    text.value = `${text.value}\n`;
    nextTick(resize);
    return;
  }

  const start = input.selectionStart;
  const end = input.selectionEnd;
  text.value = `${text.value.slice(0, start)}\n${text.value.slice(end)}`;
  nextTick(() => {
    input.selectionStart = start + 1;
    input.selectionEnd = start + 1;
    resize();
  });
}

function resize() {
  if (!textarea.value) return;
  textarea.value.style.height = 'auto';
  textarea.value.style.height = `${Math.min(150, textarea.value.scrollHeight)}px`;
}

function openFilePicker() {
  fileInput.value?.click();
}

async function onFileChange(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files || []);
  if (!files.length) return;

  const oversized = files.filter((file) => file.size > MAX_ATTACHMENT_BYTES);
  const unsupported = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES && getAttachmentKind(file) === 'binary');
  const readable = files.filter((file) => (
    file.size <= MAX_ATTACHMENT_BYTES &&
    getAttachmentKind(file) !== 'binary'
  ));
  uploadWarnings.value = [
    ...oversized.map((file) => `${props.labels.fileTooLarge}: ${file.name}`),
    ...unsupported.map((file) => `${props.labels.unsupportedFile}: ${file.name}`),
  ];
  const loaded = await Promise.all(readable.map(readAttachment));
  attachments.value = [...attachments.value, ...loaded];
  input.value = '';
}

function removeAttachment(id: string) {
  attachments.value = attachments.value.filter((attachment) => attachment.id !== id);
}

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

async function readAttachment(file: File): Promise<ClientAttachment> {
  const kind = getAttachmentKind(file);
  const base = {
    id: makeAttachmentId(),
    kind,
    name: file.name,
    size: file.size,
    type: file.type || 'application/octet-stream',
  } satisfies Omit<ClientAttachment, 'text' | 'base64'>;

  if (kind === 'text') {
    return {
      ...base,
      text: await file.text(),
    };
  }

  return {
    ...base,
    base64: await readFileBase64(file),
  };
}

function getAttachmentKind(file: File): ClientAttachment['kind'] {
  if (file.type.startsWith('image/')) return 'image';
  if (isTextFile(file)) return 'text';
  return 'binary';
}

function isTextFile(file: File) {
  return (
    file.type.startsWith('text/') ||
    /\.(json|md|txt|csv|log|xml|yaml|yml|js|ts|tsx|jsx|css|html|py|go|rs|java|c|cpp|h)$/i.test(file.name)
  );
}

function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.includes(',') ? result.split(',')[1] : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function makeAttachmentId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `file-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
</script>

<template>
  <footer class="composer">
    <div v-if="uploadWarnings.length" class="attachment-warnings" role="status">
      <span v-for="warning in uploadWarnings" :key="warning">{{ warning }}</span>
    </div>
    <div v-if="attachments.length" class="attachment-list" :aria-label="labels.attachedFiles">
      <span v-for="attachment in attachments" :key="attachment.id" class="attachment-chip">
        <Paperclip :size="13" aria-hidden="true" />
        <span class="attachment-name">{{ attachment.name }}</span>
        <span class="attachment-size">{{ formatSize(attachment.size) }}</span>
        <button type="button" :title="labels.removeFile" @click="removeAttachment(attachment.id)">
          <X :size="13" aria-hidden="true" />
        </button>
      </span>
    </div>
    <textarea
      ref="textarea"
      v-model="text"
      rows="1"
      :placeholder="labels.composerPlaceholder"
      :disabled="disabled"
      @input="resize"
      @keydown="onKeydown"
    ></textarea>
    <input
      ref="fileInput"
      class="file-input"
      type="file"
      multiple
      :disabled="disabled"
      @change="onFileChange"
    />
    <button
      type="button"
      class="attach-button icon-button"
      :title="labels.attachFiles"
      :disabled="disabled"
      @click="openFilePicker"
    >
      <Paperclip :size="17" aria-hidden="true" />
    </button>
    <button
      type="button"
      class="send icon-text-button"
      :class="{ stop: hasPendingTurns }"
      :title="hasPendingTurns ? labels.stopGeneration : labels.send"
      :disabled="disabled || (!hasPendingTurns && !text.trim() && !attachments.length)"
      @click="triggerPrimaryAction"
    >
      <Square v-if="hasPendingTurns" :size="16" aria-hidden="true" />
      <SendHorizontal v-else :size="17" aria-hidden="true" />
      <span>{{ hasPendingTurns ? labels.stopGeneration : labels.send }}</span>
    </button>
  </footer>
</template>
