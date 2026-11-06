import { performance } from 'node:perf_hooks'

export function createOperations() {
  const state = { startedAt: new Date().toISOString(), requests: 0, errors: 0, durationMs: 0, maxDurationMs: 0, jobs: null }
  return {
    state,
    middleware({ log = false } = {}) {
      return (req, res, next) => {
        const start = performance.now()
        res.on('finish', () => {
          const durationMs = performance.now() - start
          state.requests += 1
          state.errors += Number(res.statusCode >= 500)
          state.durationMs += durationMs
          state.maxDurationMs = Math.max(state.maxDurationMs, durationMs)
          if (log) console.log(JSON.stringify({ event: 'http', requestId: req.requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs), ip: req.ip }))
        })
        next()
      }
    },
    runJobs(work) {
      const started = performance.now()
      try {
        const result = work()
        state.jobs = { lastSuccessAt: new Date().toISOString(), lastFailureAt: state.jobs?.lastFailureAt || null, durationMs: Math.round(performance.now() - started), result }
        return result
      } catch (error) {
        state.jobs = { ...state.jobs, lastFailureAt: new Date().toISOString(), failed: true }
        throw error
      }
    },
    snapshot() {
      return { ...state, averageDurationMs: state.requests ? state.durationMs / state.requests : 0, uptimeSeconds: process.uptime(), memory: process.memoryUsage() }
    },
  }
}
