/**
 * 文件职责：内置权限、角色、系统参数和业务状态常量。
 */

// 内置权限清单。system=true 的权限不允许在后台停用；部署新增权限时会由 seed 自动补齐。
export const PERMISSIONS = [
  { code: 'book.read', name: '检索与查看图书', group: '馆藏', system: true },
  { code: 'book.manage', name: '图书编目与上下架', group: '馆藏', system: true },
  { code: 'copy.manage', name: '馆藏副本管理', group: '馆藏', system: true },
  { code: 'reader.manage', name: '读者管理', group: '读者', system: true },
  { code: 'reader.loans.view', name: '查看我的借阅', group: '读者', system: true },
  { code: 'reader.reservations.view', name: '查看我的预约', group: '读者', system: true },
  { code: 'reader.fees.view', name: '查看我的费用', group: '读者', system: true },
  { code: 'circulation.manage', name: '借书、还书与异常处理', group: '借阅', system: true },
  { code: 'reservation.manage', name: '预约队列处理', group: '借阅', system: true },
  { code: 'fee.manage', name: '费用处理', group: '借阅', system: true },
  { code: 'report.view', name: '统计报表', group: '管理', system: true },
  { code: 'announcement.manage', name: '公告管理', group: '管理', system: true },
  { code: 'user.manage', name: '馆员账号与角色权限', group: '系统', system: true },
  { code: 'permission.manage', name: '权限定义管理', group: '系统', system: true },
  { code: 'menu.manage', name: '导航菜单管理', group: '系统', system: true },
  { code: 'settings.manage', name: '系统参数配置', group: '系统', system: true },
  { code: 'audit.view', name: '审计日志', group: '系统', system: true },
]

// 首次建库的内置角色及初始授权。管理员实际权限始终由代码动态取全部启用权限。
export const ROLE_DEFINITIONS = [
  {
    code: 'admin',
    name: '管理员',
    description: '系统管理、账号权限、配置与全部业务权限',
    builtIn: true,
    permissions: PERMISSIONS.map((item) => item.code),
  },
  {
    code: 'librarian',
    name: '馆员',
    description: '编目、馆藏、借阅、预约、读者与费用处理',
    builtIn: true,
    permissions: [
      'book.read',
      'book.manage',
      'copy.manage',
      'reader.manage',
      'circulation.manage',
      'reservation.manage',
      'fee.manage',
      'report.view',
    ],
  },
  {
    code: 'reader',
    name: '读者',
    description: '检索馆藏并办理自助借阅相关业务',
    builtIn: true,
    permissions: [
      'book.read',
      'reader.loans.view',
      'reader.reservations.view',
      'reader.fees.view',
    ],
  },
]

// 系统参数默认值：金额使用“分”，日期范围使用自然日；数据库只存字符串，由 settings 服务还原类型。
export const DEFAULT_SETTINGS = [
  {
    key: 'library_name',
    value: '云澜图书馆',
    type: 'string',
    label: '图书馆名称',
    description: '显示在工作台和公告中的馆名',
  },
  {
    key: 'loan_days',
    value: '30',
    type: 'integer',
    label: '借阅期限（天）',
    description: '借出后自动计算应还日期',
  },
  {
    key: 'max_borrow',
    value: '5',
    type: 'integer',
    label: '借阅上限（册）',
    description: '每位读者同时可借的图书数量',
  },
  {
    key: 'max_renewals',
    value: '2',
    type: 'integer',
    label: '最大续借次数',
    description: '每笔借阅允许续借的次数',
  },
  {
    key: 'renewal_days',
    value: '30',
    type: 'integer',
    label: '每次续借天数',
    description: '续借后应还日期顺延的自然日数',
  },
  {
    key: 'reservation_hold_days',
    value: '3',
    type: 'integer',
    label: '预约保留期限（天）',
    description: '预约到书后为读者保留的天数',
  },
  {
    key: 'fine_per_day_cents',
    value: '50',
    type: 'integer',
    label: '逾期费（分/天）',
    description: '按自然日计算的逾期费用，单位为分',
  },
  {
    key: 'due_soon_days',
    value: '2',
    type: 'integer',
    label: '到期提醒提前天数',
    description: '到期前多少天发送站内提醒',
  },
  {
    key: 'allow_registration',
    value: 'true',
    type: 'boolean',
    label: '开放读者注册',
    description: '关闭后读者账号只能由馆员创建',
  },
]

// 业务状态枚举与展示文案；后端校验和前端标签必须保持这些 code 一致。
export const COPY_STATUS = {
  available: '可借',
  borrowed: '已借出',
  reserved: '预约保留',
  repair: '维修',
  lost: '遗失',
  off_shelf: '下架',
}

export const LOAN_STATUS = {
  active: '在借',
  returned: '已归还',
}

export const RESERVATION_STATUS = {
  waiting: '排队中',
  ready: '待取书',
  fulfilled: '已取书',
  cancelled: '已取消',
  expired: '已过期',
}

export const FEE_STATUS = {
  pending: '待处理',
  settled: '已处理',
  waived: '已豁免',
}

export const FEE_TYPE = {
  overdue: '逾期',
  lost: '遗失',
  damage: '损坏',
  manual: '人工费用',
}

export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60
