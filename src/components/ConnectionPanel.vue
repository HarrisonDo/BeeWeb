<script setup lang="ts">
import { Link, LogIn, LogOut } from 'lucide-vue-next';

defineProps<{
  connected: boolean;
  labels: Record<string, string>;
  url: string;
}>();

const emit = defineEmits<{
  connect: [];
  disconnect: [];
  'update:url': [value: string];
}>();
</script>

<template>
  <div class="connection">
    <div class="field">
      <label for="wsUrl">
        <Link :size="14" aria-hidden="true" />
        <span>{{ labels.wsUrl }}</span>
      </label>
      <input
        id="wsUrl"
        :value="url"
        :disabled="connected"
        type="text"
        placeholder="ws://host:port"
        @input="emit('update:url', ($event.target as HTMLInputElement).value)"
      />
    </div>
    <div class="connect-row">
      <button type="button" class="connect icon-text-button" :disabled="connected" @click="emit('connect')">
        <LogIn :size="16" aria-hidden="true" />
        <span>{{ labels.connect }}</span>
      </button>
      <button type="button" class="disconnect icon-text-button" :disabled="!connected" @click="emit('disconnect')">
        <LogOut :size="16" aria-hidden="true" />
        <span>{{ labels.disconnect }}</span>
      </button>
    </div>
    <div class="status-pill">
      <span class="dot" :class="{ connected }"></span>
      <span>{{ connected ? labels.connected : labels.notConnected }}</span>
    </div>
  </div>
</template>
