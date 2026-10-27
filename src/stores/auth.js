import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api } from '@/api'

export const useAuthStore = defineStore('auth', () => {
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
      // Clearing the local session still lets the user sign in again.
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
