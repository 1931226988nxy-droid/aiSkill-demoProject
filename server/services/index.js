/**
 * 文件职责：后端服务依赖装配。
 */

import { createAdminService } from './admin-service.js'
import { createAccessService } from './access-service.js'
import { createAuthService } from './auth-service.js'
import { createCatalogService } from './catalog-service.js'
import { createCirculationService } from './circulation-service.js'
import { createDashboardService } from './dashboard-service.js'
import { createFeeService } from './fee-service.js'
import { createNavigationService } from './navigation-service.js'
import { createNotificationService } from './notification-service.js'
import { createReaderService } from './reader-service.js'
import { createReportService } from './report-service.js'
import { createReservationService } from './reservation-service.js'
import { createSettingsService } from './settings-service.js'
import { createOperations } from '../lib/operations.js'

export function createServices({ db, clock = () => new Date(), notificationAdapter = null }) {
  // 装配顺序体现依赖关系：设置/通知是基础服务，认证、馆藏、借阅等再依赖它们。
  const settings = createSettingsService({ db, clock })
  const notifications = createNotificationService({ db, clock, externalAdapter: notificationAdapter })
  const auth = createAuthService({ db, clock, settings, notifications })
  const catalog = createCatalogService({ db, clock, settings, notifications })
  const circulation = createCirculationService({ db, clock, settings, notifications })
  const reservations = createReservationService({ db, clock, settings, notifications })
  const readers = createReaderService({ db, clock })
  const fees = createFeeService({ db, clock, notifications })
  const admin = createAdminService({ db, clock, settings })
  const access = createAccessService({ db, clock })
  const navigation = createNavigationService({ db })
  const reports = createReportService({ db, clock })
  const dashboard = createDashboardService({ db, clock })
  // 服务通过闭包共享同一个 db 和时钟，测试可注入固定时钟来验证时间边界。
  return {
    operations: createOperations(),
    db,
    clock,
    settings,
    notifications,
    auth,
    catalog,
    circulation,
    reservations,
    readers,
    fees,
    admin,
    access,
    navigation,
    reports,
    dashboard,
  }
}
