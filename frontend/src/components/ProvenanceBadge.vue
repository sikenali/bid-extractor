<template>
  <span v-if="hasProvenance" class="prov-badge" @click="expanded = !expanded">
    <span v-if="page != null">第{{ page }}页 · </span>{{ chapter }}
    <RiArrowDownSLine class="prov-badge-arrow" :class="{ 'is-open': expanded }" />
  </span>
  <div v-if="expanded && sourceText" class="prov-source">{{ sourceText }}</div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';

const props = defineProps<{
  page?: number | null;
  chapter?: string;
  sourceText?: string;
}>();
const expanded = ref(false);
const hasProvenance = computed(() => props.page != null || !!props.chapter);
</script>

<style scoped>
.prov-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 8px;
  padding: 2px 10px;
  font-size: 12px;
  line-height: 18px;
  color: var(--color-text-secondary, #6E6A60);
  background-color: var(--color-bg-secondary, #F7F3EA);
  border: 0.7px solid var(--color-border, #E5DFD3);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s;
}
.prov-badge:hover {
  background-color: var(--color-primary-soft, #FBE9E7);
  border-color: var(--color-border-hover, #D9D2C2);
  color: var(--color-primary, #C0392B);
}
.prov-badge-arrow { font-size: 13px; transition: transform 0.2s; font-style: normal; }
.prov-badge-arrow.is-open { transform: rotate(180deg); }
.prov-source { margin-top: 4px; color: var(--color-text-faint, #A7A296); font-size: 12px; }
</style>
