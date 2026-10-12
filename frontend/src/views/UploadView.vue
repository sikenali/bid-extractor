<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import { uploadFile } from '@/api/upload';

const router = useRouter();
const uploading = ref(false);
const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const progressPercent = ref(0);
const progressFileName = ref('');
let progressTimer: ReturnType<typeof setTimeout> | null = null;

const steps = [
  { key: 0, label: '解析文件' },
];

function currentStep() {
  if (progressPercent.value < 30) return 0;
  return 0;
}

function validateFile(file: File): boolean {
  const name = file.name.toLowerCase();
  const ext = name.slice(name.lastIndexOf('.'));
  if (ext === '.doc') {
    ElMessage.warning('不支持 .doc 格式，请转换成 Docx 格式后再上传～');
    return false;
  }
  if (!['.docx', '.pdf', '.md', '.txt', '.xlsx', '.wps'].includes(ext)) {
    ElMessage.warning('不支持的格式，请上传招标文件');
    return false;
  }
  return true;
}

function handleDragOver(e: DragEvent) {
  e.preventDefault();
  isDragging.value = true;
}
function handleDragLeave() {
  isDragging.value = false;
}
function handleDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0 && !uploading.value) {
    if (validateFile(files[0])) startUpload(files[0]);
  }
}

function triggerFileInput() {
  if (uploading.value) return;
  (document.getElementById('fileInput') as HTMLInputElement)?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0 && !uploading.value) {
    if (validateFile(input.files[0])) startUpload(input.files[0]);
    else input.value = '';
  }
}

function startUpload(file: File) {
  selectedFile.value = file;
  progressFileName.value = file.name;
  uploading.value = true;
  progressPercent.value = 0;

  let cancelled = false;
  const simProgress = () => {
    if (cancelled || progressPercent.value >= 95) return;
    const target = progressPercent.value < 30 ? 30
      : progressPercent.value < 60 ? 60
      : 90;
    const step = Math.max(1, (target - progressPercent.value) / 8);
    progressPercent.value = Math.min(target, progressPercent.value + step);
    progressTimer = setTimeout(simProgress, 600);
  };
  progressTimer = setTimeout(simProgress, 300);

  uploadFile(file).then((uploadResult) => {
    cancelled = true;
    progressPercent.value = 100;
    setTimeout(() => {
      router.replace({ path: '/project', query: { jobId: uploadResult.id } });
    }, 500);
  }).catch((err: any) => {
    cancelled = true;
    const msg = err?.response?.data?.error || '上传失败，请重试';
    ElMessage.error(msg);
    uploading.value = false;
    progressPercent.value = 0;
    progressFileName.value = '';
    selectedFile.value = null;
  });
}

onUnmounted(() => {
  if (progressTimer !== null) clearTimeout(progressTimer);
});
</script>

<template>
  <div class="upload-view">
    <TopNav title="上传招标文件" />

    <div class="upload-body">
      <div
        class="upload-card"
        :class="{ dragging: isDragging, uploading: uploading }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="triggerFileInput"
      >
        <div class="upload-icon-wrap">
          <span class="ri-upload-cloud-2-line icon"></span>
        </div>

        <template v-if="!uploading">
          <p class="upload-hint">
            {{ selectedFile ? `已选择：${selectedFile.name}` : '点击选择或拖拽招标文件到此处上传' }}
          </p>
          <div class="format-row">
            <span class="fmt fmt-w">W</span>
            <span class="fmt fmt-x">X</span>
            <span class="fmt fmt-p">P</span>
            <span class="fmt fmt-pd">PD</span>
            <span class="fmt fmt-md">MD</span>
            <span class="fmt fmt-tx">TX</span>
          </div>
        </template>
        <template v-else>
          <p class="upload-hint">正在解析：{{ progressFileName }}</p>
          <div class="progress-track">
            <div class="progress-bar" :style="{ width: progressPercent + '%' }">
              <div class="shimmer"></div>
            </div>
          </div>
          <p class="progress-text">{{ Math.round(progressPercent) }}%</p>
        </template>

        <input
          id="fileInput"
          type="file"
          class="file-input-hidden"
          accept=".docx,.pdf,.md,.txt,.xlsx,.wps"
          :disabled="uploading"
          @change="handleFileSelect"
        />
      </div>

      <div class="step-strip">
        <template v-for="(step, i) in steps" :key="step.key">
          <div
            class="step-pill"
            :class="{
              done: currentStep() > step.key,
              active: currentStep() === step.key,
              todo: currentStep() < step.key,
            }"
          >
            <span class="step-num" :class="{ 'step-num-active': currentStep() === step.key }">
              {{ step.key + 1 }}
            </span>
            <span class="step-label">{{ step.label }}</span>
          </div>
          <span v-if="i < steps.length - 1" class="step-line"></span>
        </template>
      </div>

      <button
        class="extract-btn"
        :disabled="uploading"
        @click="!uploading && triggerFileInput()"
      >
        一键提取
      </button>
    </div>

    <PageFooter />
  </div>
</template>

<style scoped>
.upload-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--color-bg-main);
}
.upload-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-7);
  padding: var(--spacing-6) var(--spacing-8);
}
.upload-card {
  width: 620px;
  min-height: 345px;
  padding: var(--spacing-12) var(--spacing-8);
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border);
  border-radius: var(--radius-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-6);
  cursor: pointer;
  transition: all var(--transition-base);
}
.upload-card.dragging {
  border-color: var(--color-primary);
  background-color: var(--color-primary-soft);
}
.upload-card.uploading {
  cursor: default;
}
.upload-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-icon-wrap .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 34px;
  color: var(--color-text-muted);
}
.upload-hint {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: var(--font-medium);
  color: var(--color-text-primary);
  line-height: var(--leading-normal);
}
.format-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}
.fmt {
  width: 26px;
  height: 26px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-xs);
  font-weight: var(--font-bold);
  color: #fff;
  line-height: 1;
}
.fmt-w { background-color: #2B579A; }
.fmt-x { background-color: #217346; }
.fmt-p { background-color: #C0392B; }
.fmt-pd { background-color: #B03A2E; }
.fmt-md { background-color: #4A6FA5; }
.fmt-tx { background-color: #5A5750; }

.progress-track {
  width: 320px;
  height: 8px;
  background-color: var(--color-bg-secondary);
  border-radius: var(--radius-full);
  overflow: hidden;
}
.progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  border-radius: var(--radius-full);
  transition: width var(--transition-base);
  position: relative;
}
.shimmer {
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.35), transparent);
  animation: shimmer 1.5s infinite;
}
@keyframes shimmer {
  0% { left: -100%; }
  100% { left: 100%; }
}
.progress-text {
  margin: 0;
  font-size: var(--text-md);
  color: var(--color-text-secondary);
}

.step-strip {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}
.step-pill {
  height: var(--btn-height-sm);
  padding: 0 var(--spacing-6);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  background-color: var(--color-bg-white);
  border: 0.7px solid var(--color-border-soft);
}
.step-pill.active {
  border-color: var(--color-primary);
}
.step-pill.done {
  background-color: var(--color-success-soft);
  border-color: transparent;
}
.step-num {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background-color: var(--color-bg-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-text-muted);
}
.step-pill.done .step-num {
  background-color: var(--color-success);
  color: #fff;
}
.step-pill.active .step-num {
  background-color: var(--color-primary);
  color: #fff;
}
.step-label {
  font-size: var(--text-lg);
  color: var(--color-text-secondary);
}
.step-pill.done .step-label { color: var(--color-success); }
.step-pill.active .step-label { color: var(--color-primary); }
.step-line {
  width: 36px;
  height: 1px;
  background-color: var(--color-border);
}

.extract-btn {
  width: 260px;
  height: var(--btn-height-lg);
  border: none;
  border-radius: var(--radius-lg);
  background-color: var(--color-primary);
  color: #fff;
  font-size: var(--text-lg);
  font-weight: var(--font-medium);
  cursor: pointer;
  transition: opacity var(--transition-base);
}
.extract-btn:hover { opacity: 0.9; }
.extract-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.file-input-hidden { display: none; }
</style>
