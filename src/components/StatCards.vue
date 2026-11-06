<script setup>
// 文件职责：工作台/报表统计卡片栅格。
defineProps({
  stats: { type: Array, default: () => [] },
})
</script>

<template>
  <a-row :gutter="[16, 16]" class="stat-grid">
    <a-col v-for="item in stats" :key="item.key" :xs="24" :sm="12" :lg="8" :xl="4">
      <a-card :bordered="false" class="stat-card" :class="`stat-card--${item.tone || 'primary'}`">
        <div class="stat-card__label">{{ item.label }}</div>
        <div class="stat-card__value">
          {{ item.value }}
          <small v-if="item.unit">{{ item.unit }}</small>
        </div>
      </a-card>
    </a-col>
  </a-row>
</template>

<style scoped>
.stat-card {
  height: 100%;
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  overflow: hidden;
}
.stat-card :deep(.ant-card-body) {
  padding: 18px 20px;
}
.stat-card__label {
  color: var(--color-text-muted);
  font-size: 13px;
}
.stat-card__value {
  margin-top: 6px;
  color: var(--color-text);
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
}
.stat-card__value small {
  margin-left: 4px;
  color: var(--color-text-muted);
  font-size: 12px;
  font-weight: 400;
}
.stat-card--danger {
  background: linear-gradient(130deg, #fff 40%, #fff1f0);
}
.stat-card--danger .stat-card__value {
  color: var(--color-danger);
}
.stat-card--warning {
  background: linear-gradient(130deg, #fff 40%, #fff7e6);
}
.stat-card--success {
  background: linear-gradient(130deg, #fff 40%, #eefaf2);
}
</style>
