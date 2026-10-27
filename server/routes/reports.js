import { Router } from 'express'
import { toShanghaiDateString } from '../lib/time.js'

export function createReportRouter({ services, middleware }) {
  const router = Router()
  const { requireAuth, requirePermission } = middleware
  router.use(requireAuth)

  router.get('/dashboard', (req, res) => {
    res.json(services.dashboard.dashboard(req.auth.user))
  })

  router.get('/reports/summary', requirePermission('report.view'), (req, res) => {
    res.json(services.reports.summary(req.query))
  })

  router.get('/reports/export', requirePermission('report.view'), (req, res) => {
    const csv = services.reports.exportCsv(req.query)
    const from = req.query.from || 'range'
    const to = req.query.to || toShanghaiDateString(new Date())
    const filename = `library-report-${from}-${to}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-report.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    )
    res.send(csv)
  })

  return router
}
