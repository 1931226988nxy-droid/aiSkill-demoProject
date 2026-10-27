import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const routes = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/auth/LoginView.vue'),
    meta: { public: true, title: '登录' },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/auth/RegisterView.vue'),
    meta: { public: true, title: '读者注册' },
  },
  {
    path: '/',
    component: () => import('@/layouts/AppLayout.vue'),
    children: [
      {
        path: '',
        name: 'workbench',
        component: () => import('@/views/WorkbenchView.vue'),
        meta: { title: '工作台', menu: '/' },
      },
      {
        path: 'catalog',
        name: 'catalog',
        component: () => import('@/views/catalog/CatalogView.vue'),
        meta: { title: '图书检索', menu: '/catalog', permission: 'book.read' },
      },
      {
        path: 'catalog/:id',
        name: 'book-detail',
        component: () => import('@/views/catalog/BookDetailView.vue'),
        meta: { title: '图书详情', menu: '/catalog', permission: 'book.read' },
      },
      {
        path: 'my/loans',
        name: 'my-loans',
        component: () => import('@/views/reader/MyLoansView.vue'),
        meta: {
          title: '我的借阅',
          menu: '/my/loans',
          readerOnly: true,
          permission: 'reader.loans.view',
        },
      },
      {
        path: 'my/reservations',
        name: 'my-reservations',
        component: () => import('@/views/reader/MyReservationsView.vue'),
        meta: {
          title: '我的预约',
          menu: '/my/reservations',
          readerOnly: true,
          permission: 'reader.reservations.view',
        },
      },
      {
        path: 'my/fees',
        name: 'my-fees',
        component: () => import('@/views/reader/MyFeesView.vue'),
        meta: {
          title: '我的费用',
          menu: '/my/fees',
          readerOnly: true,
          permission: 'reader.fees.view',
        },
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@/views/reader/ProfileView.vue'),
        meta: { title: '个人资料', menu: '/profile' },
      },
      {
        path: 'notifications',
        name: 'notifications',
        component: () => import('@/views/NotificationsView.vue'),
        meta: { title: '站内通知', menu: '/notifications' },
      },
      {
        path: 'announcements',
        name: 'announcements',
        component: () => import('@/views/AnnouncementsView.vue'),
        meta: { title: '公告', menu: '/announcements' },
      },
      {
        path: 'staff/desk',
        name: 'staff-desk',
        component: () => import('@/views/staff/StaffDeskView.vue'),
        meta: {
          title: '馆员工作台',
          menu: '/staff/desk',
          permission: 'circulation.manage',
        },
      },
      {
        path: 'staff/catalog',
        name: 'catalog-manage',
        component: () => import('@/views/staff/CatalogManageView.vue'),
        meta: {
          title: '图书编目',
          menu: '/staff/catalog',
          permission: 'book.manage',
        },
      },
      {
        path: 'staff/copies',
        name: 'copies-manage',
        component: () => import('@/views/staff/CopiesManageView.vue'),
        meta: {
          title: '馆藏管理',
          menu: '/staff/copies',
          permission: 'copy.manage',
        },
      },
      {
        path: 'staff/readers',
        name: 'readers-manage',
        component: () => import('@/views/staff/ReadersManageView.vue'),
        meta: {
          title: '读者管理',
          menu: '/staff/readers',
          permission: 'reader.manage',
        },
      },
      {
        path: 'staff/reservations',
        name: 'reservation-desk',
        component: () => import('@/views/staff/ReservationDeskView.vue'),
        meta: {
          title: '预约处理',
          menu: '/staff/reservations',
          permission: 'reservation.manage',
        },
      },
      {
        path: 'staff/fees',
        name: 'fees-manage',
        component: () => import('@/views/staff/FeesManageView.vue'),
        meta: {
          title: '费用处理',
          menu: '/staff/fees',
          permission: 'fee.manage',
        },
      },
      {
        path: 'reports',
        name: 'reports',
        component: () => import('@/views/admin/ReportsView.vue'),
        meta: { title: '统计报表', menu: '/reports', permission: 'report.view' },
      },
      {
        path: 'settings',
        name: 'settings',
        component: () => import('@/views/admin/SettingsView.vue'),
        meta: {
          title: '系统设置',
          menu: '/settings',
          permission: 'settings.manage',
        },
      },
      {
        path: 'users',
        name: 'users-roles',
        component: () => import('@/views/admin/UsersRolesView.vue'),
        meta: {
          title: '账号与角色',
          menu: '/users',
          permission: 'user.manage',
        },
      },
      {
        path: 'audit',
        name: 'audit-logs',
        component: () => import('@/views/admin/AuditLogsView.vue'),
        meta: { title: '审计日志', menu: '/audit', permission: 'audit.view' },
      },
      {
        path: 'announcements/manage',
        name: 'announcements-manage',
        component: () => import('@/views/admin/AnnouncementsManageView.vue'),
        meta: {
          title: '公告管理',
          menu: '/announcements/manage',
          permission: 'announcement.manage',
        },
      },
      {
        path: 'modules/:code',
        name: 'module',
        component: () => import('@/views/ModuleView.vue'),
        meta: { title: '功能模块' },
      },
      {
        path: 'system/access',
        name: 'access-control',
        component: () => import('@/views/admin/AccessControlView.vue'),
        meta: {
          title: '权限与菜单',
          menu: '/system/access',
          permission: 'permission.manage',
        },
      },
      {
        path: 'forbidden',
        name: 'forbidden',
        component: () => import('@/views/ForbiddenView.vue'),
        meta: { title: '无权访问' },
      },
      {
        path: ':pathMatch(.*)*',
        name: 'not-found',
        component: () => import('@/views/NotFoundView.vue'),
        meta: { title: '页面不存在' },
      },
    ],
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 }
  },
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  if (!auth.initialized) await auth.load()
  document.title = `${to.meta.title || '图书管理系统'} · 图书管理系统`
  if (to.meta.public) {
    if (auth.isAuthenticated) return { name: 'workbench' }
    return true
  }
  if (!auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.permission && !auth.can(to.meta.permission)) {
    return { name: 'forbidden' }
  }
  if (to.meta.readerOnly && !auth.isReader) {
    return { name: 'forbidden' }
  }
  return true
})

export default router
