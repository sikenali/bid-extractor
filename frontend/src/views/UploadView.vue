<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import StepStrip from '@/components/StepStrip.vue';
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
  { key: 1, label: '转换释义' },
  { key: 2, label: '提取字段' },
];

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
    const target = progressPercent.value < 40 ? 40
      : progressPercent.value < 75 ? 75
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
            <span class="fmt fmt-pdf">PDF</span>
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

      <StepStrip
        :steps="steps"
        :loading="uploading"
        button-label="一键提取"
        @extract="triggerFileInput"
      />
    </div>

    <PageFooter />
  </div>
</template>

<style scoped>
.upload-view {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: #FAF7F2;
}
.upload-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 32px;
}
.upload-card {
  width: 875px;
  min-height: 345px;
  background-color: #FFFFFF;
  border: 0.7px solid #E5DFD3;
  border-radius: 14px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: border-color 0.2s, background-color 0.2s;
  margin-bottom: 48px;
}
.upload-card.dragging {
  border-color: #C0392B;
  background-color: #FBE9E7;
}
.upload-card.uploading {
  cursor: default;
}
.upload-icon-wrap {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background-color: #F7F3EA;
  display: flex;
  align-items: center;
  justify-content: center;
}
.upload-icon-wrap .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 34px;
  color: #8A8578;
}
.upload-hint {
  margin: 0;
  padding-top: 28px;
  font-size: 18px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  line-height: 1.2;
}
.format-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-top: 24px;
}
.fmt {
  width: 26px;
  height: 26px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  color: #fff;
  font-family: "SourceHanSans-Bold", var(--font-family-cn);
  line-height: 1;
}
.fmt-w { background-color: #2B579A; font-size: 11px; }
.fmt-x { background-color: #217346; font-size: 11px; }
.fmt-p { background-color: #C0392B; font-size: 11px; }
.fmt-pdf { background-color: #B03A2E; font-size: 9px; }
.fmt-md { background-color: #4A6FA5; font-size: 9px; }
.fmt-tx { background-color: #5A5750; font-size: 9px; }

.progress-track {
  width: 320px;
  height: 8px;
  background-color: #F7F3EA;
  border-radius: 9999px;
  overflow: hidden;
  margin-top: 16px;
}
.progress-bar {
  height: 100%;
  background-color: #C0392B;
  border-radius: 9999px;
  transition: width 0.2s;
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
  padding-top: 8px;
  font-size: 14px;
  color: #6E6A60;
}

.file-input-hidden { display: none; }
</style>