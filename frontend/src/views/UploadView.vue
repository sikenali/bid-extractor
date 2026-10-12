<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import TopNav from '@/components/layout/TopNav.vue';
import PageFooter from '@/components/layout/PageFooter.vue';
import UploadCard from '@/components/upload/UploadCard.vue';
import CreditQualificationModal from '@/components/layout/CreditQualificationModal.vue';
import BiddingSitesModal from '@/components/layout/BiddingSitesModal.vue';

const router = useRouter();
const showCreditModal = ref(false);
const showBiddingModal = ref(false);

function handleSuccess(jobId: string) {
  router.replace({ path: '/project', query: { jobId } });
}
</script>

<template>
  <div class="upload-view">
    <TopNav title="上传招标文件" />

    <div class="upload-body">
      <UploadCard @success="handleSuccess" />
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
}
</style>
