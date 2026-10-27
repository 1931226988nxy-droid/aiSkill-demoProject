import { AppError, ERR } from '../domain/errors.js'

export function parsePaging(query = {}, { defaultPageSize = 20, maxPageSize = 100 } = {}) {
  const page = query.page == null || query.page === '' ? 1 : Number(query.page)
  const pageSize =
    query.pageSize == null || query.pageSize === '' ? defaultPageSize : Number(query.pageSize)
  if (!Number.isInteger(page) || page < 1) {
    throw new AppError(ERR.VALIDATION, '页码必须为正整数', 422, { fields: { page: '页码必须为正整数' } })
  }
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
    throw new AppError(ERR.VALIDATION, `每页条数必须为 1-${maxPageSize}`, 422, {
      fields: { pageSize: `每页条数必须为 1-${maxPageSize}` },
    })
  }
  return { page, pageSize, offset: (page - 1) * pageSize }
}

export function paged(items, total, page, pageSize) {
  return { items, total, page, pageSize }
}
