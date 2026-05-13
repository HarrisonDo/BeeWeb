<script setup lang="ts">
defineProps<{
  connected: boolean;
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
      <label for="wsUrl">WebSocket URL</label>
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
      <button type="button" class="connect" :disabled="connected" @click="emit('connect')">Connect</button>
      <button type="button" class="disconnect" :disabled="!connected" @click="emit('disconnect')">Disconnect</button>
    </div>
    <div class="status-pill">
      <span class="dot" :class="{ connected }"></span>
      <span>{{ connected ? 'Connected' : 'Not connected' }}</span>
    </div>
  </div>
</template>
