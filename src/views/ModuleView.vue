<script setup>
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { JccPagePanel } from '@jcc/shared/components'
import { RightOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { resolveMenuIcon } from '@/menu-icons'
import PageBody from '@/components/PageBody.vue'

const auth = useAuthStore()
const route = useRoute()
const router = useRouter()

const module = computed(() =>
  (auth.navigation || []).find(
    (item) => item.type === 'module' && item.code === route.params.code,
  ),
)

const groups = computed(() => {
  if (!module.value) return []
  const children = module.value.children || []
  const groupChildren = children.filter((item) => item.type === 'group')
  const directItems = children.filter((item) => item.type === 'item')
  const result = groupChildren.map((group) => ({
    ...group,
    children: (group.children || []).filter((item) => item.type === 'item'),
  }))
  if (directItems.length) {
    result.push({
      id: 'direct',
      code: 'direct',
      title: groupChildren.length ? '其他功能' : '功能入口',
      description: '直接归属于当前模块的功能',
      children: directItems,
    })
  }
  return result
})

const activeGroup = ref('')

watch(
  groups,
  (value) => {
    if (!value.length) {
      activeGroup.value = ''
      return
    }
    if (!value.some((group) => group.code === activeGroup.value)) {
      activeGroup.value = value[0].code
    }
  },
  { immediate: true },
)

function openItem(item) {
  if (item.path) router.push(item.path)
}
</script>

<template>
  <JccPagePanel :title="module?.title || '功能模块'">
    <template #extra>
      <span v-if="module" class="muted small">
        {{ groups.length }} 个标签分组 ·
        {{ groups.reduce((total, group) => total + (group.children?.length || 0), 0) }} 个功能
      </span>
    </template>

    <PageBody v-if="module" mode="scroll" :label="`${module.title}功能导航`">
      <section class="module-card">
        <header class="module-hero">
          <div class="module-hero__icon">
            <component :is="resolveMenuIcon(module.icon)" />
          </div>
          <div>
            <h2>{{ module.title }}</h2>
            <p>{{ module.description || '选择下方标签和功能卡片开始办理业务。' }}</p>
          </div>
        </header>

        <a-tabs v-if="groups.length" v-model:activeKey="activeGroup" class="module-tabs">
          <a-tab-pane v-for="group in groups" :key="group.code" :tab="group.title">
            <div class="module-group-intro">
              {{ group.description || '选择一个功能进入。' }}
            </div>
            <div class="module-feature-grid">
              <button
                v-for="item in group.children || []"
                :key="item.code"
                type="button"
                class="module-feature"
                @click="openItem(item)"
              >
                <span class="module-feature__icon">
                  <component :is="resolveMenuIcon(item.icon)" />
                </span>
                <span class="module-feature__body">
                  <strong>{{ item.title }}</strong>
                  <small>{{ item.description || '点击进入功能' }}</small>
                </span>
                <RightOutlined class="module-feature__arrow" />
              </button>
            </div>
          </a-tab-pane>
        </a-tabs>
        <a-empty v-else description="当前模块暂无可访问功能" />
      </section>
    </PageBody>

    <PageBody v-else-if="auth.navigationLoading" mode="fill" label="模块加载中">
      <a-skeleton active :paragraph="{ rows: 8 }" />
    </PageBody>

    <PageBody v-else mode="scroll" label="模块无权限">
      <a-result
        status="403"
        title="当前角色无权访问该模块"
        sub-title="可以尝试在右上角切换角色，或联系管理员调整角色权限与菜单授权。"
      >
        <template #extra>
          <a-button type="primary" @click="router.push('/')">返回工作台</a-button>
        </template>
      </a-result>
    </PageBody>
  </JccPagePanel>
</template>

<style scoped>
.module-card {
  padding: 26px 28px 30px;
  background:
    radial-gradient(circle at 92% 0%, rgb(76 120 244 / 9%), transparent 34%),
    #fff;
  border: 1px solid var(--color-border-soft);
  border-radius: 16px;
  box-shadow: var(--shadow-card);
}

.module-hero {
  display: flex;
  align-items: center;
  gap: 18px;
  padding-bottom: 22px;
  border-bottom: 1px solid var(--color-border-soft);
}

.module-hero__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  color: #fff;
  background: linear-gradient(145deg, #4c78f4, #2b67dd);
  border-radius: 14px;
  font-size: 25px;
  box-shadow: 0 8px 18px rgb(63 112 223 / 22%);
}

.module-hero h2 {
  margin: 0;
  font-size: 22px;
  font-weight: 650;
}

.module-hero p {
  margin: 6px 0 0 !important;
  color: var(--color-text-muted);
  font-size: 13px;
}

.module-tabs {
  margin-top: 12px;
}

.module-group-intro {
  margin: 2px 0 16px;
  color: var(--color-text-muted);
  font-size: 13px;
}

.module-feature-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 14px;
}

.module-feature {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 18px;
  color: var(--color-text);
  text-align: left;
  background: #fbfcff;
  border: 1px solid var(--color-border-soft);
  border-radius: 12px;
  cursor: pointer;
  transition: border-color 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.module-feature:hover {
  border-color: var(--color-primary);
  box-shadow: 0 8px 20px rgb(52 96 184 / 10%);
  transform: translateY(-1px);
}

.module-feature__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 10px;
  font-size: 19px;
}

.module-feature__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 3px;
}

.module-feature__body strong {
  font-size: 14px;
}

.module-feature__body small {
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 12px;
  line-height: 1.6;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.module-feature__arrow {
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 11px;
}

@media (max-width: 760px) {
  .module-card {
    padding: 18px 14px 22px;
  }

  .module-hero {
    align-items: flex-start;
  }

  .module-hero__icon {
    width: 44px;
    height: 44px;
    font-size: 20px;
  }

  .module-feature-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
