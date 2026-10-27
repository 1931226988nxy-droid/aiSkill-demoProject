import { DEFAULT_SETTINGS, PERMISSIONS, ROLE_DEFINITIONS } from '../domain/constants.js'
import { DEFAULT_MENU_TREE } from '../domain/default-menus.js'
import { hashPassword } from '../lib/passwords.js'
import { endOfShanghaiDayAfter } from '../lib/time.js'
import { transaction } from '../lib/transaction.js'
import { password, username } from '../lib/validation.js'

function insertSettings(db, now) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO settings (key, value, type, label, description, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  for (const item of DEFAULT_SETTINGS) {
    insert.run(item.key, item.value, item.type, item.label, item.description, now)
  }
}

function syncPermissions(db, nowIso) {
  const insert = db.prepare(
    `INSERT OR IGNORE INTO permissions
      (code, name, group_name, description, status, is_system, created_at, updated_at)
     VALUES (?, ?, ?, '', 'active', ?, ?, ?)`,
  )
  for (const permission of PERMISSIONS) {
    insert.run(
      permission.code,
      permission.name,
      permission.group,
      permission.system === false ? 0 : 1,
      nowIso,
      nowIso,
    )
  }
  return new Map(
    db
      .prepare('SELECT id, code FROM permissions')
      .all()
      .map((row) => [row.code, row.id]),
  )
}

function ensureBuiltInReaderPermissions(db, nowIso) {
  const readerRole = db.prepare("SELECT id FROM roles WHERE code = 'reader'").get()
  if (!readerRole) return
  const insert = db.prepare(
    `INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
     SELECT ?, id FROM permissions WHERE code = ?`,
  )
  for (const code of [
    'book.read',
    'reader.loans.view',
    'reader.reservations.view',
    'reader.fees.view',
  ]) {
    insert.run(readerRole.id, code)
  }
  void nowIso
}

function insertMenuNode(db, node, parentId, nowIso, permissionIds, parentType = null) {
  const path =
    node.path || (node.type === 'module' ? `/modules/${encodeURIComponent(node.code)}` : null)
  const result = db
    .prepare(
      `INSERT INTO menus
        (parent_id, type, code, title, path, icon, description, sort_order, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    .run(
      parentId,
      node.type,
      node.code,
      node.title,
      path,
      node.icon || '',
      node.description || '',
      node.sortOrder || 0,
      nowIso,
      nowIso,
    )
  const menuId = Number(result.lastInsertRowid)
  const linkPermission = db.prepare(
    `INSERT OR IGNORE INTO menu_permissions (menu_id, permission_id)
     SELECT ?, id FROM permissions WHERE code = ?`,
  )
  for (const code of node.permissionCodes || []) linkPermission.run(menuId, code)
  for (const [index, child] of (node.children || []).entries()) {
    insertMenuNode(db, child, menuId, nowIso, permissionIds, node.type)
    void index
  }
  void parentType
  return menuId
}

function seedDefaultMenus(db, nowIso) {
  const marker = db.prepare("SELECT value FROM settings WHERE key = 'menu_seed_version'").get()
  if (marker) return
  const count = Number(db.prepare('SELECT COUNT(*) AS count FROM menus').get().count)
  if (count > 0) {
    db.prepare(
      `INSERT OR REPLACE INTO settings (key, value, type, label, description, updated_at)
       VALUES ('menu_seed_version', '1', 'string', '菜单种子版本', '系统内部标记', ?)`,
    ).run(nowIso)
    return
  }
  const permissionIds = new Map(
    db.prepare('SELECT id, code FROM permissions').all().map((row) => [row.code, row.id]),
  )
  transaction(db, () => {
    for (const node of DEFAULT_MENU_TREE) {
      insertMenuNode(db, node, null, nowIso, permissionIds)
    }
    db.prepare(
      `INSERT OR REPLACE INTO settings (key, value, type, label, description, updated_at)
       VALUES ('menu_seed_version', '1', 'string', '菜单种子版本', '系统内部标记', ?)`,
    ).run(nowIso)
  })
}

export function seedDatabase(db, {
  clock = () => new Date(),
  demo = true,
  initialAdmin = null,
} = {}) {
  const now = clock()
  const nowIso = now.toISOString()
  insertSettings(db, nowIso)
  const permissionIds = syncPermissions(db, nowIso)
  const existing = db.prepare('SELECT COUNT(*) AS count FROM users').get()
  if (Number(existing.count) > 0) {
    ensureBuiltInReaderPermissions(db, nowIso)
    seedDefaultMenus(db, nowIso)
    return { seeded: false }
  }
  if (!demo && !initialAdmin?.password) {
    throw new Error('生产环境首次启动空数据库时，请设置 INITIAL_ADMIN_PASSWORD')
  }
  const bootstrapAdmin = demo ? null : {
    username: username(initialAdmin?.username || 'admin'),
    password: password(initialAdmin?.password),
  }

  transaction(db, () => {
    if (!demo) {
      db.prepare("UPDATE settings SET value = 'false', updated_at = ? WHERE key = 'allow_registration'")
        .run(nowIso)
    }
    const roleIds = new Map()
    const roleInsert = db.prepare(
      'INSERT INTO roles (code, name, description, built_in, created_at) VALUES (?, ?, ?, ?, ?)',
    )
    for (const role of ROLE_DEFINITIONS) {
      const result = roleInsert.run(
        role.code,
        role.name,
        role.description,
        role.builtIn ? 1 : 0,
        nowIso,
      )
      roleIds.set(role.code, Number(result.lastInsertRowid))
    }
    const rolePermissionInsert = db.prepare(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    )
    for (const role of ROLE_DEFINITIONS) {
      for (const code of role.permissions) {
        const permissionId = permissionIds.get(code)
        if (!permissionId) throw new Error(`缺少权限种子：${code}`)
        rolePermissionInsert.run(roleIds.get(role.code), permissionId)
      }
    }

    const userInsert = db.prepare(
      `INSERT INTO users (username, password_hash, display_name, role_id, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'active', ?, ?)`,
    )
    const readerInsert = db.prepare(
      `INSERT INTO reader_profiles
        (user_id, reader_no, full_name, id_card, phone, email, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    )
    const userRoleInsert = db.prepare(
      'INSERT INTO user_roles (user_id, role_id, created_at) VALUES (?, ?, ?)',
    )
    if (bootstrapAdmin) {
      const adminId = Number(userInsert.run(
        bootstrapAdmin.username,
        hashPassword(bootstrapAdmin.password),
        '系统管理员',
        roleIds.get('admin'),
        nowIso,
        nowIso,
      ).lastInsertRowid)
      userRoleInsert.run(adminId, roleIds.get('admin'), nowIso)
      return
    }
    const admin = Number(
      userInsert.run(
        'admin',
        hashPassword('admin123'),
        '系统管理员',
        roleIds.get('admin'),
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const librarian = Number(
      userInsert.run(
        'librarian',
        hashPassword('lib123456'),
        '王馆员',
        roleIds.get('librarian'),
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const readerUser = Number(
      userInsert.run(
        'reader',
        hashPassword('reader123'),
        '张三',
        roleIds.get('reader'),
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const reader2User = Number(
      userInsert.run(
        'reader2',
        hashPassword('reader123'),
        '李四',
        roleIds.get('reader'),
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const reader3User = Number(
      userInsert.run(
        'reader3',
        hashPassword('reader123'),
        '王五',
        roleIds.get('reader'),
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const reader1 = Number(
      readerInsert.run(
        readerUser,
        'R20260001',
        '张三',
        '110101199001011234',
        '13800000001',
        'zhangsan@example.com',
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const reader2 = Number(
      readerInsert.run(
        reader2User,
        'R20260002',
        '李四',
        '110101199202022345',
        '13800000002',
        'lisi@example.com',
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )
    const reader3 = Number(
      readerInsert.run(
        reader3User,
        'R20260003',
        '王五',
        '110101199303033456',
        '13800000003',
        'wangwu@example.com',
        nowIso,
        nowIso,
      ).lastInsertRowid,
    )

    for (const [userId, roleCode] of [
      [admin, 'admin'],
      [admin, 'librarian'],
      [librarian, 'librarian'],
      [readerUser, 'reader'],
      [reader2User, 'reader'],
      [reader3User, 'reader'],
    ]) {
      userRoleInsert.run(userId, roleIds.get(roleCode), nowIso)
    }

    const categoryInsert = db.prepare(
      'INSERT INTO categories (code, name, created_at) VALUES (?, ?, ?)',
    )
    const categories = [
      ['LIT', '文学'],
      ['CS', '计算机'],
      ['HIS', '历史'],
      ['SCI', '科学'],
      ['ECO', '经济'],
      ['ART', '艺术'],
    ]
    const categoryIds = new Map()
    for (const [code, name] of categories) {
      categoryIds.set(code, Number(categoryInsert.run(code, name, nowIso).lastInsertRowid))
    }

    const authorInsert = db.prepare('INSERT INTO authors (name, created_at) VALUES (?, ?)')
    const authorNames = [
      '余华',
      '刘慈欣',
      '曹雪芹',
      '黄仁宇',
      'Robert C. Martin',
      'Randal E. Bryant',
      '亚当·斯密',
      '尤瓦尔·赫拉利',
    ]
    const authorIds = new Map()
    for (const name of authorNames) {
      authorIds.set(name, Number(authorInsert.run(name, nowIso).lastInsertRowid))
    }

    const books = [
      {
        isbn: '9787506365437',
        title: '活着',
        subtitle: '余华经典长篇小说',
        authors: ['余华'],
        publisher: '作家出版社',
        publishDate: '2012-08-01',
        category: 'LIT',
        keywords: '长篇小说,人生,中国当代文学',
        summary:
          '以福贵的一生折射中国近半个世纪的社会变迁。小说以朴素而克制的叙述，写出人在苦难中的承受与韧性。',
        language: '中文',
        edition: '第3版',
        priceCents: 2800,
        location: '一楼中文借阅区',
        shelf: 'A-01',
      },
      {
        isbn: '9787536692930',
        title: '三体',
        subtitle: '地球往事三部曲之一',
        authors: ['刘慈欣'],
        publisher: '重庆出版社',
        publishDate: '2008-01-01',
        category: 'LIT',
        keywords: '科幻,宇宙,文明',
        summary:
          '人类文明与三体文明首次接触的宏大叙事，以扎实的科学想象展开文明生存与选择的讨论。',
        language: '中文',
        edition: '第1版',
        priceCents: 2300,
        location: '一楼中文借阅区',
        shelf: 'A-02',
      },
      {
        isbn: '9787020002207',
        title: '红楼梦',
        subtitle: '中国古典四大名著之一',
        authors: ['曹雪芹'],
        publisher: '人民文学出版社',
        publishDate: '2008-07-01',
        category: 'LIT',
        keywords: '古典文学,家族,人物',
        summary: '以贾府兴衰为背景，展现封建社会末期的人情世态与人物命运。',
        language: '中文',
        edition: '第3版',
        priceCents: 5980,
        location: '一楼中文借阅区',
        shelf: 'A-03',
      },
      {
        isbn: '9787108009821',
        title: '万历十五年',
        subtitle: '大历史观下的明代切片',
        authors: ['黄仁宇'],
        publisher: '生活·读书·新知三联书店',
        publishDate: '1997-05-01',
        category: 'HIS',
        keywords: '明史,大历史,制度',
        summary: '从万历十五年这一平常年份切入，分析明代政治、财政与制度的结构性困境。',
        language: '中文',
        edition: '第1版',
        priceCents: 2800,
        location: '三楼社科借阅区',
        shelf: 'C-02',
      },
      {
        isbn: '9787115216878',
        title: '代码整洁之道',
        subtitle: '程序员的职业素养',
        authors: ['Robert C. Martin'],
        translator: '韩磊',
        publisher: '人民邮电出版社',
        publishDate: '2010-01-01',
        category: 'CS',
        keywords: '软件工程,代码质量,重构',
        summary: '围绕命名、函数、测试与重构，讨论如何写出清晰、可维护的代码。',
        language: '中文',
        edition: '第1版',
        priceCents: 5900,
        location: '二楼科技借阅区',
        shelf: 'B-06',
      },
      {
        isbn: '9787111544937',
        title: '深入理解计算机系统',
        subtitle: '程序员视角下的计算机系统',
        authors: ['Randal E. Bryant'],
        translator: '龚奕利 贺莲',
        publisher: '机械工业出版社',
        publishDate: '2016-11-01',
        category: 'CS',
        keywords: '计算机系统,操作系统,体系结构',
        summary: '从程序员的视角贯通硬件、操作系统与编译器，是理解计算机系统的重要教材。',
        language: '中文',
        edition: '第3版',
        priceCents: 13900,
        location: '二楼科技借阅区',
        shelf: 'B-07',
      },
      {
        isbn: '9787544253994',
        title: '国富论',
        subtitle: '国民财富的性质和原因的研究',
        authors: ['亚当·斯密'],
        translator: '郭大力 王亚南',
        publisher: '南海出版公司',
        publishDate: '2007-01-01',
        category: 'ECO',
        keywords: '经济学,分工,市场',
        summary: '现代经济学的奠基之作，系统讨论分工、市场、资本与国民财富的形成。',
        language: '中文',
        edition: '第1版',
        priceCents: 6800,
        location: '三楼社科借阅区',
        shelf: 'D-01',
      },
      {
        isbn: '9787508647357',
        title: '人类简史',
        subtitle: '从动物到上帝',
        authors: ['尤瓦尔·赫拉利'],
        translator: '林俊宏',
        publisher: '中信出版社',
        publishDate: '2014-11-01',
        category: 'HIS',
        keywords: '人类学,文明,历史',
        summary: '从认知革命、农业革命到科学革命，重新梳理智人塑造世界的历程。',
        language: '中文',
        edition: '第1版',
        priceCents: 6800,
        location: '三楼社科借阅区',
        shelf: 'C-04',
      },
    ]

    const bookInsert = db.prepare(
      `INSERT INTO books
        (isbn, title, subtitle, translator, publisher, publish_date, category_id, keywords, summary,
         cover_url, language, edition, price_cents, status, created_by, updated_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, 'active', ?, ?, ?, ?)`,
    )
    const bookAuthorInsert = db.prepare(
      'INSERT INTO book_authors (book_id, author_id, position) VALUES (?, ?, ?)',
    )
    const copyInsert = db.prepare(
      `INSERT INTO copies
        (book_id, barcode, location, shelf, status, condition_note, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, '', ?, ?)`,
    )
    const bookIds = []
    for (const [index, book] of books.entries()) {
      const bookId = Number(
        bookInsert.run(
          book.isbn,
          book.title,
          book.subtitle,
          book.translator || '',
          book.publisher,
          book.publishDate,
          categoryIds.get(book.category),
          book.keywords,
          book.summary,
          book.language,
          book.edition,
          book.priceCents,
          admin,
          admin,
          nowIso,
          nowIso,
        ).lastInsertRowid,
      )
      bookIds.push(bookId)
      book.authors.forEach((author, position) => {
        bookAuthorInsert.run(bookId, authorIds.get(author), position)
      })
      const count = book.title === '人类简史' ? 2 : 3
      for (let copyIndex = 0; copyIndex < count; copyIndex += 1) {
        const barcode = `LIB-${String(index + 1).padStart(2, '0')}-${String(copyIndex + 1).padStart(3, '0')}`
        let status = 'available'
        if (book.title === '三体' && copyIndex === 0) status = 'borrowed'
        if (book.title === '三体' && copyIndex === 2) status = 'repair'
        if (book.title === '人类简史') status = 'borrowed'
        copyInsert.run(
          bookId,
          barcode,
          book.location,
          book.shelf,
          status,
          nowIso,
          nowIso,
        )
      }
    }

    const copyByBarcode = (barcode) => db.prepare('SELECT * FROM copies WHERE barcode = ?').get(barcode)
    const loanInsert = db.prepare(
      `INSERT INTO loans
        (copy_id, book_id, reader_id, borrowed_by, borrowed_at, due_at, renewals, status,
         return_condition, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 0, 'active', '', ?, ?)`,
    )
    const borrowedAt = new Date(now.getTime() - 34 * 24 * 60 * 60 * 1000).toISOString()
    const santiCopy = copyByBarcode('LIB-02-001')
    loanInsert.run(
      santiCopy.id,
      santiCopy.book_id,
      reader2,
      librarian,
      borrowedAt,
      endOfShanghaiDayAfter(now, -4),
      nowIso,
      nowIso,
    )
    const historyCopy1 = copyByBarcode('LIB-08-001')
    loanInsert.run(
      historyCopy1.id,
      historyCopy1.book_id,
      reader2,
      librarian,
      new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      endOfShanghaiDayAfter(now, 20),
      nowIso,
      nowIso,
    )
    const historyCopy2 = copyByBarcode('LIB-08-002')
    loanInsert.run(
      historyCopy2.id,
      historyCopy2.book_id,
      reader3,
      librarian,
      new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      endOfShanghaiDayAfter(now, 25),
      nowIso,
      nowIso,
    )
    db.prepare(
      `INSERT INTO reservations (book_id, reader_id, status, created_at, note)
       VALUES (?, ?, 'waiting', ?, '演示预约：等待人类简史归还')`,
    ).run(historyCopy1.book_id, reader1, nowIso)

    db.prepare(
      `INSERT INTO announcements (title, content, status, published_at, created_by, created_at, updated_at)
       VALUES (?, ?, 'published', ?, ?, ?, ?)`,
    ).run(
      '关于暑期开放时间调整的通知',
      '暑期期间，主馆开放时间调整为 08:30–20:30，周末照常开放。借阅台在闭馆前 30 分钟停止办理借还手续。',
      nowIso,
      admin,
      nowIso,
      nowIso,
    )
    db.prepare(
      `INSERT INTO announcements (title, content, status, published_at, created_by, created_at, updated_at)
       VALUES (?, ?, 'published', ?, ?, ?, ?)`,
    ).run(
      '新书入藏：计算机与历史专题',
      '本月新入藏计算机与历史专题图书共 8 种，欢迎读者到二楼科技借阅区与三楼社科借阅区借阅。',
      nowIso,
      admin,
      nowIso,
      nowIso,
    )

    const notificationInsert = db.prepare(
      `INSERT INTO notifications (user_id, type, title, content, created_at)
       VALUES (?, 'welcome', ?, ?, ?)`,
    )
    for (const userId of [readerUser, reader2User, reader3User]) {
      notificationInsert.run(
        userId,
        '欢迎使用图书馆管理系统',
        '您可以检索馆藏、预约图书、查看借阅记录与到期提醒。',
        nowIso,
      )
    }
  })

  ensureBuiltInReaderPermissions(db, nowIso)
  seedDefaultMenus(db, nowIso)
  return { seeded: true, demo }
}
