<script setup lang="ts">
import { ref } from 'vue';
import TopNav from '@/components/layout/TopNav.vue';
import SettingsSidebar from '@/components/layout/SettingsSidebar.vue';

interface RegexRule {
  id: string;
  fieldName: string;
  pattern: string;
}

const regexRules = ref<RegexRule[]>([
  { id: '1', fieldName: '项目编号', pattern: '(?:项目|招标)\\s*编号[：:]\\s*([A-Z]{2,4}[-_]\\d{4}[-_]\\d{4})' },
  { id: '2', fieldName: '投标保证金', pattern: '投标\\s*保证金[：:]\\s*(?:人民币\\s*)?[¥￥]?\\s*(\\d,+(?:\\.\\d{2})?)\\s*元?' },
  { id: '3', fieldName: '投标截止时间', pattern: '投标\\s*(?:截止|递交).*?时间[：:]\\s*(\\d{4}年\\d{1,2}月\\d{1,2}日\\s*\\d{1,2}:\\d{2})' }
]);

const keywords = ref(['废标', '无效投标', '实质性响应', '★号条款', '否决投标']);

function removeKeyword(index: number) {
  keywords.value.splice(index, 1);
}

function addKeyword() {
  const newKeyword = prompt('请输入关键字:');
  if (newKeyword && !keywords.value.includes(newKeyword)) {
    keywords.value.push(newKeyword);
  }
}
</script>

<template>
  <div class="settings-view">
    <TopNav />
    <div class="settings-body">
      <SettingsSidebar />
      <div class="settings-content">
        <h2 class="page-title">规则设置</h2>
        <p class="page-desc">配置提取规则、正则表达式及关键字匹配</p>

        <div class="rule-section">
          <div class="section-header">
            <div class="section-title">
              <div class="section-icon"></div>
              <div>
                <h3>正则表达式规则</h3>
                <p>用于匹配和提取招标文件中的结构化字段</p>
              </div>
            </div>
            <button class="btn-add-rule">
              <span class="icon">&#xeb13;</span>
              <span>添加规则</span>
            </button>
          </div>

          <div class="rule-table-wrapper">
            <table class="rule-table">
              <thead>
                <tr>
                  <th>字段名称</th>
                  <th>正则表达式</th>
                  <th style="width: 120px; text-align: center;">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="rule in regexRules" :key="rule.id">
                  <td>{{ rule.fieldName }}</td>
                  <td><code class="pattern">{{ rule.pattern }}</code></td>
                  <td>
                    <div class="action-buttons">
                      <button class="btn-action" title="编辑"><span class="icon">&#xec46;</span></button>
                      <button class="btn-action btn-delete" title="删除"><span class="icon">&#xed2a;</span></button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="rule-section">
          <div class="section-header">
            <div class="section-title">
              <div class="section-icon icon-blue">
                <span class="icon">&#xeaaf;</span>
              </div>
              <div>
                <h3>关键字匹配规则</h3>
                <p>通过关键字定位招标文件中的关键段落</p>
              </div>
            </div>
            <button class="btn-add-rule">
              <span class="icon">&#xeb13;</span>
              <span>添加关键字</span>
            </button>
          </div>

          <div class="keyword-tags">
            <span v-for="(kw, index) in keywords" :key="kw" class="keyword-tag">
              {{ kw }}
              <span class="icon close-icon" @click="removeKeyword(index)">&#xeb99;</span>
            </span>
            <span class="keyword-tag add-tag" @click="addKeyword">
              <span class="icon">&#xeb13;</span>
              <span>添加</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-view { min-height: 100vh; background-color: var(--color-bg-main); }
.settings-body { display: flex; min-height: calc(100vh - 64px); }
.settings-content { flex: 1; padding: 32px; }
.page-title { font-size: 24px; font-weight: bold; color: var(--color-text-primary); margin: 0 0 4px 0; }
.page-desc { font-size: 14px; color: var(--color-text-muted); margin: 0 0 24px 0; }

.rule-section {
  border: 0.7px solid var(--color-border);
  border-radius: 16px;
  padding: 24px;
  margin-bottom: 24px;
  background-color: white;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 12px;
}

.section-icon {
  width: 36px;
  height: 36px;
  background-color: var(--color-bg-card);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.section-icon.icon-blue { background-color: #E8F0F8; }
.section-icon.icon-blue .icon { color: #2D6A9F; }

.section-title h3 { font-size: 16px; font-weight: 600; color: var(--color-text-primary); margin: 0 0 4px 0; }
.section-title p { font-size: 12px; color: var(--color-text-muted); margin: 0; }

.btn-add-rule {
  height: 32px;
  padding: 0 16px;
  background-color: var(--color-primary);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-add-rule .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 14px;
}

.rule-table-wrapper {
  border: 0.7px solid var(--color-bg-card);
  border-radius: 12px;
  overflow: hidden;
}

.rule-table {
  width: 100%;
  border-collapse: collapse;
}

.rule-table th {
  background-color: var(--color-bg-secondary);
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  text-align: left;
  color: var(--color-text-primary);
}

.rule-table td {
  padding: 12px 16px;
  font-size: 13px;
  border-top: 1px solid var(--color-bg-card);
  vertical-align: middle;
}

.rule-table tr td:first-child { font-weight: 500; color: var(--color-text-primary); }

.pattern {
  font-family: monospace;
  font-size: 12px;
  color: #2D6A9F;
  background-color: var(--color-bg-secondary);
  padding: 2px 6px;
  border-radius: 4px;
}

.action-buttons {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.btn-action {
  width: 28px;
  height: 28px;
  background-color: var(--color-bg-card);
  border: none;
  border-radius: 8px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-secondary);
  font-size: 14px;
}

.btn-action.btn-delete {
  background-color: #FFECEA;
  color: var(--color-primary);
}

.btn-action .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
}

.keyword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.keyword-tag {
  background-color: var(--color-bg-card);
  border-radius: 9999px;
  padding: 8px 16px;
  font-size: 13px;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.keyword-tag .icon {
  font-family: "remixicon", sans-serif;
  font-style: normal;
  font-size: 14px;
  cursor: pointer;
}

.keyword-tag .close-icon:hover { color: var(--color-primary); }

.keyword-tag.add-tag {
  border: 0.7px solid var(--color-border);
  cursor: pointer;
}

.keyword-tag.add-tag:hover { border-color: var(--color-primary); }
</style>
