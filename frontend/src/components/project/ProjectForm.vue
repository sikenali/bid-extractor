<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { getProject, createProject, updateProject } from '@/api/projects';
import { ElMessage } from 'element-plus';

const route = useRoute();
const router = useRouter();
const saving = ref(false);

const form = ref({
  name: '',
  biddingNumber: '',
  tenderOrg: '',
  budget: undefined as number | undefined,
  deadline: '',
  location: '',
  scope: ''
});

const rules = {
  name: [{ required: true, message: '请输入项目名称', trigger: 'blur' }],
  biddingNumber: [{ required: true, message: '请输入招标编号', trigger: 'blur' }],
  tenderOrg: [{ required: true, message: '请输入招标单位', trigger: 'blur' }]
};

async function loadProject(id: string) {
  try {
    const project = await getProject(id);
    form.value = {
      name: project.name,
      biddingNumber: project.biddingNumber,
      tenderOrg: project.tenderOrg,
      budget: project.budget,
      deadline: project.deadline || '',
      location: project.location || '',
      scope: project.scope || ''
    };
  } catch {
    ElMessage.error('加载项目失败');
  }
}

onMounted(() => {
  const id = route.params.id as string;
  if (id) {
    loadProject(id);
  }
});

async function handleSubmit() {
  saving.value = true;
  try {
    const id = route.params.id as string;
    if (id) {
      await updateProject(id, form.value);
      ElMessage.success('项目已更新');
    } else {
      const project = await createProject(form.value);
      ElMessage.success('项目已创建');
      router.push(`/project/${project.id}`);
    }
  } catch (err: any) {
    ElMessage.error(err?.response?.data?.error || '保存失败');
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <el-form :model="form" :rules="rules" label-width="120px" @submit.prevent="handleSubmit">
    <el-form-item label="项目名称" prop="name">
      <el-input v-model="form.name" placeholder="请输入项目名称" />
    </el-form-item>
    <el-form-item label="招标编号" prop="biddingNumber">
      <el-input v-model="form.biddingNumber" placeholder="请输入招标编号" />
    </el-form-item>
    <el-form-item label="招标单位" prop="tenderOrg">
      <el-input v-model="form.tenderOrg" placeholder="请输入招标单位" />
    </el-form-item>
    <el-form-item label="预算金额">
      <el-input-number v-model="form.budget" :precision="2" :min="0" />
    </el-form-item>
    <el-form-item label="截止时间">
      <el-date-picker v-model="form.deadline" type="datetime" placeholder="请选择截止时间" />
    </el-form-item>
    <el-form-item label="建设地点">
      <el-input v-model="form.location" placeholder="请输入建设地点" />
    </el-form-item>
    <el-form-item label="招标范围">
      <el-input v-model="form.scope" type="textarea" :rows="4" placeholder="请输入招标范围" />
    </el-form-item>
    <el-form-item>
      <el-button type="primary" :loading="saving" native-type="submit">保存</el-button>
    </el-form-item>
  </el-form>
</template>