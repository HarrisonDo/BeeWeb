<script setup lang="ts">
import { Bot, KeyRound, Link, Server } from 'lucide-vue-next';

interface CustomModelSettings {
  apiKey: string;
  apiUrl: string;
  modelName: string;
}

defineProps<{
  connected: boolean;
  customModel: CustomModelSettings;
  labels: Record<string, string>;
  wsUrl: string;
}>();

const emit = defineEmits<{
  'update:customModel': [field: keyof CustomModelSettings, value: string];
  'update:wsUrl': [value: string];
}>();
</script>

<template>
  <section class="settings-view">
    <div class="settings-section">
      <div class="settings-section-title">
        <Link :size="17" aria-hidden="true" />
        <div>
          <h2>{{ labels.wsSettings }}</h2>
          <p>{{ labels.wsSettingsHint }}</p>
        </div>
      </div>
      <div class="settings-grid">
        <label class="settings-field" for="settingsWsUrl">
          <span>{{ labels.wsUrl }}</span>
          <input
            id="settingsWsUrl"
            :value="wsUrl"
            :disabled="connected"
            type="text"
            placeholder="ws://host:port"
            @input="emit('update:wsUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">
        <Bot :size="17" aria-hidden="true" />
        <div>
          <h2>{{ labels.customModelSettings }}</h2>
          <p>{{ labels.customModelSettingsHint }}</p>
        </div>
      </div>
      <div class="settings-grid">
        <label class="settings-field" for="customModelApiUrl">
          <span>
            <Server :size="14" aria-hidden="true" />
            {{ labels.apiUrl }}
          </span>
          <input
            id="customModelApiUrl"
            :value="customModel.apiUrl"
            type="text"
            placeholder="https://api.example.com/v1"
            @input="emit('update:customModel', 'apiUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-field" for="customModelApiKey">
          <span>
            <KeyRound :size="14" aria-hidden="true" />
            {{ labels.apiKey }}
          </span>
          <input
            id="customModelApiKey"
            :value="customModel.apiKey"
            type="password"
            autocomplete="off"
            placeholder="sk-..."
            @input="emit('update:customModel', 'apiKey', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-field" for="customModelName">
          <span>
            <Bot :size="14" aria-hidden="true" />
            {{ labels.modelName }}
          </span>
          <input
            id="customModelName"
            :value="customModel.modelName"
            type="text"
            placeholder="model-name"
            @input="emit('update:customModel', 'modelName', ($event.target as HTMLInputElement).value)"
          />
        </label>
      </div>
    </div>
  </section>
</template>
