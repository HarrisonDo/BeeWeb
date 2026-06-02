<script setup lang="ts">
import { Settings } from 'lucide-vue-next';

defineProps<{
  autoConnectPaused: boolean;
  connected: boolean;
  connecting: boolean;
  labels: Record<string, string>;
}>();

const emit = defineEmits<{
  openSettings: [];
}>();
</script>

<template>
  <div class="connection">
    <div class="connection-compact">
      <div class="status-pill">
        <span class="dot" :class="{ connected, connecting, paused: autoConnectPaused && !connected }"></span>
        <span>
          {{ connected ? labels.connected : (connecting ? labels.connecting : (autoConnectPaused ? labels.waitingManualConnect : labels.notConnected)) }}
        </span>
      </div>
      <button type="button" class="icon-button" :title="labels.settings" @click="emit('openSettings')">
        <Settings :size="16" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>
