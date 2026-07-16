<script setup lang="ts">
import { ref, watch } from 'vue';

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
  <teleport to="body">
    <div v-if="dialogVisible" class="modal-overlay" @click.self="dialogVisible = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">{{ props.mode === 'regex' ? '添加规则' : '添加关键字' }}</h3>
          <button class="modal-close" @click="dialogVisible = false">
            <span class="icon ri-close-line"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">字段名称</label>
            <input
              v-model="fieldName"
              class="form-input"
              :placeholder="props.mode === 'regex' ? '例如：项目编号' : '例如：废标'"
              @keyup.enter="handleSubmit"
            />
          </div>
          <div v-if="props.mode === 'regex'" class="form-group">
            <label class="form-label">正则表达式</label>
            <input
              v-model="pattern"
              class="form-input"
              placeholder="请输入正则表达式"
            />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="dialogVisible = false">取消</button>
          <button class="btn-submit" :disabled="!fieldName.trim()" @click="handleSubmit">确定</button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
  animation: fadeIn 0.2s;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
.modal-dialog {
  width: 480px;
  max-width: 90vw;
  background-color: var(--color-bg-white);
  border-radius: var(--radius-lg);
  box-shadow: 0 12px 48px rgba(61, 43, 31, 0.2);
  display: flex;
  flex-direction: column;
  animation: slideUp 0.25s ease-out;
}
@keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px;
  border-bottom: 1px solid var(--color-border);
}
.modal-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-text-primary);
  margin: 0;
}
.modal-close {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 18px;
  transition: all 0.2s;
}
.modal-close:hover {
  background-color: var(--color-bg-card);
  color: var(--color-text-primary);
}
.modal-close .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
.modal-body {
  padding: 24px;
}
.form-group {
  margin-bottom: 20px;
}
.form-group:last-child {
  margin-bottom: 0;
}
.form-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--color-text-primary);
  margin-bottom: 8px;
}
.form-input {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  background-color: var(--color-bg-secondary);
  font-size: 14px;
  color: var(--color-text-primary);
  outline: none;
  transition: border-color 0.2s;
  box-sizing: border-box;
  font-family: inherit;
}
.form-input:focus {
  border-color: var(--color-primary);
}
.form-input::placeholder {
  color: var(--color-text-muted);
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 24px;
  border-top: 1px solid var(--color-border);
}
.btn-cancel {
  padding: 10px 24px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  background-color: var(--color-bg-card);
  color: var(--color-text-secondary);
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-cancel:hover {
  background-color: var(--color-bg-secondary);
  color: var(--color-text-primary);
}
.btn-submit {
  padding: 10px 32px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 500;
  background-color: var(--color-primary);
  color: white;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-submit:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
