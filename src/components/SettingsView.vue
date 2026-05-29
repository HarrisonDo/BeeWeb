<script setup lang="ts">
import { Bot, Code2, DownloadCloud, KeyRound, Link, ListRestart, RotateCcw, Save, Server } from 'lucide-vue-next';

interface BasicSettings {
  apiKey: string;
  apiUrl: string;
  modelName: string;
  wsUrl: string;
}

defineProps<{
  availableModels: string[];
  basicSettings: BasicSettings;
  connected: boolean;
  configJson: string;
  configJsonError: string;
  labels: Record<string, string>;
  settingStatus: string;
}>();

const emit = defineEmits<{
  getConfig: [];
  getDefaultConfig: [];
  getModels: [];
  saveConfig: [];
  'update:basicSetting': [field: keyof BasicSettings, value: string];
  'update:configJson': [value: string];
}>();
</script>

<template>
  <section class="settings-view">
    <div class="settings-section">
      <div class="settings-section-title">
        <Link :size="17" aria-hidden="true" />
        <div>
          <h2>{{ labels.defaultSettings }}</h2>
          <p>{{ labels.defaultSettingsHint }}</p>
        </div>
      </div>
      <div class="settings-grid two-column">
        <label class="settings-field" for="agentServerWsUrl">
          <span>
            <Link :size="14" aria-hidden="true" />
            {{ labels.wsUrl }}
          </span>
          <input
            id="agentServerWsUrl"
            :value="basicSettings.wsUrl"
            :disabled="connected"
            type="text"
            placeholder="ws://127.0.0.1:8686"
            @input="emit('update:basicSetting', 'wsUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-field" for="customModelApiUrl">
          <span>
            <Server :size="14" aria-hidden="true" />
            {{ labels.apiUrl }}
          </span>
          <input
            id="customModelApiUrl"
            :value="basicSettings.apiUrl"
            type="text"
            placeholder="https://api.example.com/v1"
            @input="emit('update:basicSetting', 'apiUrl', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-field" for="customModelApiKey">
          <span>
            <KeyRound :size="14" aria-hidden="true" />
            {{ labels.apiKey }}
          </span>
          <input
            id="customModelApiKey"
            :value="basicSettings.apiKey"
            type="password"
            autocomplete="off"
            placeholder="sk-..."
            @input="emit('update:basicSetting', 'apiKey', ($event.target as HTMLInputElement).value)"
          />
        </label>
        <label class="settings-field" for="customModelName">
          <span>
            <Bot :size="14" aria-hidden="true" />
            {{ labels.modelName }}
          </span>
          <div class="settings-inline-control">
            <input
              id="customModelName"
              :value="basicSettings.modelName"
              :list="availableModels.length ? 'availableModels' : undefined"
              type="text"
              placeholder="model-name"
              @input="emit('update:basicSetting', 'modelName', ($event.target as HTMLInputElement).value)"
            />
            <button type="button" class="icon-button" :title="labels.getModels" @click="emit('getModels')">
              <ListRestart :size="15" aria-hidden="true" />
            </button>
          </div>
          <datalist v-if="availableModels.length" id="availableModels">
            <option v-for="model in availableModels" :key="model" :value="model" />
          </datalist>
        </label>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">
        <Code2 :size="17" aria-hidden="true" />
        <div>
          <h2>{{ labels.advancedJsonSettings }}</h2>
          <p>{{ labels.advancedJsonSettingsHint }}</p>
        </div>
      </div>
      <div class="settings-actions">
        <button type="button" class="icon-text-button" @click="emit('getConfig')">
          <DownloadCloud :size="15" aria-hidden="true" />
          <span>{{ labels.getConfig }}</span>
        </button>
        <button type="button" class="icon-text-button" @click="emit('getDefaultConfig')">
          <RotateCcw :size="15" aria-hidden="true" />
          <span>{{ labels.getDefaultConfig }}</span>
        </button>
        <button type="button" class="icon-text-button primary-action" @click="emit('saveConfig')">
          <Save :size="15" aria-hidden="true" />
          <span>{{ labels.saveConfig }}</span>
        </button>
      </div>
      <label class="settings-field" for="advancedConfigJson">
        <span>{{ labels.fullConfigJson }}</span>
        <textarea
          id="advancedConfigJson"
          class="settings-json"
          spellcheck="false"
          :value="configJson"
          @input="emit('update:configJson', ($event.target as HTMLTextAreaElement).value)"
        ></textarea>
      </label>
      <div v-if="configJsonError" class="settings-error" role="status">{{ configJsonError }}</div>
      <div v-else-if="settingStatus" class="settings-status" role="status">{{ settingStatus }}</div>
    </div>
  </section>
</template>
