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

export function createServices({ db, clock = () => new Date(), notificationAdapter = null }) {
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
  return {
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
