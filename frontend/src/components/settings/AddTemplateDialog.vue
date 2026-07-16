<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  activeTab?: string;
}>();

const emit = defineEmits<{
  close: []
  submit: [data: { name: string; category: string; file: File | null }]
}>();

const dialogVisible = ref(false);
const formName = ref('');
const formCategory = ref('government');
const formDescription = ref('');
const uploadFile = ref<File | null>(null);
const dragging = ref(false);
const uploadPreview = ref<string | null>(null);

const categories = [
  { key: 'government', label: '政府采购', color: '#C43D3D' },
  { key: 'engineering', label: '工程施工', color: '#2D6A9F' },
  { key: 'it_service', label: '信息化服务', color: '#2D8A4E' },
  { key: 'consulting', label: '咨询服务', color: '#D4A017' }
];

watch(() => props.visible, (val) => {
  dialogVisible.value = val;
  if (val) {
    formName.value = '';
    formCategory.value = 'government';
    formDescription.value = '';
    uploadFile.value = null;
    uploadPreview.value = null;
  }
});

watch(dialogVisible, (val) => {
  if (!val) emit('close');
});

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) {
    uploadFile.value = file;
    if (file.type.startsWith('image/') || file.name.match(/\.(docx?|pdf|xlsx?)$/i)) {
      const reader = new FileReader();
      reader.onload = (ev) => { uploadPreview.value = ev.target?.result as string; };
      reader.readAsDataURL(file);
    }
  }
}

function handleDrop(e: DragEvent) {
  dragging.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file) {
    uploadFile.value = file;
    const reader = new FileReader();
    reader.onload = (ev) => { uploadPreview.value = ev.target?.result as string; };
    reader.readAsDataURL(file);
  }
}

function handleSubmit() {
  if (!formName.value.trim()) return;
  emit('submit', {
    name: formName.value.trim(),
    category: formCategory.value,
    file: uploadFile.value
  });
  dialogVisible.value = false;
}
</script>

<template>
  <teleport to="body">
    <div v-if="dialogVisible" class="modal-overlay" @click.self="dialogVisible = false">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3 class="modal-title">添加模板</h3>
          <button class="modal-close" @click="dialogVisible = false">
            <span class="icon ri-close-line"></span>
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">模板名称</label>
            <input
              v-model="formName"
              class="form-input"
              placeholder="请输入模板名称"
              @keyup.enter="handleSubmit"
            />
          </div>
          <div class="form-group">
            <label class="form-label">模板类型</label>
            <div class="category-select">
              <div
                v-for="cat in categories"
                :key="cat.key"
                class="category-option"
                :class="{ active: formCategory === cat.key }"
                :style="{ borderColor: cat.color }"
                @click="formCategory = cat.key"
              >
                {{ cat.label }}
              </div>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">模板描述</label>
            <textarea
              v-model="formDescription"
              class="form-textarea"
              placeholder="请输入模板描述（可选）"
              rows="3"
            ></textarea>
          </div>
          <div class="form-group">
            <label class="form-label">上传文件</label>
            <div
              class="upload-area"
              :class="{ dragging }"
              @dragover="dragging = true"
              @dragleave="dragging = false"
              @drop="handleDrop"
            >
              <input
                type="file"
                class="upload-input"
                accept=".doc,.docx,.pdf,.xlsx,.xls"
                @change="handleFileChange"
              />
              <template v-if="!uploadPreview">
                <span class="icon ri-upload-cloud-line upload-icon"></span>
                <p class="upload-text">拖拽文件到此处，或点击选择文件</p>
                <p class="upload-hint">支持 doc、docx、pdf、xlsx 格式</p>
              </template>
              <template v-else>
                <img v-if="uploadPreview.startsWith('data:image')" :src="uploadPreview" class="upload-preview" />
                <div v-else class="upload-file-info">
                  <span class="icon ri-file-text-line"></span>
                  <span class="file-name">{{ uploadFile?.name }}</span>
                  <button class="btn-remove-file" @click="uploadFile = null; uploadPreview = null;">
                    <span class="icon ri-close-line"></span>
                  </button>
                </div>
              </template>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" @click="dialogVisible = false">取消</button>
          <button class="btn-submit" :disabled="!formName.trim()" @click="handleSubmit">确定</button>
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
  width: 520px;
  max-width: 90vw;
  max-height: 85vh;
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
  overflow-y: auto;
  flex: 1;
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
.form-input,
.form-textarea {
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
.form-input:focus,
.form-textarea:focus {
  border-color: var(--color-primary);
}
.form-input::placeholder,
.form-textarea::placeholder {
  color: var(--color-text-muted);
}
.form-textarea {
  resize: vertical;
}
.category-select {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.category-option {
  padding: 8px 16px;
  border-radius: 8px;
  border: 1.5px solid var(--color-border);
  font-size: 13px;
  cursor: pointer;
  transition: all 0.2s;
  color: var(--color-text-secondary);
  background-color: var(--color-bg-card);
}
.category-option:hover {
  border-color: var(--color-text-secondary);
}
.category-option.active {
  color: white;
  font-weight: 500;
}
.upload-area {
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--color-bg-secondary);
  position: relative;
}
.upload-area.dragging {
  border-color: var(--color-primary);
  background-color: rgba(196, 61, 61, 0.05);
}
.upload-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}
.upload-icon {
  font-size: 40px;
  color: var(--color-text-muted);
  font-family: "remixicon", sans-serif;
  font-style: normal;
  margin-bottom: 12px;
}
.upload-text {
  font-size: 14px;
  color: var(--color-text-secondary);
  margin: 0 0 4px 0;
}
.upload-hint {
  font-size: 12px;
  color: var(--color-text-muted);
  margin: 0;
}
.upload-preview {
  max-width: 100%;
  max-height: 200px;
  border-radius: 8px;
}
.upload-file-info {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
}
.upload-file-info .icon {
  font-size: 24px;
  color: var(--color-primary);
  font-family: "remixicon", sans-serif;
  font-style: normal;
}
.file-name {
  flex: 1;
  font-size: 13px;
  color: var(--color-text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btn-remove-file {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  border: none;
  background: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 14px;
  transition: all 0.2s;
}
.btn-remove-file:hover {
  background-color: var(--color-primary);
  color: white;
}
.btn-remove-file .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
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
