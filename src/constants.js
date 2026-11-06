/**
 * 文件职责：前端状态标签、权限/角色展示和菜单权限常量。
 */

// 前端展示用状态映射；code 必须与后端 domain/constants.js 保持一致。
export const COPY_STATUS_META = {
  available: { label: '可借', color: 'green' },
  borrowed: { label: '已借出', color: 'blue' },
  reserved: { label: '预约保留', color: 'orange' },
  repair: { label: '维修', color: 'gold' },
  lost: { label: '遗失', color: 'red' },
  off_shelf: { label: '下架', color: 'default' },
}

export const LOAN_STATUS_META = {
  active: { label: '在借', color: 'blue' },
  returned: { label: '已归还', color: 'default' },
  overdue: { label: '已逾期', color: 'red' },
}

export const RESERVATION_STATUS_META = {
  waiting: { label: '排队中', color: 'blue' },
  ready: { label: '待取书', color: 'orange' },
  fulfilled: { label: '已取书', color: 'green' },
  cancelled: { label: '已取消', color: 'default' },
  expired: { label: '已过期', color: 'red' },
}

export const FEE_STATUS_META = {
  pending: { label: '待处理', color: 'orange' },
  settled: { label: '已处理', color: 'green' },
  waived: { label: '已豁免', color: 'default' },
}

export const FEE_TYPE_META = {
  overdue: { label: '逾期费用', color: 'red' },
  lost: { label: '遗失赔偿', color: 'volcano' },
  damage: { label: '损坏赔偿', color: 'gold' },
  manual: { label: '人工费用', color: 'purple' },
}

export const BOOK_STATUS_META = {
  active: { label: '在架', color: 'green' },
  off_shelf: { label: '已下架', color: 'default' },
}

export const USER_STATUS_META = {
  active: { label: '启用', color: 'green' },
  disabled: { label: '停用', color: 'red' },
}

export const READER_STATUS_META = USER_STATUS_META

export const ANNOUNCEMENT_STATUS_META = {
  draft: { label: '草稿', color: 'default' },
  published: { label: '已发布', color: 'green' },
  withdrawn: { label: '已撤回', color: 'orange' },
}

export const ROLE_LABELS = {
  admin: '管理员',
  librarian: '馆员',
  reader: '读者',
}
