<script setup>
// 文件职责：动态导航壳层、角色切换、通知入口和移动端抽屉。
import { computed, h, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { JccAppShell } from '@jcc/shared/components'
import { LogoutOutlined, MenuOutlined, UserOutlined } from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { resolveMenuIcon } from '@/menu-icons'
import { filterAccessibleNavigation, findModuleForPath, modulePath } from '@/navigation'
import NotificationBell from '@/components/NotificationBell.vue'
import { siteConfig } from '@/site-config'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
// 侧栏折叠状态持久化，刷新后保持用户习惯；移动端使用独立抽屉，不复用折叠状态。
const collapsed = ref(localStorage.getItem('library-sidebar-collapsed') === '1')
const mobileNavOpen = ref(false)
const userPanelOpen = ref(false)
const switchingRole = ref('')

watch(collapsed, (value) => {
  localStorage.setItem('library-sidebar-collapsed', value ? '1' : '0')
})

// 左侧一级菜单完全来自 /navigation；模块点击进入 /modules/:code，普通功能直接进入 path。
const visibleNavigation = computed(() =>
  filterAccessibleNavigation(auth.navigation, {
    resolveRoute: router.resolve,
    can: auth.can,
    isReader: auth.isReader,
  }),
)

const items = computed(() =>
  visibleNavigation.value.map((item) => ({
    key: modulePath(item),
    label: item.title,
    icon: () => h(resolveMenuIcon(item.icon)),
  })),
)

function findActiveKey() {
  // 页面 meta.menu 指向一级功能路径，需要向上找到所属模块，侧栏才能高亮整个模块。
  const targetPath = route.meta.menu || route.path
  const top = findModuleForPath(visibleNavigation.value, targetPath)
  return top ? modulePath(top) : ''
}

const activeKey = computed({
  get: findActiveKey,
  // activeKey 同时承担侧栏受控值和导航入口：点击时 push 对应模块/页面。
  set: (key) => {
    if (key && key !== route.path) router.push(key)
  },
})

function navigate(key) {
  mobileNavOpen.value = false
  if (key && key !== route.path) router.push(key)
}

function openProfile() {
  userPanelOpen.value = false
  router.push('/profile')
}

async function logout() {
  userPanelOpen.value = false
  await auth.logout()
  router.replace({ name: 'login' })
}

async function handleRoleChange(event) {
  // 角色切换成功后回到工作台：新角色不一定还能访问当前页面，避免留在 403 页。
  const roleCode = event.target.value
  if (roleCode === auth.role || switchingRole.value) return
  switchingRole.value = roleCode
  try {
    await auth.switchRole(roleCode)
    userPanelOpen.value = false
    message.success(`已切换到${auth.activeRole?.name || '新角色'}`)
    await router.replace('/')
  } catch (error) {
    message.error(error?.message || '角色切换失败')
  } finally {
    switchingRole.value = ''
  }
}
</script>

<template>
  <JccAppShell
    v-model:active-key="activeKey"
    v-model:collapsed="collapsed"
    :items="items"
    :show-tabs="false"
    :brand="siteConfig.title"
    :short-name="siteConfig.shortName"
    :brand-mark="siteConfig.brandMark"
    :user-name="auth.user?.displayName || '用户'"
    :department="auth.activeRole?.name || auth.role"
  >
    <template #header-actions>
      <a-button
        class="mobile-nav-trigger"
        type="text"
        aria-label="打开导航"
        @click="mobileNavOpen = true"
      >
        <MenuOutlined />
      </a-button>
      <NotificationBell />
    </template>

    <template #user>
      <a-popover v-model:open="userPanelOpen" placement="bottomRight" trigger="click">
        <button
          type="button"
          class="account-trigger"
          aria-label="账号与角色"
          :aria-expanded="userPanelOpen"
        >
          <a-avatar :size="28"><template #icon><UserOutlined /></template></a-avatar>
          <span class="account-trigger__name">{{ auth.user?.displayName || '用户' }}</span>
          <span class="account-trigger__role">{{ auth.activeRole?.name || auth.role }}</span>
        </button>
        <template #content>
          <div class="account-panel">
            <div class="account-panel__identity">
              <strong>{{ auth.user?.displayName || '用户' }}</strong>
              <span>当前角色：{{ auth.activeRole?.name || auth.role }}</span>
            </div>
            <div v-if="auth.roles.length > 1" class="account-panel__section">
              <div class="account-panel__label">切换角色</div>
              <a-radio-group
                class="account-panel__roles"
                :value="auth.role"
                :disabled="Boolean(switchingRole)"
                @change="handleRoleChange"
              >
                <a-radio v-for="role in auth.roles" :key="role.code" :value="role.code">
                  {{ role.name }}
                  <small v-if="role.code === auth.primaryRole?.code">主角色</small>
                </a-radio>
              </a-radio-group>
            </div>
            <div class="account-panel__actions">
              <button type="button" @click="openProfile"><UserOutlined />个人资料</button>
              <button type="button" @click="logout"><LogoutOutlined />退出登录</button>
            </div>
          </div>
        </template>
      </a-popover>
    </template>

    <RouterView />

    <a-drawer
      v-model:open="mobileNavOpen"
      title="功能导航"
      placement="left"
      :width="280"
      class="mobile-nav-drawer"
    >
      <a-menu
        :selected-keys="[activeKey]"
        :items="items"
        mode="inline"
        @click="({ key }) => navigate(key)"
      />
    </a-drawer>
  </JccAppShell>
</template>

<style scoped>
.mobile-nav-trigger {
  display: none;
}

.account-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 38px;
  padding: 4px 6px;
  border: 0;
  border-radius: 7px;
  color: #fff;
  background: transparent;
  cursor: pointer;
  font-size: var(--font-small);
  white-space: nowrap;
}

.account-trigger:hover,
.account-trigger[aria-expanded='true'] {
  background: rgb(255 255 255 / 16%);
}

.account-trigger__role {
  padding-left: 8px;
  border-left: 1px solid rgb(255 255 255 / 35%);
  font-size: 11px;
  opacity: 0.88;
}

.account-panel {
  width: 232px;
  color: var(--color-text);
}

.account-panel__identity {
  display: grid;
  gap: 4px;
  padding: 4px 4px 14px;
}

.account-panel__identity strong {
  font-size: 14px;
}

.account-panel__identity span {
  color: var(--color-text-muted);
  font-size: 12px;
}

.account-panel__section {
  padding: 14px 4px;
  border-top: 1px solid var(--color-border-soft);
}

.account-panel__label {
  margin-bottom: 10px;
  color: var(--color-text-muted);
  font-size: 12px;
}

.account-panel__roles {
  display: grid;
  gap: 10px;
  width: 100%;
}

.account-panel__roles :deep(.ant-radio-wrapper) {
  display: flex;
  align-items: center;
  margin-inline-end: 0;
}

.account-panel__roles small {
  margin-left: 8px;
  color: var(--color-text-muted);
  font-size: 11px;
}

.account-panel__actions {
  display: grid;
  gap: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--color-border-soft);
}

.account-panel__actions button {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 9px 4px;
  border: 0;
  border-radius: 6px;
  color: var(--color-text);
  background: transparent;
  cursor: pointer;
  text-align: left;
}
.account-panel__actions button:hover,
.account-panel__actions button:focus-visible {
  background: var(--color-page);
}

.account-panel__actions button:last-child {
  color: var(--color-danger);
}

@media (max-width: 760px) {
  .mobile-nav-trigger {
    display: inline-flex;
  }

  .account-trigger__name,
  .account-trigger__role {
    display: none;
  }
}
</style>
