<script setup lang="ts">
import { ref, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import StepStrip from '@/components/StepStrip.vue';
import CreditQualificationModal from '@/components/layout/CreditQualificationModal.vue';
import BiddingSitesModal from '@/components/layout/BiddingSitesModal.vue';
import { uploadFile } from '@/api/upload';

const router = useRouter();
const uploading = ref(false);
const isDragging = ref(false);
const selectedFile = ref<File | null>(null);
const progressPercent = ref(0);
const progressFileName = ref('');
let progressTimer: ReturnType<typeof setTimeout> | null = null;
const showCreditModal = ref(false);
const showBiddingModal = ref(false);

const steps = [
  { key: 0, label: '解析文件' },
  { key: 1, label: '转换释义' },
  { key: 2, label: '提取字段' },
];

function getExt(file: File): string {
  const name = file.name.toLowerCase();
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i) : '';
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0) + ' ' + units[i];
}

function validateFile(file: File): boolean {
  const ext = getExt(file);
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
    if (validateFile(files[0])) {
      selectedFile.value = files[0];
      progressFileName.value = files[0].name;
    }
  }
}

function triggerFileInput() {
  (document.getElementById('fileInput') as HTMLInputElement)?.click();
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files && input.files.length > 0 && !uploading.value) {
    if (validateFile(input.files[0])) {
      selectedFile.value = input.files[0];
      progressFileName.value = input.files[0].name;
    } else {
      input.value = '';
    }
  }
}

function startUpload(file: File) {
  if (!selectedFile.value) return;
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

function handleReplace() {
  selectedFile.value = null;
  progressFileName.value = '';
  progressPercent.value = 0;
  uploading.value = false;
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
        :class="{ dragging: isDragging, hasFile: !!selectedFile && !uploading, uploading: uploading }"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
        @click="!uploading && triggerFileInput()"
      >
        <!-- initial state: upload icon + hint + format badges -->
        <template v-if="!selectedFile">
          <div class="upload-icon-wrap">
            <span class="ri-upload-cloud-2-line icon"></span>
          </div>
          <p class="upload-hint">点击选择或拖拽招标文件到此处上传</p>
          <div class="format-row">
            <span class="fmt fmt-w">W</span>
            <span class="fmt fmt-x">X</span>
            <span class="fmt fmt-p">P</span>
            <span class="fmt fmt-pdf">PDF</span>
            <span class="fmt fmt-md">MD</span>
            <span class="fmt fmt-tx">TX</span>
          </div>
        </template>

        <!-- file selected, not uploading: show file info + extract button -->
        <template v-else-if="!uploading">
          <div class="file-card">
            <div class="file-icon" :class="'fmt-' + getExt(selectedFile).replace('.', '')">
              <!-- docx / wps -->
              <svg v-if="getExt(selectedFile) === '.docx' || getExt(selectedFile) === '.wps'" width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <path d="M8 9h12M8 13h12M8 17h8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
              <!-- xlsx -->
              <svg v-else-if="getExt(selectedFile) === '.xlsx'" width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <path d="M8 9h12M8 13h12M8 17h12M14 7v14" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
              </svg>
              <!-- pdf -->
              <svg v-else-if="getExt(selectedFile) === '.pdf'" width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <path d="M9 10l4 3-4 3V10z" fill="currentColor"/>
                <path d="M17 10l4 3-4 3V10z" fill="currentColor" opacity="0.5"/>
              </svg>
              <!-- md -->
              <svg v-else-if="getExt(selectedFile) === '.md'" width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <text x="8" y="21" font-family="sans-serif" font-size="11" font-weight="700" fill="currentColor">M</text>
              </svg>
              <!-- txt / other -->
              <svg v-else width="32" height="32" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="1.6"/>
                <path d="M9 9h10M9 13h10M9 17h6" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="file-meta">
              <p class="file-name">{{ selectedFile.name }}</p>
              <p class="file-size">{{ formatSize(selectedFile.size) }}</p>
            </div>
          </div>
          <div class="card-actions">
            <button class="btn-replace" @click.stop="handleReplace">
              <span class="ri-refresh-line icon"></span>
              替换文件
            </button>
            <button class="btn-extract" @click.stop="startUpload(selectedFile!)">
              一键提取
            </button>
          </div>
        </template>

        <!-- uploading: show compact file info + progress bar -->
        <template v-else>
          <div class="uploading-inner">
            <div class="file-icon-sm" :class="'fmt-' + getExt(selectedFile!).replace('.', '')">
              <svg v-if="getExt(selectedFile!) === '.docx' || getExt(selectedFile!) === '.wps'" width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M8 9h12M8 13h12M8 17h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <svg v-else-if="getExt(selectedFile!) === '.xlsx'" width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M8 9h12M8 13h12M8 17h12M14 7v14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
              <svg v-else-if="getExt(selectedFile!) === '.pdf'" width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M9 10l4 3-4 3V10z" fill="currentColor"/><path d="M17 10l4 3-4 3V10z" fill="currentColor" opacity="0.5"/>
              </svg>
              <svg v-else width="20" height="20" viewBox="0 0 28 28" fill="none">
                <rect x="3" y="2" width="22" height="24" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M9 9h10M9 13h10M9 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
              </svg>
            </div>
            <div class="uploading-info">
              <p class="uploading-name">{{ progressFileName }}</p>
              <div class="progress-track">
                <div class="progress-bar" :style="{ width: progressPercent + '%' }">
                  <div class="shimmer"></div>
                </div>
              </div>
              <p class="progress-text">{{ Math.round(progressPercent) }}%</p>
            </div>
          </div>
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
      />
    </div>

    <PageFooter @credit-query="showCreditModal = true" @bidding-sites="showBiddingModal = true" />

    <CreditQualificationModal v-model:visible="showCreditModal" />
    <BiddingSitesModal v-model:visible="showBiddingModal" />
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
  gap: 48px;
}

/* ── upload card ────────────────────────────────────── */
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
  transition: border-color 0.2s, background-color 0.2s;
  position: relative;
  overflow: hidden;
  gap: 20px;
}
.upload-card.dragging {
  border-color: #C0392B;
  background-color: #FBE9E7;
}
.upload-card.hasFile {
  cursor: default;
  justify-content: center;
  gap: 28px;
}
.upload-card.uploading {
  cursor: default;
  justify-content: center;
  gap: 20px;
}

/* initial state */
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
.fmt-w   { background-color: #2B579A; font-size: 11px; }
.fmt-x   { background-color: #217346; font-size: 11px; }
.fmt-p   { background-color: #C0392B; font-size: 11px; }
.fmt-pdf { background-color: #B03A2E; font-size: 9px; }
.fmt-md  { background-color: #4A6FA5; font-size: 9px; }
.fmt-tx  { background-color: #5A5750; font-size: 9px; }

/* ── file selected state ───────────────────────────── */
.file-card {
  display: flex;
  align-items: center;
  gap: 20px;
  width: 100%;
  max-width: 620px;
  padding: 20px 24px;
  background-color: #FDFCF9;
  border: 0.7px solid #EDE9E0;
  border-radius: 12px;
}
.file-icon {
  width: 60px;
  height: 60px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.file-icon.fmt-docx, .file-icon.fmt-wps { background-color: #2B579A; color: #fff; }
.file-icon.fmt-xlsx                   { background-color: #217346; color: #fff; }
.file-icon.fmt-pdf                    { background-color: #C0392B; color: #fff; }
.file-icon.fmt-md                     { background-color: #4A6FA5; color: #fff; }
.file-icon.fmt-txt                    { background-color: #5A5750; color: #fff; }
.file-meta { flex: 1; min-width: 0; }
.file-name {
  margin: 0 0 6px 0;
  font-size: 16px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.file-size {
  margin: 0;
  font-size: 14px;
  color: #8A8578;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.card-actions {
  display: flex;
  align-items: center;
  gap: 16px;
}
.btn-replace {
  height: 48px;
  padding: 0 22px;
  border: 0.7px solid #E5DFD3;
  border-radius: 10px;
  background-color: #FCFBF8;
  color: #3A3A3A;
  font-size: 15px;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
  transition: background-color 0.2s;
}
.btn-replace:hover { background-color: #F7F3EA; }
.btn-replace .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 16px;
}
.btn-extract {
  width: 200px;
  height: 48px;
  border: none;
  border-radius: 10px;
  background-color: #C0392B;
  color: #fff;
  font-size: 16px;
  font-weight: 500;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  cursor: pointer;
  transition: opacity 0.2s, transform 0.15s;
}
.btn-extract:hover { opacity: 0.9; transform: translateY(-1px); }
.btn-extract:active { transform: translateY(0); }

/* ── uploading state ───────────────────────────────── */
.uploading-inner {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  max-width: 600px;
}
.file-icon-sm {
  width: 42px;
  height: 42px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.file-icon-sm.fmt-docx, .file-icon-sm.fmt-wps { background-color: #2B579A; color: #fff; }
.file-icon-sm.fmt-xlsx                      { background-color: #217346; color: #fff; }
.file-icon-sm.fmt-pdf                       { background-color: #C0392B; color: #fff; }
.file-icon-sm.fmt-md                        { background-color: #4A6FA5; color: #fff; }
.file-icon-sm.fmt-txt                       { background-color: #5A5750; color: #fff; }
.uploading-info { flex: 1; min-width: 0; }
.uploading-name {
  margin: 0 0 10px 0;
  font-size: 15px;
  font-weight: 500;
  color: #1F1D1A;
  font-family: "SourceHanSans-Medium", var(--font-family-cn);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.progress-track {
  width: 100%;
  height: 6px;
  background-color: #F7F3EA;
  border-radius: 9999px;
  overflow: hidden;
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
  margin: 6px 0 0 0;
  font-size: 13px;
  color: #6E6A60;
  font-family: "SourceHanSans-Regular", var(--font-family-cn);
}

.file-input-hidden { display: none; }
</style>
