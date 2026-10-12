<script setup lang="ts">
import { ref, watch, computed } from 'vue';
import { UiModal, UiInput } from '@/components/ui';

const props = defineProps<{
  visible: boolean;
  mode: 'regex' | 'keyword';
  editRule?: { id: string; fieldName: string; pattern: string } | null;
}>();

const emit = defineEmits<{
  close: []
  submit: [data: { fieldName: string; pattern: string; category: string }]
}>();

const dialogVisible = ref(false);
const fieldName = ref('');
const pattern = ref('');

const dialogTitle = computed(() => {
  const action = props.editRule ? '编辑' : '添加';
  return props.mode === 'regex' ? `${action}规则` : `${action}关键字`;
});

watch(() => props.visible, (val) => {
  dialogVisible.value = val;
  if (val) {
    if (props.editRule) {
      fieldName.value = props.editRule.fieldName;
      pattern.value = props.editRule.pattern;
    } else {
      fieldName.value = '';
      pattern.value = '';
    }
  }
});

watch(dialogVisible, (val) => {
  if (!val) emit('close');
});

function handleSubmit() {
  if (!fieldName.value.trim()) return;
  emit('submit', {
    fieldName: fieldName.value.trim(),
    pattern: pattern.value.trim(),
    category: props.mode
  });
  dialogVisible.value = false;
}
</script>

<template>
  <UiModal
    v-model="dialogVisible"
    :title="dialogTitle"
    :subtitle="props.mode === 'regex' ? '用正则匹配招标文件中的目标字段' : '用关键字标记需要关注的条款'"
    :icon="props.editRule ? 'ri-edit-line' : 'ri-add-line'"
    :width="560"
    :confirm-disabled="!fieldName.trim()"
    @confirm="handleSubmit"
  >
    <div class="form-group">
      <label class="form-label">字段名称</label>
      <UiInput
        v-model="fieldName"
        :placeholder="props.mode === 'regex' ? '例如：项目编号' : '例如：废标'"
        clearable
        @enter="handleSubmit"
      />
    </div>
    <div v-if="props.mode === 'regex'" class="form-group">
      <label class="form-label">正则表达式</label>
      <UiInput
        v-model="pattern"
        placeholder="请输入正则表达式"
        clearable
        @enter="handleSubmit"
      />
    </div>
  </UiModal>
</template>

<style scoped>
.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.form-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary, #1F1D1A);
  font-family: "SourceHanSans-Regular", var(--font-family-cn), sans-serif;
}
.form-group .ui-input { width: 100%; }
</style>
