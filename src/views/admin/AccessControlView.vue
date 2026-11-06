<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：权限定义与动态菜单管理页。
import { computed, onMounted, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { useRouter } from 'vue-router'
import { JccFormModal } from '@jcc/shared/components'
import { PlusOutlined, RightOutlined } from '@ant-design/icons-vue'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { resolveMenuIcon, MENU_ICON_OPTIONS } from '@/menu-icons'

const auth = useAuthStore()
const router = useRouter()
const activeTab = ref('permissions')
const loading = ref(true)
const permissions = ref([])
const menus = ref([])
const expandedMenuIds = ref(new Set())
const permissionKeyword = ref('')
const permissionModalOpen = ref(false)
const permissionMode = ref('create')
const editingPermission = ref(null)
const permissionInitialValues = ref({
  code: '',
  name: '',
  group: '',
  description: '',
  status: 'active',
})
const menuModalOpen = ref(false)
const menuMode = ref('create')
const editingMenu = ref(null)
const menuInitialValues = ref({
  type: 'item',
  parentId: null,
  code: '',
  title: '',
  path: '',
  icon: 'AppstoreOutlined',
  description: '',
  sortOrder: 0,
  status: 'active',
  permissions: [],
})

const permissionRules = {
  code: [
    { required: true, message: '请输入权限编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_.]{2,80}$/,
      message: '小写字母开头，仅含小写字母、数字、点和下划线',
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '请输入权限名称', trigger: 'blur' }],
  group: [{ required: true, message: '请输入权限分组', trigger: 'blur' }],
}

const menuRules = computed(() => ({
  code:
    menuMode.value === 'create'
      ? [
          { required: true, message: '请输入菜单编码', trigger: 'blur' },
          {
            pattern: /^[a-zA-Z][a-zA-Z0-9_-]{1,50}$/,
            message: '字母开头，仅含字母、数字、下划线或连字符',
            trigger: 'blur',
          },
        ]
      : [],
  title: [{ required: true, message: '请输入菜单名称', trigger: 'blur' }],
  path:
    menuInitialValues.value.type === 'item'
      ? [{ required: true, message: '请选择已注册的路由', trigger: 'change' }]
      : [],
  parentId:
    menuInitialValues.value.type === 'group'
      ? [{ required: true, message: '请选择标签分组所属模块', trigger: 'change' }]
      : [],
}))

const filteredPermissions = computed(() => {
  const keyword = permissionKeyword.value.trim().toLowerCase()
  if (!keyword) return permissions.value
  return permissions.value.filter((item) =>
    [item.code, item.name, item.group].some((value) =>
      String(value).toLowerCase().includes(keyword),
    ),
  )
})

const activePermissions = computed(() =>
  permissions.value.filter((item) => item.status === 'active'),
)

const routeOptions = computed(() => {
  // 菜单只能指向已注册的静态页面；动态详情页（含 : 参数）不能作为菜单入口。
  const seen = new Set()
  return router
    .getRoutes()
    .filter((item) => {
      if (!item.meta?.title || item.meta.public) return false
      if (item.path.includes(':') || item.path.startsWith('/modules/')) return false
      if (['forbidden', 'not-found'].includes(item.name)) return false
      if (seen.has(item.path)) return false
      seen.add(item.path)
      return true
    })
    .map((item) => ({
      value: item.path,
      label: `${item.meta.title} · ${item.path}`,
      title: item.meta.title,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'zh-CN'))
})

const parentOptions = computed(() => {
  const result = []
  function walk(nodes) {
    for (const node of nodes) {
      if (menuInitialValues.value.type === 'group' && node.type === 'module') {
        result.push({ id: node.id, label: `${node.title} · 模块` })
      }
      if (menuInitialValues.value.type === 'item' && ['module', 'group'].includes(node.type)) {
        result.push({
          id: node.id,
          label: `${node.title} · ${node.type === 'module' ? '模块' : '标签'}`,
        })
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(menus.value)
  return result
})

function menuChildren(node, type) {
  return (node.children || []).filter((child) => child.type === type)
}

function isMenuExpanded(node) {
  return expandedMenuIds.value.has(node.id)
}

function toggleMenu(node) {
  // 用新 Set 替换旧值，确保 Vue 能观察到集合变化并重新渲染。
  const next = new Set(expandedMenuIds.value)
  if (next.has(node.id)) next.delete(node.id)
  else next.add(node.id)
  expandedMenuIds.value = next
}

function expandableMenuIds(nodes) {
  const ids = new Set()
  function walk(items) {
    for (const node of items) {
      if (node.children?.length) ids.add(node.id)
      walk(node.children || [])
    }
  }
  walk(nodes)
  return ids
}

function expandAllMenus() {
  expandedMenuIds.value = expandableMenuIds(menus.value)
}

function collapseAllMenus() {
  expandedMenuIds.value = new Set()
}

function statusColor(status) {
  return status === 'active' ? 'green' : 'default'
}

async function loadPermissions() {
  const data = await api.admin.permissions()
  permissions.value = data.items
}

async function loadMenus() {
  if (!auth.can('menu.manage')) {
    menus.value = []
    collapseAllMenus()
    return
  }
  const data = await api.admin.menus()
  menus.value = data.items
  const validIds = expandableMenuIds(menus.value)
  expandedMenuIds.value = new Set([...expandedMenuIds.value].filter((id) => validIds.has(id)))
}

async function load() {
  loading.value = true
  try {
    await Promise.all([loadPermissions(), loadMenus()])
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    loading.value = false
  }
}

function openCreatePermission() {
  permissionMode.value = 'create'
  editingPermission.value = null
  permissionInitialValues.value = {
    code: '',
    name: '',
    group: '',
    description: '',
    status: 'active',
  }
  permissionModalOpen.value = true
}

function openEditPermission(record) {
  permissionMode.value = 'edit'
  editingPermission.value = record
  permissionInitialValues.value = {
    code: record.code,
    name: record.name,
    group: record.group,
    description: record.description,
    status: record.status,
  }
  permissionModalOpen.value = true
}

function submitPermission(values, { signal }) {
  if (permissionMode.value === 'create') {
    return api.admin.createPermission(
      {
        code: values.code,
        name: values.name,
        group: values.group,
        description: values.description,
      },
      { signal },
    )
  }
  return api.admin.updatePermission(
    editingPermission.value.id,
    {
      name: values.name,
      group: values.group,
      description: values.description,
      status: values.status,
    },
    { signal },
  )
}

async function afterPermissionSaved() {
  message.success(permissionMode.value === 'create' ? '权限已创建，可继续分配给角色' : '权限已更新')
  await Promise.all([loadPermissions(), auth.loadNavigation()])
}

function openMenuCreate(type, parent = null) {
  menuMode.value = 'create'
  editingMenu.value = null
  menuInitialValues.value = {
    type,
    parentId: parent?.id || null,
    code: '',
    title: '',
    path: '',
    icon:
      type === 'module'
        ? 'AppstoreOutlined'
        : type === 'group'
          ? 'FileTextOutlined'
          : 'AppstoreOutlined',
    description: '',
    sortOrder: 0,
    status: 'active',
    permissions: [],
  }
  menuModalOpen.value = true
}

function openMenuEdit(node, type) {
  menuMode.value = 'edit'
  editingMenu.value = { ...node, type }
  menuInitialValues.value = {
    type,
    parentId: node.parentId,
    code: node.code,
    title: node.title,
    path: node.path || '',
    icon: node.icon || 'AppstoreOutlined',
    description: node.description || '',
    sortOrder: node.sortOrder || 0,
    status: node.status || 'active',
    permissions: [...(node.permissions || [])],
  }
  menuModalOpen.value = true
}

function validatePath(value) {
  // 双重校验：路由表能解析出匹配记录，且路径来自当前允许的静态路由白名单。
  const match = router.resolve(value)
  return match.matched.length > 0 && routeOptions.value.some((item) => item.value === value)
}

function submitMenu(values, { signal }) {
  if (values.type === 'item' && !validatePath(values.path)) {
    throw new Error('请选择已注册且可用的路由路径')
  }
  const payload = {
    type: values.type,
    parentId: values.parentId,
    code: values.code,
    title: values.title,
    path: values.path,
    icon: values.icon,
    description: values.description,
    sortOrder: values.sortOrder,
    status: values.status,
    permissions: values.permissions,
  }
  return menuMode.value === 'create'
    ? api.admin.createMenu(payload, { signal })
    : api.admin.updateMenu(editingMenu.value.id, payload, { signal })
}

async function afterMenuSaved(result, values) {
  const autoCreated = result.autoCreated || []
  message.success(
    autoCreated.length ? `菜单已保存，并自动创建权限：${autoCreated.join('、')}` : '菜单已保存',
  )
  // 菜单改变后同时刷新权限表、菜单树和当前侧栏，保证配置立即生效。
  await Promise.all([loadMenus(), loadPermissions(), auth.loadNavigation()])
  if (menuMode.value === 'create' && values.parentId) {
    expandedMenuIds.value = new Set([...expandedMenuIds.value, values.parentId])
  }
}

function deleteMenu(node) {
  Modal.confirm({
    title: '删除菜单？',
    content: `将删除“${node.title}”。存在子菜单时不能删除。`,
    okText: '删除',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await api.admin.deleteMenu(node.id)
        message.success('菜单已删除')
        await Promise.all([loadMenus(), auth.loadNavigation()])
      } catch (error) {
        message.error(getErrorMessage(error))
      }
    },
  })
}

function permissionLabel(code) {
  const item = permissions.value.find((permission) => permission.code === code)
  return item ? item.name : code
}

onMounted(load)
</script>

<template>
  <PagePanel title="权限与菜单">
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="permissions" tab="权限管理">
        <div class="access-toolbar">
          <a-button type="primary" @click="openCreatePermission">
            <PlusOutlined />新增权限
          </a-button>
          <div class="access-toolbar__search">
            <a-input
              v-model:value="permissionKeyword"
              class="filter-field--wide"
              placeholder="搜索权限编码、名称或分组"
              allow-clear
            />
            <span class="muted small">共 {{ filteredPermissions.length }} 个权限</span>
          </div>
        </div>
        <div class="access-table-scroll">
          <a-spin :spinning="loading">
            <a-table
              size="small"
              bordered
              :data-source="filteredPermissions"
              :pagination="false"
              row-key="id"
            >
              <a-table-column title="分组" data-index="group" key="group" width="100" />
              <a-table-column title="权限编码" key="code" width="190">
                <template #default="{ record }"
                  ><code>{{ record.code }}</code></template
                >
              </a-table-column>
              <a-table-column title="名称" data-index="name" key="name" />
              <a-table-column title="说明" data-index="description" key="description" />
              <a-table-column title="类型" key="system" width="90">
                <template #default="{ record }">
                  <a-tag :color="record.isSystem ? 'blue' : 'default'">
                    {{ record.isSystem ? '内置' : '自定义' }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="状态" key="status" width="90">
                <template #default="{ record }">
                  <a-tag :color="statusColor(record.status)">
                    {{ record.status === 'active' ? '启用' : '停用' }}
                  </a-tag>
                </template>
              </a-table-column>
              <a-table-column title="操作" key="action" width="90" fixed="right">
                <template #default="{ record }">
                  <a-button type="link" size="small" @click="openEditPermission(record)">
                    编辑
                  </a-button>
                </template>
              </a-table-column>
            </a-table>
          </a-spin>
        </div>
      </a-tab-pane>

      <a-tab-pane key="menus" tab="菜单管理">
        <div v-if="auth.can('menu.manage')" class="access-toolbar">
          <a-space wrap>
            <a-button @click="openMenuCreate('module')"><PlusOutlined />新增模块</a-button>
            <a-button type="primary" @click="openMenuCreate('item')"
              ><PlusOutlined />新增功能</a-button
            >
          </a-space>
        </div>
        <a-alert
          v-if="!auth.can('menu.manage')"
          type="warning"
          show-icon
          message="当前角色没有菜单管理权限"
        />
        <div v-else class="access-menu-scroll">
          <a-spin :spinning="loading">
            <div v-if="menus.length" class="menu-tree-toolbar">
              <a-button size="small" @click="expandAllMenus">全部展开</a-button>
              <a-button size="small" @click="collapseAllMenus">全部收起</a-button>
            </div>
            <a-empty v-if="!menus.length" description="暂无菜单，可新增模块" />
            <div v-for="moduleNode in menus" :key="moduleNode.id" class="menu-block">
              <div
                class="menu-row menu-row--module"
                :class="{
                  'is-disabled': moduleNode.status !== 'active',
                  'is-expandable': moduleNode.children?.length,
                }"
                @click="moduleNode.children?.length && toggleMenu(moduleNode)"
              >
                <button
                  v-if="moduleNode.children?.length"
                  type="button"
                  class="menu-toggle"
                  :aria-label="`${isMenuExpanded(moduleNode) ? '收起' : '展开'}${moduleNode.title}`"
                  :aria-expanded="isMenuExpanded(moduleNode)"
                  @click.stop="toggleMenu(moduleNode)"
                >
                  <RightOutlined :class="{ 'is-expanded': isMenuExpanded(moduleNode) }" />
                </button>
                <span v-else class="menu-toggle menu-toggle--placeholder" aria-hidden="true" />
                <span class="menu-row__icon">
                  <component :is="resolveMenuIcon(moduleNode.icon)" />
                </span>
                <div class="menu-row__main">
                  <strong>{{ moduleNode.title }}</strong>
                  <span class="menu-meta">
                    <a-tag :color="moduleNode.type === 'module' ? 'blue' : 'default'">
                      {{ moduleNode.type === 'module' ? '模块' : '功能' }}
                    </a-tag>
                    <code>{{ moduleNode.code }}</code>
                    <code v-if="moduleNode.path">{{ moduleNode.path }}</code>
                    <a-tag :color="statusColor(moduleNode.status)">
                      {{ moduleNode.status === 'active' ? '启用' : '停用' }}
                    </a-tag>
                  </span>
                  <span v-if="moduleNode.permissions.length" class="menu-perms">
                    权限：{{ moduleNode.permissions.map(permissionLabel).join('、') }}
                  </span>
                </div>
                <div class="menu-actions" @click.stop>
                  <a-button
                    v-if="moduleNode.type === 'module'"
                    type="link"
                    size="small"
                    @click="openMenuCreate('group', moduleNode)"
                  >
                    加标签
                  </a-button>
                  <a-button
                    v-if="moduleNode.type === 'module'"
                    type="link"
                    size="small"
                    @click="openMenuCreate('item', moduleNode)"
                  >
                    加功能
                  </a-button>
                  <a-button
                    type="link"
                    size="small"
                    @click="openMenuEdit(moduleNode, moduleNode.type)"
                  >
                    编辑
                  </a-button>
                  <a-button type="link" size="small" danger @click="deleteMenu(moduleNode)">
                    删除
                  </a-button>
                </div>
              </div>

              <div
                v-if="moduleNode.children?.length && isMenuExpanded(moduleNode)"
                :id="`menu-children-${moduleNode.id}`"
                class="menu-children"
              >
                <div
                  v-for="groupNode in menuChildren(moduleNode, 'group')"
                  :key="groupNode.id"
                  class="menu-block menu-block--group"
                >
                  <div
                    class="menu-row menu-row--group"
                    :class="{
                      'is-disabled': groupNode.status !== 'active',
                      'is-expandable': groupNode.children?.length,
                    }"
                    @click="groupNode.children?.length && toggleMenu(groupNode)"
                  >
                    <button
                      v-if="groupNode.children?.length"
                      type="button"
                      class="menu-toggle"
                      :aria-label="`${isMenuExpanded(groupNode) ? '收起' : '展开'}${groupNode.title}`"
                      :aria-expanded="isMenuExpanded(groupNode)"
                      @click.stop="toggleMenu(groupNode)"
                    >
                      <RightOutlined :class="{ 'is-expanded': isMenuExpanded(groupNode) }" />
                    </button>
                    <span v-else class="menu-toggle menu-toggle--placeholder" aria-hidden="true" />
                    <span class="menu-row__icon">
                      <component :is="resolveMenuIcon(groupNode.icon)" />
                    </span>
                    <div class="menu-row__main">
                      <strong>{{ groupNode.title }}</strong>
                      <span class="menu-meta">
                        <a-tag color="purple">标签分组</a-tag>
                        <code>{{ groupNode.code }}</code>
                        <a-tag :color="statusColor(groupNode.status)">
                          {{ groupNode.status === 'active' ? '启用' : '停用' }}
                        </a-tag>
                      </span>
                      <span v-if="groupNode.permissions.length" class="menu-perms">
                        权限：{{ groupNode.permissions.map(permissionLabel).join('、') }}
                      </span>
                    </div>
                    <div class="menu-actions" @click.stop>
                      <a-button type="link" size="small" @click="openMenuCreate('item', groupNode)">
                        加功能
                      </a-button>
                      <a-button type="link" size="small" @click="openMenuEdit(groupNode, 'group')">
                        编辑
                      </a-button>
                      <a-button type="link" size="small" danger @click="deleteMenu(groupNode)">
                        删除
                      </a-button>
                    </div>
                  </div>
                  <div
                    v-if="groupNode.children?.length && isMenuExpanded(groupNode)"
                    :id="`menu-children-${groupNode.id}`"
                  >
                    <div
                      v-for="itemNode in menuChildren(groupNode, 'item')"
                      :key="itemNode.id"
                      class="menu-row menu-row--item"
                      :class="{ 'is-disabled': itemNode.status !== 'active' }"
                    >
                      <span class="menu-row__icon">
                        <component :is="resolveMenuIcon(itemNode.icon)" />
                      </span>
                      <div class="menu-row__main">
                        <strong>{{ itemNode.title }}</strong>
                        <span class="menu-meta">
                          <a-tag>功能</a-tag>
                          <code>{{ itemNode.code }}</code>
                          <code>{{ itemNode.path }}</code>
                          <a-tag :color="statusColor(itemNode.status)">
                            {{ itemNode.status === 'active' ? '启用' : '停用' }}
                          </a-tag>
                        </span>
                        <span v-if="itemNode.permissions.length" class="menu-perms">
                          权限：{{ itemNode.permissions.map(permissionLabel).join('、') }}
                        </span>
                      </div>
                      <div class="menu-actions">
                        <a-button type="link" size="small" @click="openMenuEdit(itemNode, 'item')">
                          编辑
                        </a-button>
                        <a-button type="link" size="small" danger @click="deleteMenu(itemNode)">
                          删除
                        </a-button>
                      </div>
                    </div>
                  </div>
                </div>

                <div
                  v-for="itemNode in menuChildren(moduleNode, 'item')"
                  :key="`direct-${itemNode.id}`"
                  class="menu-row menu-row--item"
                  :class="{ 'is-disabled': itemNode.status !== 'active' }"
                >
                  <span class="menu-row__icon">
                    <component :is="resolveMenuIcon(itemNode.icon)" />
                  </span>
                  <div class="menu-row__main">
                    <strong>{{ itemNode.title }}</strong>
                    <span class="menu-meta">
                      <a-tag>功能</a-tag>
                      <code>{{ itemNode.code }}</code>
                      <code>{{ itemNode.path }}</code>
                      <a-tag :color="statusColor(itemNode.status)">
                        {{ itemNode.status === 'active' ? '启用' : '停用' }}
                      </a-tag>
                    </span>
                    <span v-if="itemNode.permissions.length" class="menu-perms">
                      权限：{{ itemNode.permissions.map(permissionLabel).join('、') }}
                    </span>
                  </div>
                  <div class="menu-actions">
                    <a-button type="link" size="small" @click="openMenuEdit(itemNode, 'item')">
                      编辑
                    </a-button>
                    <a-button type="link" size="small" danger @click="deleteMenu(itemNode)">
                      删除
                    </a-button>
                  </div>
                </div>
              </div>
            </div>
          </a-spin>
        </div>
      </a-tab-pane>
    </a-tabs>

    <JccFormModal
      v-model:open="permissionModalOpen"
      :title="permissionMode === 'create' ? '新增权限' : '编辑权限'"
      :initial-values="permissionInitialValues"
      :rules="permissionRules"
      :submit="submitPermission"
      @saved="afterPermissionSaved"
    >
      <template #default="{ model }">
        <a-form-item
          label="权限编码"
          name="code"
          extra="编码创建后不可修改；菜单表单可直接输入新编码自动创建权限"
        >
          <a-input v-model:value="model.code" :disabled="permissionMode === 'edit'" />
        </a-form-item>
        <div class="form-grid">
          <a-form-item label="权限名称" name="name">
            <a-input v-model:value="model.name" />
          </a-form-item>
          <a-form-item label="分组" name="group">
            <a-input v-model:value="model.group" placeholder="如 馆藏、系统" />
          </a-form-item>
        </div>
        <a-form-item label="说明" name="description">
          <a-textarea v-model:value="model.description" :rows="2" />
        </a-form-item>
        <a-form-item v-if="permissionMode === 'edit'" label="状态">
          <a-select v-model:value="model.status" :disabled="editingPermission?.isSystem">
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="disabled">停用</a-select-option>
          </a-select>
          <div v-if="editingPermission?.isSystem" class="form-help">内置权限不能停用。</div>
        </a-form-item>
      </template>
    </JccFormModal>

    <JccFormModal
      v-model:open="menuModalOpen"
      :title="menuMode === 'create' ? '新增菜单' : '编辑菜单'"
      :initial-values="menuInitialValues"
      :rules="menuRules"
      :submit="submitMenu"
      width="min(760px, 94vw)"
      @saved="afterMenuSaved"
    >
      <template #default="{ model }">
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12">
            <a-form-item label="菜单类型">
              <a-input
                :value="{ module: '模块', group: '标签分组', item: '功能菜单' }[model.type]"
                disabled
              />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="菜单编码" name="code" extra="创建后不可修改">
              <a-input v-model:value="model.code" :disabled="menuMode === 'edit'" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12">
            <a-form-item label="菜单名称" name="title">
              <a-input v-model:value="model.title" />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="图标">
              <a-select v-model:value="model.icon" show-search>
                <a-select-option v-for="icon in MENU_ICON_OPTIONS" :key="icon" :value="icon">
                  {{ icon }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item v-if="model.type !== 'module'" label="上级菜单" name="parentId">
          <a-select
            v-model:value="model.parentId"
            placeholder="选择上级"
            allow-clear
            :disabled="menuMode === 'edit'"
          >
            <a-select-option v-for="item in parentOptions" :key="item.id" :value="item.id">
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item
          v-if="model.type === 'item'"
          label="路由路径"
          name="path"
          :extra="`只能选择当前工程已注册且不是动态参数的路由（当前 ${routeOptions.length} 个）`"
        >
          <a-select
            v-model:value="model.path"
            show-search
            option-filter-prop="label"
            placeholder="选择页面路由"
          >
            <a-select-option
              v-for="item in routeOptions"
              :key="item.value"
              :value="item.value"
              :label="item.label"
            >
              {{ item.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model:value="model.description" :rows="2" />
        </a-form-item>
        <a-row :gutter="16">
          <a-col :xs="24" :sm="12">
            <a-form-item label="排序">
              <a-input-number
                v-model:value="model.sortOrder"
                :min="0"
                :max="9999"
                style="width: 100%"
              />
            </a-form-item>
          </a-col>
          <a-col :xs="24" :sm="12">
            <a-form-item label="状态">
              <a-select v-model:value="model.status">
                <a-select-option value="active">启用</a-select-option>
                <a-select-option value="disabled">停用</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item
          label="绑定权限"
          extra="可输入新的权限编码，保存时会自动创建；拥有任一权限即可看到此菜单"
        >
          <a-select
            v-model:value="model.permissions"
            mode="tags"
            placeholder="输入权限编码或选择已有权限"
            :options="
              permissions.map((item) => ({
                value: item.code,
                label: `${item.name} · ${item.code}`,
              }))
            "
          />
        </a-form-item>
        <div v-if="model.permissions.length" class="menu-permission-preview">
          <a-tag v-for="code in model.permissions" :key="code" color="blue">
            {{ permissionLabel(code) }}
          </a-tag>
        </div>
      </template>
    </JccFormModal>
  </PagePanel>
</template>

<style scoped>
.access-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
}
.access-toolbar__search {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
  margin-left: auto;
}
.access-table-scroll,
.access-menu-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.access-menu-scroll {
  padding-right: 4px;
}
.menu-tree-toolbar {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-bottom: 12px;
}
.menu-block {
  margin-bottom: 14px;
}
.menu-block--group {
  margin: 6px 0 0 30px;
  padding-left: 14px;
  border-left: 1px solid var(--color-border);
}
.menu-row {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 13px 14px;
  margin-bottom: 6px;
  background: #fbfcff;
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
}
.menu-row--module {
  background: #f2f6ff;
  border-color: #d5e2ff;
}
.menu-row--group {
  background: #f8f7ff;
  border-color: #e6e1ff;
}
.menu-row--item {
  margin-left: 30px;
  background: #fff;
}
.menu-row.is-expandable {
  cursor: pointer;
}
.menu-row.is-expandable:hover {
  border-color: var(--color-primary);
}
.menu-row.is-disabled {
  opacity: 0.55;
}
.menu-toggle {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  padding: 0;
  color: var(--color-text-muted);
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: pointer;
}
.menu-toggle:hover,
.menu-toggle:focus-visible {
  color: var(--color-primary);
  background: var(--color-primary-soft);
}
.menu-toggle:focus-visible {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}
.menu-toggle .anticon {
  transition: transform 0.2s ease;
}
.menu-toggle .anticon.is-expanded {
  transform: rotate(90deg);
}
.menu-toggle--placeholder {
  pointer-events: none;
}
.menu-row__icon {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  color: var(--color-primary);
  background: var(--color-primary-soft);
  border-radius: 8px;
}
.menu-row__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}
.menu-row__main strong {
  font-size: 14px;
}
.menu-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  color: var(--color-text-muted);
  font-size: 12px;
}
.menu-meta code {
  color: var(--color-text-muted);
  font-size: 11px;
}
.menu-perms {
  color: var(--color-text-muted);
  font-size: 12px;
}
.menu-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  flex-shrink: 0;
}
.menu-actions .ant-btn {
  padding-inline: 4px;
}
.menu-permission-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
@media (max-width: 760px) {
  .menu-block--group {
    margin-left: 10px;
  }
  .menu-row--item {
    margin-left: 10px;
  }
  .menu-actions {
    width: 100%;
    justify-content: flex-start;
  }
  .menu-row {
    flex-wrap: wrap;
  }
}
</style>
