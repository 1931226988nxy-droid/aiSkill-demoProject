/**
 * 文件职责：图书编目、分类、作者、副本、盘点与预约分配服务。
 */

import { AppError, ERR } from '../domain/errors.js'
import { writeAudit } from '../lib/audit.js'
import { paged, parsePaging } from '../lib/pagination.js'
import { isUniqueConstraint, transaction } from '../lib/transaction.js'
import { assignAvailableCopies } from './reservation-queue.js'
import {
  enumValue,
  escapeLike,
  integer,
  isbn,
  moneyToCents,
  optionalDateOnly,
  optionalInteger,
  optionalString,
  requiredString,
} from '../lib/validation.js'

function splitAuthors(value) {
  return value ? String(value).split('、').filter(Boolean) : []
}

function categoryFields(input, existing = {}) {
  const code = requiredString(input.code ?? existing.code, 'code', '分类代码', {
    max: 20,
  }).toUpperCase()
  if (!/^[A-Z0-9_]+$/.test(code)) {
    throw new AppError(ERR.VALIDATION, '分类代码只能包含大写字母、数字和下划线', 422, {
      fields: { code: '分类代码只能包含大写字母、数字和下划线' },
    })
  }
  const name = requiredString(input.name ?? existing.name, 'name', '分类名称', { max: 40 })
  return { code, name }
}

function mapBook(row) {
  return {
    id: row.id,
    version: row.version,
    isbn: row.isbn,
    title: row.title,
    subtitle: row.subtitle,
    authors: splitAuthors(row.author_names),
    translator: row.translator,
    publisher: row.publisher,
    publishDate: row.publish_date,
    categoryId: row.category_id,
    categoryName: row.category_name,
    keywords: row.keywords,
    summary: row.summary,
    coverUrl: row.cover_url,
    language: row.language,
    edition: row.edition,
    price: Number((row.price_cents / 100).toFixed(2)),
    status: row.status,
    totalCopies: Number(row.total_copies || 0),
    availableCopies: Number(row.available_copies || 0),
    borrowedCopies: Number(row.borrowed_copies || 0),
    reservedCopies: Number(row.reserved_copies || 0),
    activeReservations: Number(row.active_reservations || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

const BOOK_SELECT = `SELECT b.*, c.name AS category_name,
    (SELECT GROUP_CONCAT(a.name, '、') FROM book_authors ba JOIN authors a ON a.id = ba.author_id
      WHERE ba.book_id = b.id ORDER BY ba.position) AS author_names,
    (SELECT COUNT(*) FROM copies cp WHERE cp.book_id = b.id) AS total_copies,
    (SELECT COUNT(*) FROM copies cp WHERE cp.book_id = b.id AND cp.status = 'available') AS available_copies,
    (SELECT COUNT(*) FROM copies cp WHERE cp.book_id = b.id AND cp.status = 'borrowed') AS borrowed_copies,
    (SELECT COUNT(*) FROM copies cp WHERE cp.book_id = b.id AND cp.status = 'reserved') AS reserved_copies,
    (SELECT COUNT(*) FROM reservations r WHERE r.book_id = b.id AND r.status IN ('waiting','ready')) AS active_reservations
  FROM books b LEFT JOIN categories c ON c.id = b.category_id`

function mapCopy(row) {
  return {
    id: row.id,
    bookId: row.book_id,
    barcode: row.barcode,
    location: row.location,
    shelf: row.shelf,
    status: row.status,
    conditionNote: row.condition_note,
    lastInventoryAt: row.last_inventory_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    bookTitle: row.book_title,
    isbn: row.isbn,
    activeLoanId: row.active_loan_id || null,
    readerNo: row.reader_no || null,
    readerName: row.reader_name || null,
    dueAt: row.due_at || null,
  }
}

const COPY_SELECT = `SELECT cp.*, b.title AS book_title, b.isbn,
    l.id AS active_loan_id, l.due_at,
    rp.reader_no, rp.full_name AS reader_name
  FROM copies cp
  JOIN books b ON b.id = cp.book_id
  LEFT JOIN loans l ON l.copy_id = cp.id AND l.returned_at IS NULL
  LEFT JOIN reader_profiles rp ON rp.id = l.reader_id`

function resolveBookInput(db, input, existing = null) {
  const isbnValue = isbn(input.isbn ?? existing?.isbn)
  const title = requiredString(input.title ?? existing?.title, 'title', '书名', { max: 200 })
  const subtitle = optionalString(input.subtitle ?? existing?.subtitle, 'subtitle', '副标题', {
    max: 300,
  })
  const authorInput = input.authors ?? existing?.authors ?? []
  if (!Array.isArray(authorInput) || !authorInput.length) {
    throw new AppError(ERR.VALIDATION, '请至少填写一位作者', 422, {
      fields: { authors: '请至少填写一位作者' },
    })
  }
  const authors = [...new Set(authorInput.map((name) => String(name || '').trim()).filter(Boolean))]
  if (!authors.length || authors.length > 10) {
    throw new AppError(ERR.VALIDATION, '作者数量应为 1-10 位', 422, {
      fields: { authors: '作者数量应为 1-10 位' },
    })
  }
  for (const author of authors) {
    if (author.length > 80) {
      throw new AppError(ERR.VALIDATION, '作者姓名过长', 422, {
        fields: { authors: '作者姓名不能超过 80 个字符' },
      })
    }
  }
  const categoryId = integer(input.categoryId ?? existing?.categoryId, 'categoryId', '分类', {
    min: 1,
    max: Number.MAX_SAFE_INTEGER,
  })
  const category = db.prepare('SELECT id FROM categories WHERE id = ?').get(categoryId)
  if (!category) {
    throw new AppError(ERR.VALIDATION, '所选分类不存在', 422, {
      fields: { categoryId: '所选分类不存在' },
    })
  }
  const publishDate = optionalDateOnly(
    input.publishDate === undefined ? existing?.publishDate : input.publishDate,
    'publishDate',
    '出版日期',
  )
  return {
    isbn: isbnValue,
    title,
    subtitle,
    authors,
    translator: optionalString(input.translator ?? existing?.translator, 'translator', '译者', {
      max: 100,
    }),
    publisher: optionalString(input.publisher ?? existing?.publisher, 'publisher', '出版社', {
      max: 120,
    }),
    publishDate,
    categoryId,
    keywords: optionalString(input.keywords ?? existing?.keywords, 'keywords', '关键词', {
      max: 300,
    }),
    summary: optionalString(input.summary ?? existing?.summary, 'summary', '简介', { max: 5000 }),
    coverUrl: optionalString(input.coverUrl ?? existing?.coverUrl, 'coverUrl', '封面地址', {
      max: 500,
    }),
    language:
      optionalString(input.language ?? existing?.language, 'language', '语言', {
        max: 20,
      }) || '中文',
    edition: optionalString(input.edition ?? existing?.edition, 'edition', '版本', { max: 50 }),
    priceCents: moneyToCents(input.price ?? existing?.price ?? 0, 'price', '定价'),
  }
}

export function createCatalogService({ db, clock = () => new Date(), settings, notifications }) {
  // 副本恢复可借/新入库后，立即尝试按 FIFO 顺序满足该书的等待预约。
  function assignReservations(bookId, operatorId) {
    return assignAvailableCopies({
      db,
      bookId,
      now: clock(),
      settings,
      notifications,
      operatorId,
    })
  }
  function listCategories() {
    return db
      .prepare(
        `SELECT c.*, (SELECT COUNT(*) FROM books b WHERE b.category_id = c.id) AS book_count
         FROM categories c ORDER BY c.name`,
      )
      .all()
      .map((row) => ({ id: row.id, code: row.code, name: row.name, bookCount: row.book_count }))
  }

  function createCategory(input, actor, ip = '') {
    const { code, name } = categoryFields(input)
    const now = clock().toISOString()
    try {
      const result = db
        .prepare('INSERT INTO categories (code, name, created_at) VALUES (?, ?, ?)')
        .run(code, name, now)
      writeAudit(db, {
        actor,
        action: 'category.create',
        objectType: 'category',
        objectId: Number(result.lastInsertRowid),
        details: { code, name },
        ip,
        createdAt: now,
      })
      return listCategories().find((item) => item.id === Number(result.lastInsertRowid))
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '分类代码或名称已存在', 409)
      throw error
    }
  }

  function updateCategory(categoryId, input, actor, ip = '') {
    const existing = db
      .prepare('SELECT id, code, name FROM categories WHERE id = ?')
      .get(categoryId)
    if (!existing) throw new AppError(ERR.NOT_FOUND, '分类不存在', 404)
    const { code, name } = categoryFields(input, existing)
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        db.prepare('UPDATE categories SET code = ?, name = ? WHERE id = ?').run(
          code,
          name,
          categoryId,
        )
        writeAudit(db, {
          actor,
          action: 'category.update',
          objectType: 'category',
          objectId: categoryId,
          details: { before: { code: existing.code, name: existing.name }, after: { code, name } },
          ip,
          createdAt: now,
        })
        return listCategories().find((item) => item.id === categoryId)
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '分类代码或名称已存在', 409)
      throw error
    }
  }

  function deleteCategory(categoryId, actor, ip = '') {
    const existing = db
      .prepare('SELECT id, code, name FROM categories WHERE id = ?')
      .get(categoryId)
    if (!existing) throw new AppError(ERR.NOT_FOUND, '分类不存在', 404)
    const bookCount = db
      .prepare('SELECT COUNT(*) AS count FROM books WHERE category_id = ?')
      .get(categoryId).count
    if (bookCount) throw new AppError(ERR.CONFLICT, '该分类仍有图书，不能删除', 409)
    const childCount = db
      .prepare('SELECT COUNT(*) AS count FROM categories WHERE parent_id = ?')
      .get(categoryId).count
    if (childCount) throw new AppError(ERR.CONFLICT, '该分类仍有子分类，不能删除', 409)
    const now = clock().toISOString()
    return transaction(db, () => {
      db.prepare('DELETE FROM categories WHERE id = ?').run(categoryId)
      writeAudit(db, {
        actor,
        action: 'category.delete',
        objectType: 'category',
        objectId: categoryId,
        details: { code: existing.code, name: existing.name },
        ip,
        createdAt: now,
      })
      return { id: categoryId }
    })
  }

  function listAuthors() {
    return db
      .prepare(
        `SELECT a.*, (SELECT COUNT(*) FROM book_authors ba WHERE ba.author_id = a.id) AS book_count
         FROM authors a ORDER BY a.name`,
      )
      .all()
      .map((row) => ({ id: row.id, name: row.name, bookCount: row.book_count }))
  }

  function listBooks(query = {}, { canSeeOffShelf = false } = {}) {
    const { page, pageSize, offset } = parsePaging(query)
    const where = []
    const params = []
    if (!canSeeOffShelf) {
      where.push("b.status = 'active'")
    } else if (query.status) {
      where.push('b.status = ?')
      params.push(enumValue(query.status, 'status', '图书状态', ['active', 'off_shelf']))
    }
    if (query.q) {
      const value = `%${escapeLike(String(query.q).trim())}%`
      where.push(`(
        b.title LIKE ? ESCAPE '\\' OR b.subtitle LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\'
        OR b.keywords LIKE ? ESCAPE '\\' OR b.publisher LIKE ? ESCAPE '\\'
        OR EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id
          WHERE ba.book_id = b.id AND a.name LIKE ? ESCAPE '\\')
      )`)
      params.push(value, value, value, value, value, value)
    }
    if (query.title) {
      where.push("b.title LIKE ? ESCAPE '\\'")
      params.push(`%${escapeLike(query.title)}%`)
    }
    if (query.author) {
      where.push(`EXISTS (SELECT 1 FROM book_authors ba JOIN authors a ON a.id = ba.author_id
        WHERE ba.book_id = b.id AND a.name LIKE ? ESCAPE '\\')`)
      params.push(`%${escapeLike(query.author)}%`)
    }
    if (query.isbn) {
      const normalized = String(query.isbn).replace(/[\s-]/g, '')
      where.push('b.isbn = ?')
      params.push(normalized)
    }
    if (query.keyword) {
      where.push("b.keywords LIKE ? ESCAPE '\\'")
      params.push(`%${escapeLike(query.keyword)}%`)
    }
    if (query.categoryId) {
      where.push('b.category_id = ?')
      params.push(integer(query.categoryId, 'categoryId', '分类', { min: 1 }))
    }
    if (query.availability === 'available') {
      where.push(
        "EXISTS (SELECT 1 FROM copies cp WHERE cp.book_id = b.id AND cp.status = 'available')",
      )
    } else if (query.availability === 'unavailable') {
      where.push(
        "NOT EXISTS (SELECT 1 FROM copies cp WHERE cp.book_id = b.id AND cp.status = 'available')",
      )
    } else if (query.availability) {
      enumValue(query.availability, 'availability', '可借状态', ['all', 'available', 'unavailable'])
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const sortMap = {
      newest: 'b.created_at',
      title: 'b.title',
      publish: 'b.publish_date',
      available: 'available_copies',
      relevance: 'b.created_at',
    }
    const sort = sortMap[query.sort] || 'b.created_at'
    const order =
      String(query.order || (query.sort === 'title' ? 'asc' : 'desc')).toLowerCase() === 'asc'
        ? 'ASC'
        : 'DESC'
    const total = Number(
      db.prepare(`SELECT COUNT(*) AS count FROM books b ${whereSql}`).get(...params).count,
    )
    const rows = db
      .prepare(`${BOOK_SELECT} ${whereSql} ORDER BY ${sort} ${order}, b.id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, offset)
    return paged(rows.map(mapBook), total, page, pageSize)
  }

  function getBook(bookId, { includeCopies = true } = {}) {
    const row = db.prepare(`${BOOK_SELECT} WHERE b.id = ?`).get(bookId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '图书不存在', 404)
    const book = mapBook(row)
    const authors = db
      .prepare(
        `SELECT a.id, a.name FROM book_authors ba JOIN authors a ON a.id = ba.author_id
         WHERE ba.book_id = ? ORDER BY ba.position`,
      )
      .all(bookId)
    book.authorDetails = authors
    if (includeCopies) {
      const copies = db
        .prepare(`${COPY_SELECT} WHERE cp.book_id = ? ORDER BY cp.barcode`)
        .all(bookId)
        .map((row) => {
          const copy = mapCopy(row)
          // 图书详情对读者开放，不暴露当前借阅人信息。
          return {
            ...copy,
            activeLoanId: null,
            readerNo: null,
            readerName: null,
            dueAt: null,
          }
        })
      book.copies = copies
      book.locations = [...new Set(copies.map((copy) => copy.location))]
    }
    const activeReservations = db
      .prepare(
        `SELECT COUNT(*) AS count FROM reservations WHERE book_id = ? AND status IN ('waiting','ready')`,
      )
      .get(bookId)
    book.activeReservations = Number(activeReservations.count)
    return book
  }

  function saveAuthors(bookId, authors, now) {
    // 作者按名称复用，book_authors.position 保留表单中的展示顺序。
    const find = db.prepare('SELECT id FROM authors WHERE name = ? COLLATE NOCASE')
    const insert = db.prepare('INSERT INTO authors (name, created_at) VALUES (?, ?)')
    const link = db.prepare(
      'INSERT INTO book_authors (book_id, author_id, position) VALUES (?, ?, ?)',
    )
    authors.forEach((name, index) => {
      let author = find.get(name)
      if (!author) {
        author = { id: Number(insert.run(name, now).lastInsertRowid) }
      }
      link.run(bookId, author.id, index)
    })
  }

  function createBook(input, actor, ip = '') {
    const data = resolveBookInput(db, input)
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const result = db
          .prepare(
            `INSERT INTO books
              (isbn, title, subtitle, translator, publisher, publish_date, category_id, keywords,
               summary, cover_url, language, edition, price_cents, status, created_by, updated_by,
               created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?)`,
          )
          .run(
            data.isbn,
            data.title,
            data.subtitle,
            data.translator,
            data.publisher,
            data.publishDate,
            data.categoryId,
            data.keywords,
            data.summary,
            data.coverUrl,
            data.language,
            data.edition,
            data.priceCents,
            actor.id,
            actor.id,
            now,
            now,
          )
        const bookId = Number(result.lastInsertRowid)
        saveAuthors(bookId, data.authors, now)
        writeAudit(db, {
          actor,
          action: 'book.create',
          objectType: 'book',
          objectId: bookId,
          details: { isbn: data.isbn, title: data.title },
          ip,
          createdAt: now,
        })
        return getBook(bookId)
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '该 ISBN 已存在', 409)
      throw error
    }
  }

  function updateBook(bookId, input, actor, ip = '') {
    const version = integer(input.version, 'version', '数据版本', { min: 1 })
    const existing = getBook(bookId, { includeCopies: false })
    const data = resolveBookInput(db, input, existing)
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const updated = db.prepare(
          `UPDATE books SET isbn = ?, title = ?, subtitle = ?, translator = ?, publisher = ?,
             publish_date = ?, category_id = ?, keywords = ?, summary = ?, cover_url = ?,
             language = ?, edition = ?, price_cents = ?, updated_by = ?, updated_at = ?, version = version + 1
           WHERE id = ? AND version = ?`,
        ).run(
          data.isbn,
          data.title,
          data.subtitle,
          data.translator,
          data.publisher,
          data.publishDate,
          data.categoryId,
          data.keywords,
          data.summary,
          data.coverUrl,
          data.language,
          data.edition,
          data.priceCents,
          actor.id,
          now,
          bookId,
          version,
        )
        if (!updated.changes) throw new AppError(ERR.CONFLICT, '图书已被其他人修改，请刷新后重新编辑', 409)
        if (input.authors !== undefined) {
          db.prepare('DELETE FROM book_authors WHERE book_id = ?').run(bookId)
          saveAuthors(bookId, data.authors, now)
        }
        writeAudit(db, {
          actor,
          action: 'book.update',
          objectType: 'book',
          objectId: bookId,
          details: { isbn: data.isbn, title: data.title },
          ip,
          createdAt: now,
        })
        return getBook(bookId)
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '该 ISBN 已存在', 409)
      throw error
    }
  }

  function offShelfBook(bookId, reason, actor, ip = '') {
    const book = getBook(bookId)
    if (book.status === 'off_shelf') return book
    const now = clock().toISOString()
    return transaction(db, () => {
      // 下架前必须没有在借副本和未完成预约，避免读者已借/已预约的书突然消失。
      const activeLoans = db
        .prepare('SELECT COUNT(*) AS count FROM loans WHERE book_id = ? AND returned_at IS NULL')
        .get(bookId)
      if (Number(activeLoans.count) > 0) {
        throw new AppError(ERR.CONFLICT, '该图书仍有在借副本，不能下架', 409)
      }
      const activeReservations = db
        .prepare(
          `SELECT COUNT(*) AS count FROM reservations WHERE book_id = ? AND status IN ('waiting','ready')`,
        )
        .get(bookId)
      if (Number(activeReservations.count) > 0) {
        throw new AppError(ERR.CONFLICT, '该图书仍有未完成预约，请先处理预约', 409)
      }
      db.prepare(
        `UPDATE books SET status = 'off_shelf', updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
      ).run(actor.id, now, bookId)
      // 可借/维修中的副本随书下架；已借出、已预约、已遗失的副本保持原状态。
      const closingCopies = db
        .prepare(
          `SELECT id, status, condition_note FROM copies
           WHERE book_id = ? AND status IN ('available', 'repair')`,
        )
        .all(bookId)
      const closeCopy = db.prepare(
        "UPDATE copies SET status = 'off_shelf', condition_note = ?, updated_at = ? WHERE id = ?",
      )
      const logCopy = db.prepare(
        `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
         VALUES (?, ?, 'off_shelf', ?, ?, ?)`,
      )
      const reasonText = requiredString(reason, 'reason', '下架原因', { max: 300 })
      const closedCopyStates = []
      for (const copy of closingCopies) {
        closeCopy.run(reasonText, now, copy.id)
        const statusLog = logCopy.run(copy.id, copy.status, reasonText, actor.id, now)
        closedCopyStates.push({
          id: copy.id,
          status: copy.status,
          conditionNote: copy.condition_note,
          statusLogId: Number(statusLog.lastInsertRowid),
        })
      }
      writeAudit(db, {
        actor,
        action: 'book.off_shelf',
        objectType: 'book',
        objectId: bookId,
        details: {
          reason: reasonText,
          closedCopies: closingCopies.length,
          closedCopyStates,
        },
        ip,
        createdAt: now,
      })
      return getBook(bookId)
    })
  }

  function onShelfBook(bookId, actor, ip = '') {
    const book = getBook(bookId, { includeCopies: false })
    if (book.status === 'active') return getBook(bookId)
    const now = clock().toISOString()
    return transaction(db, () => {
      const lastOffShelf = db
        .prepare(
          `SELECT created_at, details FROM audit_logs
           WHERE action = 'book.off_shelf' AND object_type = 'book' AND object_id = ?
           ORDER BY id DESC LIMIT 1`,
        )
        .get(String(bookId))
      let details = {}
      if (lastOffShelf) {
        try {
          const parsed = JSON.parse(lastOffShelf.details)
          if (parsed && typeof parsed === 'object') details = parsed
        } catch {
          // 旧审计记录无法解析时只恢复书目，不猜测副本之前的状态。
        }
      }
      const originalStates = Array.isArray(details.closedCopyStates)
        ? new Map(details.closedCopyStates.map((copy) => [copy.id, copy]))
        : null
      const candidates = lastOffShelf && details.reason
        ? db.prepare(
            `SELECT cp.id, log.id AS status_log_id, log.from_status AS previous_status
             FROM copies cp
             JOIN copy_status_logs log ON log.copy_id = cp.id
             WHERE cp.book_id = ? AND cp.status = 'off_shelf'
               AND log.id = (SELECT MAX(latest.id) FROM copy_status_logs latest
                             WHERE latest.copy_id = cp.id)
               AND log.to_status = 'off_shelf'
               AND log.from_status IN ('available', 'repair')
               AND log.created_at = ? AND log.reason = ?`,
          ).all(bookId, lastOffShelf.created_at, details.reason)
        : []
      const restoringCopies = candidates.filter((copy) => {
        if (!originalStates) return true
        const original = originalStates.get(copy.id)
        return original?.status === copy.previous_status
          && (original.statusLogId == null || original.statusLogId === copy.status_log_id)
      })
      db.prepare(
        `UPDATE books SET status = 'active', updated_by = ?, updated_at = ?, version = version + 1 WHERE id = ?`,
      ).run(actor.id, now, bookId)
      const restoreCopy = db.prepare(
        `UPDATE copies SET status = ?, condition_note = ?, updated_at = ? WHERE id = ?`,
      )
      const logCopy = db.prepare(
        `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
         VALUES (?, 'off_shelf', ?, ?, ?, ?)`,
      )
      for (const copy of restoringCopies) {
        const note = originalStates?.get(copy.id)?.conditionNote || ''
        restoreCopy.run(copy.previous_status, note, now, copy.id)
        logCopy.run(copy.id, copy.previous_status, '随图书重新上架，恢复下架前状态', actor.id, now)
      }
      writeAudit(db, {
        actor,
        action: 'book.on_shelf',
        objectType: 'book',
        objectId: bookId,
        details: { restoredCopies: restoringCopies.length },
        ip,
        createdAt: now,
      })
      return getBook(bookId)
    })
  }

  function createCopy(bookId, input, actor, ip = '') {
    const book = getBook(bookId, { includeCopies: false })
    const barcode = requiredString(input.barcode, 'barcode', '条码', { max: 50 }).toUpperCase()
    const location = requiredString(input.location, 'location', '馆藏地', { max: 80 })
    const shelf = optionalString(input.shelf, 'shelf', '书架位置', { max: 50 })
    const status = enumValue(input.status || 'available', 'status', '副本状态', [
      'available',
      'repair',
      'off_shelf',
    ])
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const result = db
          .prepare(
            `INSERT INTO copies (book_id, barcode, location, shelf, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(book.id, barcode, location, shelf, status, now, now)
        const copyId = Number(result.lastInsertRowid)
        db.prepare(
          `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
           VALUES (?, NULL, ?, ?, ?, ?)`,
        ).run(
          copyId,
          status,
          requiredString(input.reason || '新副本入库', 'reason', '原因', { max: 200 }),
          actor.id,
          now,
        )
        writeAudit(db, {
          actor,
          action: 'copy.create',
          objectType: 'copy',
          objectId: copyId,
          details: { barcode, bookId: book.id },
          ip,
          createdAt: now,
        })
        // 新副本若直接入库为可借，必须立即检查等待队列，不能先短暂暴露给普通借阅。
        if (status === 'available') assignReservations(book.id, actor.id)
        return mapCopy(db.prepare(`${COPY_SELECT} WHERE cp.id = ?`).get(copyId))
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '条码已存在', 409)
      throw error
    }
  }

  function bulkCreateCopies(bookId, input, actor, ip = '') {
    const book = getBook(bookId, { includeCopies: false })
    if (!Array.isArray(input.barcodes) || !input.barcodes.length) {
      throw new AppError(ERR.VALIDATION, '请至少提供一个条码', 422, {
        fields: { barcodes: '请至少提供一个条码' },
      })
    }
    if (input.barcodes.length > 100) {
      throw new AppError(ERR.VALIDATION, '单次批量导入最多 100 个条码', 422, {
        fields: { barcodes: '单次批量导入最多 100 个条码' },
      })
    }
    const barcodes = [...new Set(input.barcodes.map((value) => String(value).trim().toUpperCase()))]
    if (barcodes.some((barcode) => !barcode || barcode.length > 50)) {
      throw new AppError(ERR.VALIDATION, '条码格式不正确', 422)
    }
    const location = requiredString(input.location, 'location', '馆藏地', { max: 80 })
    const shelf = optionalString(input.shelf, 'shelf', '书架位置', { max: 50 })
    const now = clock().toISOString()
    try {
      return transaction(db, () => {
        const findExisting = db.prepare('SELECT barcode FROM copies WHERE barcode = ?')
        const duplicates = barcodes.filter((barcode) => findExisting.get(barcode))
        if (duplicates.length) {
          throw new AppError(ERR.CONFLICT, `以下条码已存在：${duplicates.join('、')}`, 409, {
            duplicates,
          })
        }
        const insert = db.prepare(
          `INSERT INTO copies (book_id, barcode, location, shelf, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'available', ?, ?)`,
        )
        const logInsert = db.prepare(
          `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
           VALUES (?, NULL, 'available', '批量入库', ?, ?)`,
        )
        const ids = []
        for (const barcode of barcodes) {
          const result = insert.run(book.id, barcode, location, shelf, now, now)
          const copyId = Number(result.lastInsertRowid)
          logInsert.run(copyId, actor.id, now)
          ids.push(copyId)
        }
        // 批量入库全部写入后再统一分配，保证同批次副本按 ID 顺序满足队列。
        assignReservations(book.id, actor.id)
        writeAudit(db, {
          actor,
          action: 'copy.bulk_import',
          objectType: 'book',
          objectId: book.id,
          details: { count: ids.length, barcodes },
          ip,
          createdAt: now,
        })
        return { count: ids.length, barcodes }
      })
    } catch (error) {
      if (isUniqueConstraint(error)) throw new AppError(ERR.CONFLICT, '条码已存在', 409)
      throw error
    }
  }

  function listCopies(query = {}) {
    const { page, pageSize, offset } = parsePaging(query)
    const where = []
    const params = []
    if (query.q) {
      const value = `%${escapeLike(query.q)}%`
      where.push(
        "(cp.barcode LIKE ? ESCAPE '\\' OR b.title LIKE ? ESCAPE '\\' OR b.isbn LIKE ? ESCAPE '\\')",
      )
      params.push(value, value, value)
    }
    if (query.bookId) {
      where.push('cp.book_id = ?')
      params.push(integer(query.bookId, 'bookId', '图书', { min: 1 }))
    }
    if (query.status) {
      where.push('cp.status = ?')
      params.push(
        enumValue(query.status, 'status', '副本状态', [
          'available',
          'borrowed',
          'reserved',
          'repair',
          'lost',
          'off_shelf',
        ]),
      )
    }
    if (query.location) {
      where.push('cp.location = ?')
      params.push(String(query.location))
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const total = Number(
      db
        .prepare(
          `SELECT COUNT(*) AS count FROM copies cp JOIN books b ON b.id = cp.book_id ${whereSql}`,
        )
        .get(...params).count,
    )
    const items = db
      .prepare(
        `${COPY_SELECT} ${whereSql} ORDER BY cp.updated_at DESC, cp.id DESC LIMIT ? OFFSET ?`,
      )
      .all(...params, pageSize, offset)
      .map(mapCopy)
    return paged(items, total, page, pageSize)
  }

  function getCopy(copyId) {
    const row = db.prepare(`${COPY_SELECT} WHERE cp.id = ?`).get(copyId)
    if (!row) throw new AppError(ERR.NOT_FOUND, '馆藏副本不存在', 404)
    return mapCopy(row)
  }

  function updateCopyStatus(copyId, { status, reason }, actor, ip = '') {
    const copy = getCopy(copyId)
    const nextStatus = enumValue(status, 'status', '副本状态', [
      'available',
      'repair',
      'lost',
      'off_shelf',
    ])
    const text = requiredString(reason, 'reason', '变更原因', { min: 2, max: 300 })
    // 在借/预约保留中的副本不允许直接改状态，必须先走归还、遗失或预约队列流程。
    if (copy.status === 'borrowed' || copy.activeLoanId) {
      throw new AppError(ERR.INVALID_STATUS, '副本仍在借阅中，请先办理归还或遗失登记', 409)
    }
    if (copy.status === 'reserved') {
      throw new AppError(ERR.INVALID_STATUS, '副本处于预约保留状态，请先在预约队列中处理', 409)
    }
    if (copy.status === nextStatus) return copy
    const now = clock().toISOString()
    return transaction(db, () => {
      db.prepare(
        'UPDATE copies SET status = ?, condition_note = ?, updated_at = ? WHERE id = ?',
      ).run(nextStatus, text, now, copyId)
      db.prepare(
        `INSERT INTO copy_status_logs (copy_id, from_status, to_status, reason, operator_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(copyId, copy.status, nextStatus, text, actor.id, now)
      writeAudit(db, {
        actor,
        action: 'copy.status_change',
        objectType: 'copy',
        objectId: copyId,
        details: { barcode: copy.barcode, from: copy.status, to: nextStatus, reason: text },
        ip,
        createdAt: now,
      })
      if (nextStatus === 'available') assignReservations(copy.bookId, actor.id)
      return getCopy(copyId)
    })
  }

  function inventory(input, actor, ip = '') {
    // 盘点只更新 last_inventory_at，不改副本可借状态；指定馆藏地时异地条码计入缺失。
    if (!Array.isArray(input.barcodes) || !input.barcodes.length) {
      throw new AppError(ERR.VALIDATION, '请扫描至少一个条码', 422, {
        fields: { barcodes: '请扫描至少一个条码' },
      })
    }
    const barcodes = [...new Set(input.barcodes.map((value) => String(value).trim().toUpperCase()))]
    if (input.location) requiredString(input.location, 'location', '馆藏地', { max: 80 })
    const now = clock().toISOString()
    return transaction(db, () => {
      const find = db.prepare('SELECT * FROM copies WHERE barcode = ?')
      const update = db.prepare(
        'UPDATE copies SET last_inventory_at = ?, updated_at = ? WHERE id = ?',
      )
      const found = []
      const missing = []
      for (const barcode of barcodes) {
        const copy = find.get(barcode)
        if (!copy) {
          missing.push(barcode)
          continue
        }
        if (input.location && copy.location !== input.location) {
          missing.push(barcode)
          continue
        }
        update.run(now, now, copy.id)
        found.push({ id: copy.id, barcode, status: copy.status, location: copy.location })
      }
      writeAudit(db, {
        actor,
        action: 'copy.inventory',
        objectType: 'copy',
        objectId: null,
        details: { scanned: barcodes.length, found: found.length, missing },
        ip,
        createdAt: now,
      })
      return { scanned: barcodes.length, found, missing, at: now }
    })
  }

  function copyLogs(copyId) {
    getCopy(copyId)
    return db
      .prepare(
        `SELECT l.*, u.display_name AS operator_name FROM copy_status_logs l
         LEFT JOIN users u ON u.id = l.operator_id
         WHERE l.copy_id = ? ORDER BY l.created_at DESC, l.id DESC LIMIT 100`,
      )
      .all(copyId)
      .map((row) => ({
        id: row.id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        reason: row.reason,
        operatorName: row.operator_name,
        createdAt: row.created_at,
      }))
  }

  function locations() {
    return db
      .prepare('SELECT DISTINCT location FROM copies ORDER BY location')
      .all()
      .map((row) => row.location)
  }

  return {
    listCategories,
    createCategory,
    updateCategory,
    deleteCategory,
    listAuthors,
    listBooks,
    getBook,
    createBook,
    updateBook,
    offShelfBook,
    onShelfBook,
    createCopy,
    bulkCreateCopies,
    listCopies,
    getCopy,
    updateCopyStatus,
    inventory,
    copyLogs,
    locations,
  }
}
