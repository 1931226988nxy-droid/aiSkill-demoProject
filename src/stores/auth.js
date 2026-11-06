/**
 * 文件职责：登录态、当前激活角色、权限和动态导航状态。
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

export const useAuthStore = defineStore('auth', () => {
  // user.role 是当前激活角色；user.roles 是全部可选角色；permissions 只对应当前角色。
  const user = ref(null)
  const permissions = ref([])
  const navigation = ref([])
  const navigationLoading = ref(false)
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref(null)

  const isAuthenticated = computed(() => Boolean(user.value))
  const role = computed(() => user.value?.role?.code || '')
  const roles = computed(() => user.value?.roles || [])
  const activeRole = computed(() => user.value?.role || null)
  const primaryRole = computed(() => user.value?.primaryRole || null)
  const isReader = computed(() => role.value === 'reader')
  const isStaff = computed(() => Boolean(user.value) && !isReader.value)

  function can(code) {
    return permissions.value.includes(code)
  }

  function setSession(payload) {
    // 登录、刷新、切换角色都会整体替换 user + permissions，避免残留上一角色状态。
    user.value = payload.user
    permissions.value = payload.permissions || []
    initialized.value = true
    error.value = null
  }

  function clear() {
    user.value = null
    permissions.value = []
    navigation.value = []
  }

  async function loadNavigation() {
    // 导航必须由后端按当前角色计算；切换角色后要重新请求，不能缓存旧菜单。
    if (!user.value) {
      navigation.value = []
      return []
    }
    navigationLoading.value = true
    try {
      const payload = await api.navigation()
      navigation.value = payload.items || []
      return navigation.value
    } finally {
      navigationLoading.value = false
    }
  }

  async function load() {
    if (initialized.value) return
    loading.value = true
    error.value = null
    try {
      // 恢复会话后立即拉导航；401 视为未登录，不清除其他错误信息。
      const payload = await api.auth.me()
      setSession(payload)
      await loadNavigation()
    } catch (cause) {
      if (cause?.status !== 401) error.value = cause
      clear()
    } finally {
      initialized.value = true
      loading.value = false
    }
  }

  async function refresh() {
    const payload = await api.auth.me()
    setSession(payload)
    await loadNavigation()
  }

  async function login(credentials) {
    loading.value = true
    error.value = null
    try {
      const payload = await api.auth.login(credentials)
      setSession(payload)
      await loadNavigation()
      return payload
    } finally {
      loading.value = false
    }
  }

  async function register(payloadInput) {
    loading.value = true
    error.value = null
    try {
      const payload = await api.auth.register(payloadInput)
      setSession(payload)
      await loadNavigation()
      return payload
    } finally {
      loading.value = false
    }
  }

  async function switchRole(roleCode) {
    // 角色切换是服务端会话变更；成功后必须重新加载权限与导航，不能只改本地标签。
    if (roleCode === role.value) return
    loading.value = true
    try {
      const payload = await api.auth.switchRole(roleCode)
      setSession(payload)
      await loadNavigation()
      return payload
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await api.auth.logout()
    } catch {
      // 即使服务端退出失败，也清理本地会话，允许用户重新登录。
    } finally {
      clear()
      initialized.value = true
    }
  }

  async function updateProfile(payload) {
    const result = await api.auth.updateProfile(payload)
    setSession(result)
    return result
  }

  return {
    user,
    permissions,
    navigation,
    navigationLoading,
    initialized,
    loading,
    error,
    isAuthenticated,
    role,
    roles,
    activeRole,
    primaryRole,
    isReader,
    isStaff,
    can,
    load,
    refresh,
    loadNavigation,
    login,
    register,
    switchRole,
    logout,
    clear,
    updateProfile,
  }
})
