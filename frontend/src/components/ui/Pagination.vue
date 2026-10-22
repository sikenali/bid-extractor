<script setup lang="ts">
/**
 * Pagination — 标准分页组件（DESIGN §8.6，全项目统一使用，禁止各产品自建分页样式）
 *
 * @example
 * <Pagination :current="currentPage" :total="total" :page-size="pageSize" @change="go" />
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  /** 当前页码 */
  current?: number;
  /** 总条数 */
  total?: number;
  /** 每页条数 */
  pageSize?: number;
  /** 省略号条数，每侧 */
  ellipsisCount?: number;
}>(), {
  current: 1,
  total: 0,
  pageSize: 10,
  ellipsisCount: 1,
});

const emit = defineEmits<{
  (e: 'change', page: number): void;
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));

const range = computed<number[]>(() => {
  const pages = pageCount.value;
  const cur = props.current;
  const ell = props.ellipsisCount;
  if (pages <= 2 * ell + 3) {
    return Array.from({ length: pages }, (_, i) => i + 1);
  }
  const out: number[] = [1];
  const start = Math.max(2, cur - ell);
  const end = Math.min(pages - 1, cur + ell);
  if (start > 2) out.push(-1);
  for (let p = start; p <= end; p++) out.push(p);
  if (end < pages - 1) out.push(-1);
  out.push(pages);
  return out;
});

function go(page: number) {
  if (page < 1 || page > pageCount.value || page === props.current) return;
  emit('change', page);
}
</script>

<template>
  <div v-if="pageCount > 1" class="pagination">
    <span class="pagination-info">共 {{ total }} 条 · 第 {{ current }} / {{ pageCount }} 页</span>
    <div class="pagination-pages">
      <button class="page-btn" :disabled="current <= 1" @click="go(current - 1)" aria-label="上一页">
        <RiArrowLeftSLine style="font-size: 16px" />
      </button>
      <template v-for="(p, i) in range" :key="p === -1 ? 'e' + i : p">
        <button v-if="p !== -1" class="page-btn page-num" :class="{ active: p === current }" @click="go(p)">
          {{ p }}
        </button>
        <span v-else class="page-ellipsis">…</span>
      </template>
      <button class="page-btn" :disabled="current >= pageCount" @click="go(current + 1)" aria-label="下一页">
        <RiArrowRightSLine style="font-size: 16px" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pagination {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
}
.pagination-info {
  font-size: 14px;
  color: var(--color-text-muted);
}
.pagination-pages {
  display: flex;
  align-items: center;
  gap: 8px;
}
.page-btn {
  width: 34px;
  height: 34px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  font-size: 14px;
  font-family: var(--font-family);
  color: var(--color-text-body);
  background-color: var(--color-bg-card);
  border: 0.7px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  transition: background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.page-btn:hover:not(:disabled):not(.active) {
  background-color: var(--color-bg-secondary);
  border-color: var(--color-border-hover);
  color: var(--color-text-primary);
}
.page-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.page-btn .icon, .page-btn :deep(svg), .page-btn > * {
  font-size: 16px;
  font-style: normal;
}
.page-btn.active {
  background-color: var(--color-success);
  border-color: var(--color-success);
  color: var(--color-on-success, #1F1D1A);
  font-weight: 600;
}
.page-ellipsis {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  font-size: 14px;
  color: var(--color-text-muted);
}
</style>
