# 图书馆管理系统 API 与数据契约

## 1. 基础约定

- Base URL：`/api`
- 开发/生产同源部署，前端不保存令牌；登录成功后服务端设置 `HttpOnly`、`SameSite=Strict` 会话 Cookie `lib_session`。
- 请求/响应编码：UTF-8，JSON。
- 时间存储：数据库统一存 UTC ISO 8601 字符串（例如 `2026-10-27T02:00:00.000Z`）。
- 业务时区：`Asia/Shanghai`。应还日期、预约取书期限取上海时区当日 23:59:59.999；统计日期边界也按上海自然日计算。
- 金额：API 使用人民币元（最多两位小数）；数据库以“分”为单位存整数，避免浮点误差。
- 分页响应统一为：

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "pageSize": 20
}
```

- 分页参数：`page`（默认 1）、`pageSize`（默认 20，最大 100）。
- 失败响应统一为：

```json
{
  "code": "VALIDATION_ERROR",
  "message": "请检查输入内容",
  "details": {
    "fields": {
      "isbn": "ISBN 校验失败，请输入有效的 ISBN-10 或 ISBN-13"
    }
  },
  "requestId": "..."
}
```

- 每个响应带 `X-Request-Id`，便于日志追踪。

## 2. 认证与权限

### 登录方式

`POST /api/auth/login`

```json
{ "username": "reader", "password": "reader123" }
```

成功后返回（示例为读者的主角色）：

```json
{
  "user": {
    "id": 3,
    "username": "reader",
    "displayName": "张三",
    "status": "active",
    "role": { "id": 3, "code": "reader", "name": "读者" },
    "primaryRole": { "id": 3, "code": "reader", "name": "读者" },
    "roles": [
      { "id": 2, "code": "librarian", "name": "馆员", "builtIn": true },
      { "id": 3, "code": "reader", "name": "读者", "builtIn": true }
    ],
    "readerId": 1,
    "readerNo": "R20260001",
    "reader": {
      "id": 1,
      "readerNo": "R20260001",
      "status": "active",
      "phone": "13800000001",
      "email": "zhangsan@example.com",
      "idCard": "110101199001011234"
    }
  },
  "permissions": ["book.read", "reader.fees.view", "reader.loans.view", "reader.reservations.view"]
}
```

并设置 `Set-Cookie: lib_session=...; Path=/; HttpOnly; SameSite=Strict`。

### 多角色与当前角色

- 一个账号可拥有多个角色，至少一个角色；`users.role_id` 保存主角色，`user_roles` 保存全部角色。
- 登录后默认激活主角色；`role` 是当前激活角色，`roles` 是全部可选角色，`primaryRole` 是主角色。
- 会话表的 `active_role_id` 保存当前激活角色。切换角色后，后端权限校验、`/navigation` 菜单和前端路由守卫都使用新角色。
- 管理员角色自动拥有所有启用权限（包括以后新增的权限）。
- 读者角色与馆员/管理员角色可以并存；读者角色需要有效读者档案。给无读者档案的账号分配读者角色时，系统自动创建读者档案。
- 读者自助页面同时要求当前角色为读者及对应菜单权限（`reader.loans.view` 等）。


### 权限码

| 权限码 | 说明 | 默认角色 |
| --- | --- | --- |
| `book.read` | 检索、查看图书与馆藏 | 读者/馆员/管理员 |
| `book.manage` | 图书编目、编辑、下架、分类维护 | 馆员/管理员 |
| `copy.manage` | 副本入库、批量导入、盘点、状态变更 | 馆员/管理员 |
| `reader.manage` | 读者档案、启停、敏感信息详情 | 馆员/管理员 |
| `reader.loans.view` | 我的借阅菜单/页面 | 读者 |
| `reader.reservations.view` | 我的预约菜单/页面 | 读者 |
| `reader.fees.view` | 我的费用菜单/页面 | 读者 |
| `circulation.manage` | 借书、还书、遗失登记、借阅查询 | 馆员/管理员 |
| `reservation.manage` | 全量预约队列处理 | 馆员/管理员 |
| `fee.manage` | 费用登记、处理、豁免 | 馆员/管理员 |
| `report.view` | 统计报表与导出 | 馆员/管理员 |
| `announcement.manage` | 公告创建、编辑、发布、撤回 | 管理员 |
| `user.manage` | 馆员账号、角色与权限 | 管理员 |
| `permission.manage` | 权限定义管理 | 管理员 |
| `menu.manage` | 导航菜单结构管理 | 管理员 |
| `settings.manage` | 系统参数与任务扫描 | 管理员 |
| `audit.view` | 审计日志 | 管理员 |

权限定义存于 `permissions` 表，包含 `status`（启用/停用）和 `is_system`（内置权限不可停用）。新增权限会自动出现在角色权限矩阵中；权限编码创建后不可修改。

读者自助业务（续借自己的借阅、取消自己的预约、查看自己的记录）在服务层校验资源归属；自助页面和菜单还绑定上面的读者 view 权限。

### 认证接口

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/auth/options` | 公开 | 登录页选项：`allowRegistration`、`demoAccounts` |
| POST | `/auth/login` | 公开 | 用户名密码登录 |
| POST | `/auth/register` | 公开（受 `allow_registration` 控制） | 读者注册并登录 |
| POST | `/auth/logout` | 登录 | 删除会话并清 Cookie |
| GET | `/auth/me` | 登录 | 当前用户、全部角色、当前角色权限 |
| PATCH | `/auth/profile` | 登录 | 修改姓名、手机、邮箱、身份证号 |
| POST | `/auth/password` | 登录 | 修改密码；保留当前会话，删除其他会话 |
| POST | `/auth/role` | 登录 | 切换当前激活角色，body `{ "roleCode": "librarian" }` |

切换角色成功后返回与登录相同结构的 `user + permissions`；当前会话的 `active_role_id` 同步更新。

### 导航接口

`GET /api/navigation`（登录）

返回当前角色可见的菜单树：

```json
{
  "role": { "id": 1, "code": "admin", "name": "管理员" },
  "items": [
    {
      "id": 2,
      "type": "module",
      "code": "collection",
      "title": "馆藏综合",
      "path": "/modules/collection",
      "icon": "BookOutlined",
      "children": [
        {
          "id": 3,
          "type": "group",
          "code": "collection-access",
          "title": "检索与借阅",
          "children": [
            {
              "id": 4,
              "type": "item",
              "code": "catalog",
              "title": "图书检索",
              "path": "/catalog",
              "icon": "SearchOutlined",
              "permissions": ["book.read"],
              "children": []
            }
          ]
        }
      ]
    }
  ]
}
```

过滤规则：

- 菜单、分组、功能都可绑定多个权限，拥有任意一个即可见；空权限表示所有已登录用户可见。
- 模块/分组没有可见子项时不会返回。
- 停用菜单、停用权限不参与导航。
- 菜单由 `menus` 和 `menu_permissions` 表维护，前端不再写死菜单数组。

## 3. 图书、作者、分类与馆藏

### 图书列表

`GET /api/books`

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `page` / `pageSize` | integer | 分页 |
| `q` | string | 书名、作者、ISBN、关键词、出版社模糊匹配 |
| `title` / `author` / `isbn` / `keyword` | string | 字段级筛选；`isbn` 忽略连字符 |
| `categoryId` | integer | 分类 |
| `availability` | `available` / `unavailable` | 有/无可借副本 |
| `sort` | `newest` / `title` / `publish` / `available` / `relevance` | 排序 |
| `order` | `asc` / `desc` | 排序方向；`title` 默认升序 |
| `status` | `active` / `off_shelf` | 仅具备 `book.manage` 时有效 |

读者只能看到 `active` 图书；馆员/管理员可查看下架图书。

### 图书写入

`POST /api/books`、`PATCH /api/books/:id`，需要 `book.manage`。

```json
{
  "isbn": "9787506365437",
  "title": "活着",
  "subtitle": "余华经典长篇小说",
  "authors": ["余华"],
  "translator": "",
  "publisher": "作家出版社",
  "publishDate": "2012-08-01",
  "categoryId": 1,
  "keywords": "长篇小说,人生",
  "summary": "内容简介……",
  "coverUrl": "https://example.com/cover.jpg",
  "language": "中文",
  "edition": "第3版",
  "price": 28
}
```

校验：ISBN-10/ISBN-13 校验位、书名必填、1–10 位作者、分类必须存在。`isbn` 唯一；同一书名的不同版本使用不同 ISBN，`edition` 记录版本。

`POST /api/books/:id/off-shelf` 需要 `book.manage`，body `{ "reason": "..." }`。存在在借副本或未完成预约时拒绝；仅在架/维修副本会一并下架并写入副本状态日志。

### 分类与作者

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/categories` | `book.read` | 分类列表及图书数 |
| POST | `/categories` | `book.manage` | 新增分类 |
| GET | `/authors` | `book.read` | 作者列表及图书数 |

### 副本

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/books/:bookId/copies` | `book.read` | 某图书的副本 |
| POST | `/books/:bookId/copies` | `copy.manage` | 单副本入库 |
| POST | `/books/:bookId/copies/bulk` | `copy.manage` | 批量入库（≤100） |
| GET | `/copies` | `copy.manage` | 副本分页查询（`q`、`bookId`、`status`、`location`） |
| PATCH | `/copies/:id/status` | `copy.manage` | 状态变更，要求原因 |
| POST | `/copies/inventory` | `copy.manage` | 盘点，返回 found/missing |
| GET | `/copies/:id/logs` | `copy.manage` | 最近 100 条状态日志 |
| GET | `/locations` | `copy.manage` | 馆藏地枚举 |

副本状态：`available`、`borrowed`、`reserved`、`repair`、`lost`、`off_shelf`。手工状态变更只允许 `available`、`repair`、`lost`、`off_shelf`；`borrowed` 必须通过借还业务流转。

批量入库 body：

```json
{
  "barcodes": ["LIB-01-004", "LIB-01-005"],
  "location": "一楼中文借阅区",
  "shelf": "A-01"
}
```

盘点 body：

```json
{
  "barcodes": ["LIB-01-001", "LIB-01-002"],
  "location": "一楼中文借阅区"
}
```

## 4. 借阅、归还、续借与异常

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/my/loans` | 登录读者 | 自己的借阅，支持 `status=all/active/overdue/returned` |
| GET | `/circulation/loans` | `circulation.manage` | 全量借阅，支持 `q`、`status`、`from`、`to`、`readerId` |
| POST | `/circulation/borrow/preview` | `circulation.manage` | 借前校验与摘要 |
| POST | `/circulation/borrow` | `circulation.manage` | 借书 |
| POST | `/circulation/return/preview` | `circulation.manage` | 归还校验、逾期天数与费用预览 |
| POST | `/circulation/return` | `circulation.manage` | 还书 |
| POST | `/circulation/loans/:id/renew` | 读者本人或 `circulation.manage` | 续借 |
| POST | `/circulation/loans/:id/lost` | `circulation.manage` | 遗失登记 |

借书请求：

```json
{ "readerNo": "R20260001", "barcode": "LIB-01-001" }
```

借书校验顺序：读者存在且启用 → 读者证未过期 → 无逾期在借 → 无未缴费用 → 未达借阅上限 → 图书在架 → 同一读者未借同一书 → 副本可借或为本人预约保留 → 无其他预约队列优先权。通过后生成应还日期并发送站内通知。

还书请求：

```json
{ "barcode": "LIB-01-001", "condition": "封面轻微磨损" }
```

还书自动：结束借阅 → 计算并写入/更新逾期费用 → 若存在等待预约，按 `created_at, id` 顺位将副本置为 `reserved` 并通知下一位读者；否则副本回到 `available`。

续借校验：未逾期、未达最大续借次数、该图书无 `waiting/ready` 预约。续借从原应还日期顺延配置天数。

遗失登记：

```json
{ "amount": 68, "note": "读者确认遗失，按定价赔偿" }
```

登记后借阅结束、副本 `lost`、可选生成 `lost` 费用。

## 5. 预约

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/my/reservations` | 登录读者 | 自己的预约及队列位置 |
| POST | `/reservations` | 登录读者 | 创建预约 |
| GET | `/reservations` | `reservation.manage` | 全量预约，支持 `status`、`q`、`bookId`、`readerId` |
| POST | `/reservations/:id/cancel` | 本人或 `reservation.manage` | 取消预约 |

创建 body：`{ "bookId": 8 }`

规则：

- 图书存在且在架；
- 读者启用；
- 读者证未过期；
- 当前无该书的在借记录；
- 同一读者同一书不能有重复 `waiting/ready` 预约（数据库部分唯一索引兜底）；
- 当前有可借副本时不允许预约（提示直接借阅）。

状态：`waiting` → `ready` → `fulfilled` / `expired`，或 `cancelled`。`ready` 超过保留期限由定时任务自动置为 `expired` 并释放/顺延副本。

## 6. 费用

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/my/fees` | 登录读者 | 自己的费用 |
| GET | `/fees` | `fee.manage` | 全量费用（`status`、`type`、`readerId`、`q`） |
| POST | `/fees` | `fee.manage` | 手工登记损坏/遗失/人工费用 |
| POST | `/fees/:id/handle` | `fee.manage` | 线下处理或豁免 |

处理 body：

```json
{ "action": "settle", "note": "线下收款，已确认" }
```

`action` 为 `settle` 或 `waive`。只有 `pending` 可处理；处理后不可重复操作。系统没有在线支付，不伪造支付成功。

逾期费由任务按 `overdueDays × fine_per_day_cents` 计算，写入 `pending` 费用；管理员线下收款后标记 `settled`，或按制度 `waived`。若在图书归还前结清或豁免，后续新增的逾期天数会生成补充待处理费用。读者有任何未缴费用时，借书校验返回 `PENDING_FEES_BLOCK`。

## 7. 读者

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/readers` | `reader.manage` | 分页列表；手机号/身份证默认脱敏 |
| GET | `/readers/lookup?readerNo=` | `reader.manage` 或 `circulation.manage` | 借还台读者概览 |
| POST | `/readers` | `reader.manage` | 创建读者账号和档案 |
| GET | `/readers/:id` | `reader.manage` | 读者详情（完整联系方式） |
| PATCH | `/readers/:id` | `reader.manage` | 编辑资料、借阅上限覆盖、有效期 |
| POST | `/readers/:id/status` | `reader.manage` | 启用/停用，要求原因 |

创建读者 body 至少包含 `username`、`password`、`fullName`，手机号/邮箱至少一项。

## 8. 通知与公告

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/notifications` | 登录 | 自己的站内通知，支持 `unread=1`、`type`、分页 |
| GET | `/notifications/unread-count` | 登录 | 未读数 |
| POST | `/notifications/:id/read` | 登录 | 标记单条已读（校验归属） |
| POST | `/notifications/read-all` | 登录 | 全部已读 |
| GET | `/announcements` | 登录 | 已发布公告 |
| GET/POST/PATCH | `/admin/announcements...` | `announcement.manage` | 管理公告 |
| POST | `/admin/announcements/:id/status` | `announcement.manage` | `published` / `withdrawn` |

通知类型：`welcome`、`loan_borrowed`、`loan_returned`、`loan_renewed`、`loan_due_soon`、`loan_overdue`、`loan_lost`、`reservation_created`、`reservation_ready`、`reservation_expired`、`reservation_cancelled`、`fee_created`、`fee_handled`。

通知适配层位于 `server/services/notification-service.js`：默认写站内通知；可通过构造参数注入实现 `send(notification)` 的外部适配器。外部适配器失败不会回滚借还业务。当前工程没有既有邮件/短信服务，因此不发送外部消息。

## 9. 工作台与报表

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| GET | `/dashboard` | 登录 | 按角色返回工作台指标、近期借阅/预约/公告 |
| GET | `/reports/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` | `report.view` | 馆藏、借阅、逾期、热门图书、分类、趋势 |
| GET | `/reports/export?from=&to=` | `report.view` | 导出 UTF-8 BOM CSV |

统计口径：

- 馆藏总量/可借/逾期/待处理费用：当前实时值；
- 区间借阅量：`loans.borrowed_at` 落在上海日期区间；
- 区间归还量：`loans.returned_at` 落在区间；
- 热门图书：区间内借阅次数排序；
- 分类分布：当前副本按图书分类聚合；
- 趋势：按上海自然日聚合借出/归还。

前端只展示接口返回的聚合值，不用不完整列表推算总量。

## 10. 系统管理

| 方法 | 路径 | 权限 |
| --- | --- | --- |
| GET/POST/PATCH | `/admin/users`、`/admin/users/:id` | `user.manage` |
| POST | `/admin/users/:id/reset-password` | `user.manage` |
| GET | `/admin/permissions` | `user.manage` / `permission.manage` / `menu.manage` |
| POST/PATCH | `/admin/permissions`、`/admin/permissions/:id` | `permission.manage` |
| GET | `/admin/menus` | `menu.manage` |
| POST/PATCH/DELETE | `/admin/menus`、`/admin/menus/:id` | `menu.manage` |
| GET/POST/PATCH/DELETE | `/admin/roles`、`/admin/roles/:id` | `user.manage` |
| PATCH | `/admin/roles/:id/permissions` | `user.manage` |
| GET/PATCH | `/admin/settings` | `settings.manage` |
| GET | `/admin/audit-logs` | `audit.view` |
| GET/POST/PATCH | `/admin/announcements` | `announcement.manage` |
| POST | `/admin/jobs/run` | `settings.manage` |

### 用户多角色

`POST /api/admin/users`：

```json
{
  "username": "multi_role",
  "password": "reader12345",
  "displayName": "多角色用户",
  "roleCodes": ["reader", "librarian"],
  "primaryRoleCode": "reader"
}
```

`PATCH /api/admin/users/:id` 使用同样的 `roleCodes`、`primaryRoleCode` 字段，可同时修改账号状态。每个账号至少需要一个角色；主角色必须属于已分配角色。不能停用自己或修改自己的角色。

用户列表返回 `roles` 数组和 `primaryRoleCode`。只拥有读者角色的账号仍由读者管理维护；拥有馆员/管理员角色的账号会出现在用户管理列表，即使同时拥有读者角色。

### 权限管理

- `GET /admin/permissions` 返回全部权限（含停用），字段：`code`、`name`、`group`、`description`、`status`、`isSystem`。
- 新增权限 body：`{ "code": "archive.inspect", "name": "档案检查", "group": "档案", "description": "..." }`。
- 权限编码创建后不可修改；内置权限不能停用；自定义权限可通过 `status` 停用/启用。
- 管理员角色自动拥有全部启用权限，不需要逐条关联。

### 动态菜单

菜单类型：

| type | 层级 | 说明 |
| --- | --- | --- |
| `module` | 顶层 | 左侧导航模块，路径自动为 `/modules/:code` |
| `group` | 模块下 | 模块工作区中的独立分组卡片 |
| `item` | 模块或分组下 | 具体功能，必须有已注册的路由路径 |

新增/编辑 body：

```json
{
  "type": "item",
  "parentId": 3,
  "code": "archive-inspect",
  "title": "档案检查方案",
  "path": "/catalog",
  "icon": "SearchOutlined",
  "description": "查看档案检查方案",
  "sortOrder": 10,
  "status": "active",
  "permissions": ["archive.inspect"]
}
```

- `code` 创建后不可修改；`module` 的路径由系统生成；`group` 无路径。
- `item` 的路由必须由当前前端路由表注册（前端表单只提供已注册静态路由）。
- `permissions` 可填写新编码；保存时自动创建权限并在权限矩阵中显示。
- `POST/PATCH /admin/menus` 返回 `{ menu, autoCreated }`，`autoCreated` 是自动创建的权限编码数组。
- 菜单树最多模块 → 分组 → 功能三层；功能可选直接挂在模块下。
- 删除存在子菜单的节点会被拒绝；停用父菜单会使整棵子树从导航中消失。
- 当前后台管理页为“系统管理 → 账号与权限 → 权限与菜单”。

### 新增功能流程

1. 开发新 Vue 页面并注册路由，开发对应 API 并加权限校验。
2. 在“权限与菜单”新增接口权限（或在菜单表单直接填写新权限编码自动创建）。
3. 新增模块/分组/功能菜单，功能选择已注册路由。
4. 在“账号与角色”中把权限授给角色，把角色分配给用户。
5. 用户切换角色后，导航和页面权限即时生效。

后台可以动态创建菜单入口和授权，但不能凭空生成前端页面；这是权限/菜单动态化与低代码页面生成的区别。

- 管理员角色拥有全部权限，不允许修改权限集；内置角色不可删除；有账号关联的角色不可删除。
- 委派 `user.manage` 给非管理员角色后，该角色仍不能分配管理员角色、管理管理员账号、修改内置角色或授予超出自身的权限。
- 系统参数：`library_name`、`loan_days`、`max_borrow`、`max_renewals`、`renewal_days`、`reservation_hold_days`、`fine_per_day_cents`、`due_soon_days`、`allow_registration`。
- 审计日志只读，接口不提供修改/删除。
- 任务扫描处理：逾期费用/通知、到期提醒、预约过期、历史等待预约与可借副本的重新分配、过期会话清理。

## 11. 错误码

| 错误码 | HTTP | 说明 |
| --- | --- | --- |
| `AUTH_REQUIRED` | 401 | 未登录或会话过期 |
| `INVALID_CREDENTIALS` | 401 | 用户名/密码或原密码错误 |
| `ACCOUNT_DISABLED` | 403 | 账号停用 |
| `READER_DISABLED` / `READER_EXPIRED` | 403 | 读者证停用/过期 |
| `FORBIDDEN` | 403 | 权限不足 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 422 | 字段校验失败，`details.fields` 给出字段错误 |
| `CONFLICT` | 409 | 唯一约束或状态冲突 |
| `BORROW_LIMIT` | 409 | 达到借阅上限 |
| `OVERDUE_BLOCK` | 409 | 有逾期未还，禁止借书 |
| `PENDING_FEES_BLOCK` | 409 | 有未缴费用，禁止借书 |
| `COPY_NOT_AVAILABLE` | 409 | 副本不可借/已被借出 |
| `COPY_RESERVED` | 409 | 副本/队列已被预约读者优先 |
| `ALREADY_BORROWED_BOOK` | 409 | 同一读者已借同一书 |
| `LOAN_NOT_FOUND` | 404 | 无在借记录 |
| `RENEW_LIMIT` / `RENEW_RESERVED` / `RENEW_OVERDUE` | 409 | 续借规则拒绝 |
| `RESERVATION_DUPLICATE` | 409 | 重复预约 |
| `RESERVATION_NOT_ALLOWED` | 409 | 有可借副本/已在借等 |
| `FEE_ALREADY_HANDLED` | 409 | 费用非待处理 |
| `INVALID_STATUS` | 409 | 非法状态流转 |
| `INTERNAL_ERROR` | 500 | 未预期异常 |

## 12. 数据模型、索引与并发

完整迁移见 `server/db/migrations/001_initial.sql`、`002_rbac_menus.sql` 与 `003_overdue_fee_installments.sql`。

主要实体：

- `users` → 主角色 `roles`；`user_roles` ↔ `roles`（多角色）
- `sessions` → `active_role_id`（当前激活角色）
- `permissions`（权限定义，含启用/停用和内置标记）
- `menus`（模块/标签分组/功能，自关联 parent_id）
- `menu_permissions` ↔ `permissions`
- `reader_profiles` → `users`
- `books` → `categories`，`book_authors` ↔ `authors`
- `copies` → `books`，`copy_status_logs` → `copies`
- `loans` → `copies`、`books`、`reader_profiles`、`users`
- `reservations` → `books`、`reader_profiles`、`copies`
- `fees` → `reader_profiles`、`loans`
- `notifications` → `users`
- `announcements` → `users`
- `settings`
- `audit_logs` → `users`

关键唯一约束：

- `users.username`（NOCASE）、`roles.code`、`permissions.code`
- `user_roles`：`(user_id, role_id)` 主键
- `menus.code` 唯一；`menu_permissions`：`(menu_id, permission_id)` 主键
- `reader_profiles.reader_no`、`reader_profiles.id_card`、`reader_profiles.user_id`
- `books.isbn`
- `authors.name`（NOCASE）
- `categories.code`、`categories.name`
- `copies.barcode`（NOCASE）
- `loans`：部分唯一索引 `UNIQUE(copy_id) WHERE returned_at IS NULL`，以及 `UNIQUE(reader_id, book_id) WHERE returned_at IS NULL`
- `reservations`：部分唯一索引 `UNIQUE(reader_id, book_id) WHERE status IN ('waiting','ready')`
- `fees`：部分唯一索引 `UNIQUE(loan_id, type) WHERE loan_id IS NOT NULL AND status = 'pending'`；同一借阅可保留多笔已结清/豁免历史费用
- `notifications.dedupe_key`（非空时唯一）

关键索引：菜单父级+排序，菜单启用状态，菜单权限权限外键，用户角色角色外键；其余业务索引同前。

并发处理：

- SQLite 开启 `WAL`、`foreign_keys=ON`、`busy_timeout=5000`。
- 借书、还书、续借、预约状态流转、费用处理均使用 `BEGIN IMMEDIATE` 事务，服务端条件更新（如 `WHERE status = 'available'`）确保只有一个请求成功。
- 部分唯一索引作为最后防线，防止同一副本重复在借或同一读者重复预约。
- 借还操作内同时写借阅记录、副本状态、状态日志、通知和审计；任一步失败整体回滚。
- 定时任务使用固定去重键，重复执行不会重复发送同一业务通知或重复创建同一笔逾期费用。

## 13. 演示账号

| 账号 | 密码 | 角色 |
| --- | --- | --- |
| `admin` | `admin123` | 管理员 + 馆员（主角色管理员，可切换） |
| `librarian` | `lib123456` | 馆员 |
| `reader` | `reader123` | 读者（张三，R20260001） |
| `reader2` | `reader123` | 读者（李四，R20260002） |
| `reader3` | `reader123` | 读者（王五，R20260003） |

演示数据仅在开发模式首次启动空库时写入；删除开发数据库后重启会重新生成。生产模式空库首次启动必须提供 `INITIAL_ADMIN_PASSWORD`，只创建初始管理员并关闭自助注册。默认菜单包含“工作台”“馆藏综合”“数据与公告”“系统管理”四个顶层入口。
