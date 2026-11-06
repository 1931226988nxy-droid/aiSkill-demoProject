<script setup>
import PagePanel from '@/components/PagePanel.vue'
// 文件职责：馆员账号多角色、主角色、角色权限和用户状态管理页。
import { computed, onMounted, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { JccFormModal, JccQueryBar, JccTable } from '@jcc/shared/components'
import { useTableQuery } from '@jcc/shared/hooks'
import { api } from '@/api'
import { getErrorMessage } from '@/api/client'
import { useAuthStore } from '@/stores/auth'
import { ROLE_LABELS, USER_STATUS_META } from '@/constants'
import { formatDateTime } from '@/utils'
import StatusTag from '@/components/StatusTag.vue'

const auth = useAuthStore()
const activeTab = ref('users')
const roles = ref([])
const permissions = ref([])
const selectedRoleId = ref(null)
const permissionChecks = reactive({})
const savingPermissions = ref(false)
const roleModalOpen = ref(false)
const roleInitialValues = { code: '', name: '', description: '' }
const userModalOpen = ref(false)
const userMode = ref('create')
const editingUser = ref(null)
const userInitialValues = ref({
  username: '',
  password: '',
  displayName: '',
  roleCodes: [],
  primaryRoleCode: '',
  status: 'active',
})

const userColumns = [
  { title: '账号', key: 'user', width: 220 },
  { title: '角色', key: 'role', width: 250 },
  { title: '状态', key: 'status', width: 90 },
  { title: '最近登录', key: 'lastLoginAt', width: 170 },
  { title: '创建时间', key: 'createdAt', width: 160 },
  { title: '操作', key: 'action', width: 200, fixed: 'right' },
]

const selectedRole = computed(() => roles.value.find((role) => role.id === selectedRoleId.value))
const permissionGroups = computed(() => {
  // 停用权限不进入授权矩阵，保存时也不会被重新勾选。
  const groups = {}
  for (const permission of permissions.value.filter((item) => item.status === 'active')) {
    if (!groups[permission.group]) groups[permission.group] = []
    groups[permission.group].push(permission)
  }
  return groups
})

const userRules = computed(() => ({
  username:
    userMode.value === 'create'
      ? [
          { required: true, message: '请输入用户名', trigger: 'blur' },
          {
            pattern: /^[A-Za-z0-9_]{3,32}$/,
            message: '3-32 位字母、数字或下划线',
            trigger: 'blur',
          },
        ]
      : [],
  password:
    userMode.value === 'create'
      ? [
          { required: true, message: '请设置登录密码', trigger: 'blur' },
          { min: 8, message: '密码至少 8 位', trigger: 'blur' },
        ]
      : [],
  displayName: [{ required: true, message: '请输入姓名', trigger: 'blur' }],
  roleCodes: [
    { required: true, type: 'array', min: 1, message: '请至少选择一个角色', trigger: 'change' },
  ],
  primaryRoleCode: [{ required: true, message: '请选择主角色', trigger: 'change' }],
}))
const roleRules = {
  code: [
    { required: true, message: '请输入角色编码', trigger: 'blur' },
    {
      pattern: /^[a-z][a-z0-9_]{2,39}$/,
      message: '小写字母开头，3-40 位小写字母、数字或下划线',
      trigger: 'blur',
    },
  ],
  name: [{ required: true, message: '请输入角色名称', trigger: 'blur' }],
}

const {
  filters,
  page,
  pageSize,
  items,
  total,
  loading,
  error,
  refresh,
  search,
  reset,
  changePage,
} = useTableQuery({
  initialFilters: { q: '', roleCode: undefined, status: 'all' },
  pageSize: 10,
  fetcher: ({ page: pageValue, pageSize: sizeValue, filters: query, signal }) =>
    api.admin.users(
      {
        page: pageValue,
        pageSize: sizeValue,
        q: query.q || undefined,
        roleCode: query.roleCode || undefined,
        status: query.status === 'all' ? undefined : query.status,
      },
      { signal },
    ),
})

async function loadMeta() {
  // 角色与权限清单一起加载；角色页的权限矩阵依赖两者对齐。
  const [roleData, permissionData] = await Promise.all([api.admin.roles(), api.admin.permissions()])
  roles.value = roleData.items
  permissions.value = permissionData.items
  // 刷新时保留当前选中角色，避免保存权限后跳回默认角色。
  if (selectedRoleId.value) {
    const keep = roles.value.find((role) => role.id === selectedRoleId.value)
    if (keep) selectRole(keep)
  } else if (roles.value.length) {
    selectRole(roles.value.find((role) => role.code === 'librarian') || roles.value[0])
  }
}

function selectRole(role) {
  selectedRoleId.value = role.id
  for (const permission of permissions.value) {
    permissionChecks[permission.code] = role.permissions.includes(permission.code)
  }
}

function openCreateUser() {
  userMode.value = 'create'
  editingUser.value = null
  const defaultRole = roles.value.find((role) => role.code === 'librarian') || roles.value[0]
  userInitialValues.value = {
    username: '',
    password: '',
    displayName: '',
    roleCodes: defaultRole ? [defaultRole.code] : [],
    primaryRoleCode: defaultRole?.code || '',
    status: 'active',
  }
  userModalOpen.value = true
}

function openEditUser(record) {
  userMode.value = 'edit'
  editingUser.value = record
  userInitialValues.value = {
    username: record.username,
    password: '',
    displayName: record.displayName,
    roleCodes: (record.roles || []).map((role) => role.code),
    primaryRoleCode: record.primaryRoleCode || record.role.code,
    status: record.status,
  }
  userModalOpen.value = true
}

function handleRolesChange(codes, model) {
  // 取消勾选当前主角色时，自动把主角色切到剩余的第一个角色。
  if (!codes.includes(model.primaryRoleCode)) {
    model.primaryRoleCode = codes[0] || ''
  }
}

function submitUser(values, { signal }) {
  if (userMode.value === 'create') {
    return api.admin.createUser(
      {
        username: values.username,
        password: values.password,
        displayName: values.displayName,
        roleCodes: values.roleCodes,
        primaryRoleCode: values.primaryRoleCode,
      },
      { signal },
    )
  }
  return api.admin.updateUser(
    editingUser.value.id,
    {
      displayName: values.displayName,
      roleCodes: values.roleCodes,
      primaryRoleCode: values.primaryRoleCode,
      status: values.status,
    },
    { signal },
  )
}

async function afterUserSaved() {
  message.success(userMode.value === 'create' ? '账号已创建' : '账号已更新')
  await refresh()
  // 管理员修改自己的姓名等资料后，顶栏/权限态需要同步刷新。
  if (auth.user?.id === editingUser.value?.id) await auth.refresh()
}

function resetPassword(record) {
  Modal.confirm({
    title: '重置登录密码？',
    content: `将重置 ${record.displayName}（${record.username}）的密码，并使该账号现有登录会话失效。`,
    okText: '确认重置',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        const result = await api.admin.resetPassword(record.id, {})
        Modal.success({
          title: '密码已重置',
          content: `临时密码：${result.temporaryPassword}。请立即通过安全方式告知本人，并提醒其登录后修改密码。`,
        })
      } catch (error) {
        message.error(getErrorMessage(error))
      }
    },
  })
}

async function savePermissions() {
  // 管理员角色权限由代码固定为“全部启用权限”，前端也禁止提交。
  if (!selectedRole.value || selectedRole.value.code === 'admin') return
  savingPermissions.value = true
  try {
    const codes = permissions.value
      .filter((permission) => permissionChecks[permission.code])
      .map((permission) => permission.code)
    await api.admin.setRolePermissions(selectedRole.value.id, codes)
    message.success('角色权限已保存')
    // 重新拉取角色，防止后端基于当前操作者权限裁剪后前端仍显示旧勾选。
    const keepId = selectedRole.value.id
    await loadMeta()
    selectedRoleId.value = keepId
    selectRole(roles.value.find((role) => role.id === keepId))
  } catch (error) {
    message.error(getErrorMessage(error))
  } finally {
    savingPermissions.value = false
  }
}

function createRole(values, { signal }) {
  return api.admin.createRole(values, { signal })
}

async function afterRoleSaved(role) {
  message.success('角色已创建')
  await loadMeta()
  selectRole(roles.value.find((item) => item.id === role.id) || roles.value[0])
}

function deleteRole() {
  if (!selectedRole.value) return
  Modal.confirm({
    title: '删除角色？',
    content: `将删除角色“${selectedRole.value.name}”。仅当角色没有关联账号时允许删除。`,
    okText: '删除',
    okButtonProps: { danger: true },
    onOk: async () => {
      try {
        await api.admin.deleteRole(selectedRole.value.id)
        message.success('角色已删除')
        selectedRoleId.value = null
        await loadMeta()
      } catch (error) {
        message.error(getErrorMessage(error))
      }
    },
  })
}

onMounted(async () => {
  try {
    await loadMeta()
  } catch (error) {
    message.error(getErrorMessage(error))
  }
  await refresh()
})
</script>

<template>
  <PagePanel title="账号与角色">
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="users" tab="馆员账号">
        <JccQueryBar :loading="loading" @search="search" @reset="reset">
          <template #actions>
            <a-button type="primary" @click="openCreateUser">新增馆员账号</a-button>
          </template>
          <a-input
            v-model:value="filters.q"
            class="filter-field"
            placeholder="用户名 / 姓名"
            allow-clear
          />
          <a-select
            v-model:value="filters.roleCode"
            class="filter-field"
            placeholder="全部角色"
            allow-clear
          >
            <a-select-option v-for="role in roles" :key="role.code" :value="role.code">
              {{ role.name }}
            </a-select-option>
          </a-select>
          <a-select v-model:value="filters.status" class="filter-field" aria-label="账号状态">
            <a-select-option value="all">全部状态</a-select-option>
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="disabled">停用</a-select-option>
          </a-select>
        </JccQueryBar>

        <JccTable
          :columns="userColumns"
          :data-source="items"
          :page="page"
          :page-size="pageSize"
          :total="total"
          :loading="loading"
          :error="error"
          row-key="id"
          :scroll="{ x: 1000 }"
          @page-change="changePage"
          @retry="refresh"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'user'">
              <div>{{ record.displayName }}</div>
              <div class="muted small">{{ record.username }}</div>
            </template>
            <template v-else-if="column.key === 'role'">
              <a-space wrap :size="4">
                <a-tag
                  v-for="role in record.roles || []"
                  :key="role.code"
                  :color="role.code === record.primaryRoleCode ? 'blue' : 'default'"
                >
                  {{ ROLE_LABELS[role.code] || role.name }}
                  <span v-if="role.code === record.primaryRoleCode">（主）</span>
                </a-tag>
              </a-space>
            </template>
            <template v-else-if="column.key === 'status'">
              <StatusTag :status="record.status" :map="USER_STATUS_META" />
            </template>
            <template v-else-if="column.key === 'lastLoginAt'">
              {{ record.lastLoginAt ? formatDateTime(record.lastLoginAt) : '从未登录' }}
            </template>
            <template v-else-if="column.key === 'createdAt'">
              {{ formatDateTime(record.createdAt, { dateOnly: true }) }}
            </template>
            <template v-else-if="column.key === 'action'">
              <div class="table-actions">
                <a-button type="link" size="small" @click="openEditUser(record)">编辑</a-button>
                <a-button
                  v-if="record.id !== auth.user?.id"
                  type="link"
                  size="small"
                  @click="resetPassword(record)"
                >
                  重置密码
                </a-button>
              </div>
            </template>
          </template>
        </JccTable>
      </a-tab-pane>

      <a-tab-pane key="roles" tab="角色权限">
        <div class="panel-extra">
          <a-button type="primary" @click="roleModalOpen = true">新增角色</a-button>
        </div>
        <div class="role-layout">
          <aside class="role-list">
            <button
              v-for="role in roles"
              :key="role.id"
              type="button"
              class="role-card"
              :class="{ 'role-card--active': role.id === selectedRoleId }"
              @click="selectRole(role)"
            >
              <strong>{{ role.name }}</strong>
              <span>{{ role.code }} · {{ role.userCount }} 个账号</span>
              <a-tag v-if="role.builtIn" size="small">内置</a-tag>
            </button>
          </aside>

          <section class="role-detail">
            <template v-if="selectedRole">
              <div class="page-toolbar">
                <div>
                  <h3 style="margin: 0">{{ selectedRole.name }}</h3>
                  <div class="muted small">{{ selectedRole.description || '未填写说明' }}</div>
                </div>
                <a-space>
                  <a-button
                    v-if="!selectedRole.builtIn && selectedRole.userCount === 0"
                    danger
                    @click="deleteRole"
                  >
                    删除角色
                  </a-button>
                  <a-button
                    type="primary"
                    :loading="savingPermissions"
                    :disabled="selectedRole.code === 'admin'"
                    @click="savePermissions"
                  >
                    保存权限
                  </a-button>
                </a-space>
              </div>

              <a-alert
                v-if="selectedRole.code === 'admin'"
                type="info"
                show-icon
                message="管理员拥有全部业务与系统权限，权限不可修改。"
                style="margin: 14px 0"
              />
              <a-alert
                v-else
                type="warning"
                show-icon
                message="权限变更只影响该角色下账号的下一次请求，后端会即时校验。"
                style="margin: 14px 0"
              />

              <div class="permission-groups">
                <div
                  v-for="(groupPermissions, group) in permissionGroups"
                  :key="group"
                  class="permission-group"
                >
                  <h4>{{ group }}</h4>
                  <div class="permission-checks">
                    <a-checkbox
                      v-for="permission in groupPermissions"
                      :key="permission.code"
                      v-model:checked="permissionChecks[permission.code]"
                      :disabled="selectedRole.code === 'admin'"
                    >
                      {{ permission.name }}
                      <span class="muted small">{{ permission.code }}</span>
                    </a-checkbox>
                  </div>
                </div>
              </div>
            </template>
            <a-empty v-else description="请选择角色" />
          </section>
        </div>
      </a-tab-pane>
    </a-tabs>

    <JccFormModal
      v-model:open="userModalOpen"
      :title="userMode === 'create' ? '新增馆员账号' : '编辑账号'"
      :initial-values="userInitialValues"
      :rules="userRules"
      :submit="submitUser"
      @saved="afterUserSaved"
    >
      <template #default="{ model }">
        <a-form-item label="用户名" name="username">
          <a-input v-model:value="model.username" :disabled="userMode === 'edit'" />
        </a-form-item>
        <a-form-item v-if="userMode === 'create'" label="初始密码" name="password">
          <a-input-password v-model:value="model.password" autocomplete="new-password" />
        </a-form-item>
        <a-form-item label="姓名" name="displayName">
          <a-input v-model:value="model.displayName" />
        </a-form-item>
        <a-form-item label="角色（可多选）" name="roleCodes">
          <a-select
            v-model:value="model.roleCodes"
            mode="multiple"
            placeholder="选择角色，至少一个"
            :disabled="editingUser?.id === auth.user?.id"
            @change="(codes) => handleRolesChange(codes, model)"
          >
            <a-select-option v-for="role in roles" :key="role.code" :value="role.code">
              {{ role.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item
          label="主角色"
          name="primaryRoleCode"
          extra="登录后默认使用主角色，可在右上角切换其他角色"
        >
          <a-select
            v-model:value="model.primaryRoleCode"
            placeholder="选择主角色"
            :disabled="editingUser?.id === auth.user?.id"
          >
            <a-select-option
              v-for="role in roles.filter((item) => model.roleCodes.includes(item.code))"
              :key="role.code"
              :value="role.code"
            >
              {{ role.name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="userMode === 'edit'" label="账号状态">
          <a-select v-model:value="model.status" :disabled="editingUser?.id === auth.user?.id">
            <a-select-option value="active">启用</a-select-option>
            <a-select-option value="disabled">停用</a-select-option>
          </a-select>
        </a-form-item>
      </template>
    </JccFormModal>

    <JccFormModal
      v-model:open="roleModalOpen"
      title="新增角色"
      :initial-values="roleInitialValues"
      :rules="roleRules"
      :submit="createRole"
      @saved="afterRoleSaved"
    >
      <template #default="{ model }">
        <a-form-item label="角色编码" name="code" extra="小写字母开头，仅含小写字母、数字、下划线">
          <a-input v-model:value="model.code" placeholder="如 assistant" />
        </a-form-item>
        <a-form-item label="角色名称" name="name">
          <a-input v-model:value="model.name" placeholder="如 助理馆员" />
        </a-form-item>
        <a-form-item label="说明">
          <a-textarea v-model:value="model.description" :rows="3" />
        </a-form-item>
      </template>
    </JccFormModal>
  </PagePanel>
</template>

<style scoped>
.role-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.role-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.role-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
  width: 100%;
  padding: 12px 14px;
  color: var(--color-text);
  text-align: left;
  background: #fbfcff;
  border: 1px solid var(--color-border-soft);
  border-radius: 10px;
  cursor: pointer;
}
.role-card span {
  color: var(--color-text-muted);
  font-size: 12px;
}
.role-card--active {
  background: var(--color-selection);
  border-color: var(--color-primary);
}
.role-detail {
  min-width: 0;
}
.permission-groups {
  display: grid;
  gap: 18px;
}
.permission-group h4 {
  margin: 0 0 8px;
  color: var(--color-text-muted);
  font-size: 13px;
}
.permission-checks {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px 16px;
}
.permission-checks .muted {
  margin-left: 4px;
}
@media (max-width: 900px) {
  .role-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .role-list {
    flex-direction: row;
    flex-wrap: wrap;
  }
  .role-card {
    width: calc(50% - 4px);
  }
  .permission-checks {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
