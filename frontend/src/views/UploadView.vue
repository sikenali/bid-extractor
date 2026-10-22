<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import UploadCard from '@/components/upload/UploadCard.vue';
import StepStrip from '@/components/StepStrip.vue';
import CreditQualificationModal from '@/components/layout/CreditQualificationModal.vue';
import BiddingSitesModal from '@/components/layout/BiddingSitesModal.vue';

const router = useRouter();
const showCreditModal = ref(false);
const showBiddingModal = ref(false);

// DESIGN §3.1：StepStrip 与 UploadCard 平级，文件选定后出现
const cardRef = ref<InstanceType<typeof UploadCard>>();
const selectedFile = ref<File | null>(null);
const uploading = ref(false);
const steps = [
  { key: 0, label: '文档解析' },
  { key: 1, label: '规则抽取' },
  { key: 2, label: '智能增强' },
];

function handleSuccess(jobId: string) {
  try { sessionStorage.setItem('bidextractor.lastJobId', jobId); } catch {}
  router.replace({ path: '/result' });
}

function handleReplace() {
  try { sessionStorage.removeItem('bidextractor.lastJobId'); } catch {}
}

function handleExtract() {
  cardRef.value?.extract();
}
</script>

<template>
  <div class="upload-view">
    <TopNav title="智能标书解决方案平台-提取" :show-back="false" />

    <div class="upload-body">
      <UploadCard
        ref="cardRef"
        @success="handleSuccess"
        @replace="handleReplace"
        @update:file="selectedFile = $event"
        @update:uploading="uploading = $event"
      />

      <StepStrip
        v-if="selectedFile"
        class="step-strip"
        :steps="steps"
        :loading="uploading"
        button-label="一键提取"
        :disabled="uploading"
        @extract="handleExtract"
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
  background-color: var(--color-bg-main, #FAF7F2);
}
.upload-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 0 32px;
}
/* UploadCard 自身不再带外边距，卡片与 StepStrip 之间的节奏由这里统一控制 */
.step-strip {
  margin-top: 24px;
  width: 100%;
}
</style>
