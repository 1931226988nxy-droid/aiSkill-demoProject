<script setup>
import { computed, h, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { message } from 'ant-design-vue'
import { JccAppShell } from '@jcc/shared/components'
import {
  CheckOutlined,
  ArrowLeftOutlined,
  LogoutOutlined,
  MenuOutlined,
  UserOutlined,
} from '@ant-design/icons-vue'
import { useAuthStore } from '@/stores/auth'
import { resolveMenuIcon } from '@/menu-icons'
import { backDestination, findModuleForPath, modulePath } from '@/navigation'
import NotificationBell from '@/components/NotificationBell.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()
const collapsed = ref(localStorage.getItem('library-sidebar-collapsed') === '1')
const mobileNavOpen = ref(false)
const switchingRole = ref('')

watch(collapsed, (value) => {
  localStorage.setItem('library-sidebar-collapsed', value ? '1' : '0')
})

const items = computed(() =>
  (auth.navigation || []).map((item) => ({
    key: modulePath(item),
    label: item.title,
    icon: () => h(resolveMenuIcon(item.icon)),
  })),
)

function findActiveKey() {
  const targetPath = route.meta.menu || route.path
  const top = findModuleForPath(auth.navigation, targetPath)
  return top ? modulePath(top) : ''
}

const returnTo = computed(() => backDestination(auth.navigation, route))
const currentTitle = computed(() => route.name === 'module'
  ? findModuleForPath(auth.navigation, route.path)?.title || route.meta.title
  : route.meta.title || '当前页面')

const activeKey = computed({
  get: findActiveKey,
  set: (key) => {
    if (key && key !== activeKey.value) router.push(key)
  },
})

function navigate(key) {
  mobileNavOpen.value = false
  if (key !== activeKey.value) router.push(key)
}

async function handleUserMenu({ key }) {
  if (key === 'profile') {
    router.push('/profile')
    return
  }
  if (key === 'logout') {
    await auth.logout()
    router.replace({ name: 'login' })
    return
  }
  if (key.startsWith('role:')) {
    const roleCode = key.slice(5)
    if (roleCode === auth.role || switchingRole.value) return
    switchingRole.value = roleCode
    try {
      await auth.switchRole(roleCode)
      message.success(`已切换到${auth.activeRole?.name || '新角色'}`)
      await router.replace('/')
    } catch (error) {
      message.error(error?.message || '角色切换失败')
    } finally {
      switchingRole.value = ''
    }
  }
}
</script>

<template>
  <JccAppShell
    v-model:active-key="activeKey"
    v-model:collapsed="collapsed"
    :items="items"
    :show-tabs="false"
    brand="图书管理系统"
    short-name="云澜图书馆"
    brand-mark="书"
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
      <a-tag class="header-role-tag">
        {{ auth.activeRole?.name || auth.role }}
      </a-tag>
      <NotificationBell />
      <a-dropdown placement="bottomRight" :trigger="['click']">
        <a-button type="text" aria-label="账号与角色菜单">
          <UserOutlined />
        </a-button>
        <template #overlay>
          <a-menu
            :selected-keys="[`role:${auth.role}`]"
            class="role-menu"
            @click="handleUserMenu"
          >
            <a-menu-item-group v-if="auth.roles.length > 1" title="切换角色">
              <a-menu-item
                v-for="role in auth.roles"
                :key="`role:${role.code}`"
                :disabled="switchingRole === role.code"
              >
                <span class="role-menu__name">
                  {{ role.name }}
                  <small v-if="role.code === auth.primaryRole?.code">主角色</small>
                </span>
                <CheckOutlined v-if="role.code === auth.role" class="role-menu__check" />
              </a-menu-item>
            </a-menu-item-group>
            <a-menu-divider v-if="auth.roles.length > 1" />
            <a-menu-item key="profile">
              <UserOutlined />
              个人资料
            </a-menu-item>
            <a-menu-item key="logout">
              <LogoutOutlined />
              退出登录
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </template>

    <nav v-if="returnTo" class="app-back-nav" aria-label="返回上一级">
      <a-button type="text" class="app-back-nav__button" @click="router.push(returnTo.path)">
        <ArrowLeftOutlined />
        返回{{ returnTo.label }}
      </a-button>
      <span class="app-back-nav__current">{{ currentTitle }}</span>
    </nav>

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

.header-role-tag {
  color: #fff;
  border-color: rgb(255 255 255 / 40%);
  background: rgb(255 255 255 / 14%);
}

.role-menu__name {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.role-menu__name small {
  color: var(--color-text-muted);
  font-size: 11px;
}

.role-menu__check {
  margin-left: 24px;
  color: var(--color-primary);
}

.app-back-nav {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 5px 20px 0;
}

.app-back-nav__button {
  padding-inline: 4px;
  color: var(--color-primary);
}

.app-back-nav__current {
  overflow: hidden;
  color: var(--color-text-muted);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 760px) {
  .app-back-nav {
    padding-inline: 12px;
  }
  .mobile-nav-trigger {
    display: inline-flex;
  }

  .header-role-tag {
    display: none;
  }
}
</style>
