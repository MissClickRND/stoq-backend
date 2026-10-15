# Server statistics, expired products and shortage analytics

## Approved user intent

All business statistics displayed by the frontend must come from the backend: dashboard, orders, dishes and dish details, supplies and supply details, warehouse, administration and inventory confirmation/report. Formatting dates/money and counting currently rendered table rows are presentation, not business aggregates. Form price previews remain local; saved statistics and inventory comparison summaries are server-calculated.

The user explicitly confirmed: expired batches are automatically written off, notifications continue, they disappear from the main warehouse table and remain visible only in a separate read-only write-off table. Preserve the existing automatic expiration transaction and notifications. Do not restore written-off stock or invent disposal actions.

Dashboard layout follows the supplied screenshot: three desktop columns, chart spanning the first two in the upper row; below it shortage products and a dish distribution pie; right column contains low stock and expiring batches. Stack on smaller screens. Reuse Mantine, RTK Query and the existing styling/FSD conventions.

On the warehouse page place a button labelled “Просмотреть список продуктов для списания” directly beside the existing “Провести инвентаризацию” button. It opens the read-only expired/write-off table in a modal, with loading, empty and error/retry states.

## Invariants

- Preserve RabbitMQ modules/configuration, exchanges, queues, CommandBusService and `{ success, data/error }` RPC envelopes. Follow current sendCommand/RabbitRPC/executeRpc examples. Reuse suitable commands; new business commands use existing service queues, never a new transport or generic communication wrapper.
- Every DB query and persisted analytics record is scoped by restaurantId; financial data retains FULL_ACCESS restrictions. Warehouse/supplies statistics retain the roles permitted to access those pages. Admin statistics are ADMIN-only.
- Missing/failed queries display errors or `—`, never fabricated zero values. Real empty results can display zero. Unknown historical prices/costs remain null.
- Period boundaries use Europe/Moscow, independently of server/browser timezone. Dashboard supports 7, 14, 30 calendar days inclusive of today; supply statistics use the current Moscow month.
- Order periods use the saved business `Order.date`, consistently with the order form/table, and exclude future-dated orders. They do not mix it with `created_at`.
- No unrelated feature or UI redesign. No changes to deployed data during local implementation. Deployment follows successful tests/migrations and the existing pipeline.

## Agreed HTTP contracts

All URLs below are gateway paths (frontend uses `/api` prefix). Numbers are JSON numbers unless null is stated; identifiers are positive integers; timestamps are ISO strings.

1. `GET /statistics/dashboard?days=14`: `{ days, timezone, from, to, summary: { revenue, earning, averageCheck, orders, completed }, points: [{ date: 'YYYY-MM-DD', label, revenue, earning, orders }] }`. Monetary fields can be null. Revenue uses completed orders' captured item prices; earning subtracts current known recipe cost and remains explicitly an estimate, matching the current UI explanation. Unknown inputs do not become zero. Totals are returned by the backend, including the selected graph metric total.
2. Existing `GET /statistics/dishes` retains `{ total, active, lowStock, stopList }`; active means AVAILABLE (legacy card contract), pie uses active + lowStock versus stopList. No archived/deleted dishes in these counts.
3. Existing `GET /statistics/orders/today` stays compatible; backend fixes day boundaries and unknown price handling. Cancelled count includes rejected/cancelled according to the visible cancelled group, without hiding them from total.
4. `GET /statistics/dishes/:id?days=7`: `{ dishId, today, week, popularity: number|null, sales: [{ date, label, quantity, revenue }], revenue: number|null, ingredientCost: number|null, earning: number|null, availablePortions: number, status }`. Sales come from completed orders and recorded item prices, including older captured sale prices. Rank uses completed portions in the same period; no sales gives null rank. Costs are current known recipe estimates, never fabricated historical expenses.
5. `GET /statistics/shortages?days=14`: `{ trackingStartedAt: string|null, items: [{ productId, name, unit: { id, name, shortName }, incidents, affectedDishes, lastOccurredAt }] }`.
6. `GET /inventory/statistics`: `{ totalProducts, depletedProducts, expiringProducts, spoiledProducts, lowStockProducts: [{ product: { id, name, unit }, quantity }] }`. Product counts use distinct product IDs. Total/depleted use nondeleted catalog products and total usable unexpired stock, not rows of the active batch listing. Expiring = positive usable stock expiring within seven days. Spoiled = distinct products with expired batches/automatic expiration history. Low stock uses the product's total usable quantity <= 10 (not a nearly empty batch when another batch is full).
7. `GET /inventory/write-offs`: `[{ batchId, productId, product: { id, name, unit }, writtenOffQuantity: number|null, writtenOffAt: string|null, expiresAt, reason: 'EXPIRED' }]`. Includes expired batches even when their active balance is zero. Derive lost quantity/time from existing WRITE_OFF / SYSTEM_EXPIRATION movements, aggregate/deduplicate by batch. Do not include active, depleted-by-sale or cancelled-supply batches. Null marks unknown legacy information. Table columns: product, batch, quantity/unit, expiration time, automatic write-off time. No mutation button in this modal.
8. `GET /statistics/supplies`: `{ month: 'YYYY-MM', count, products, total: number|null, average: number|null }`. Current-month noncancelled supply count, delivered product positions, delivered monetary totals; IN_TRANSIT is not received stock. Unknown delivered prices make totals/average null. `GET /statistics/supplies/:id`: `{ id, supplyNumber, receivedAt, positions, total: number|null }`, with tenant and 404 validation.

For supply average, divide delivered total by the number of RECEIVED supplies, not by in-transit supplies. An empty received set has total/average zero. Historical product enrichment may use `{ id, name: 'Продукт №<id>', unit: null }` when a deleted legacy product cannot be resolved; keep its real quantity and identity instead of dropping its record.
9. `GET /auth/admin/statistics`: `{ employees, invitations, requests, admins }`. Invitations means currently active/unexpired/unused/unrevoked invitations; admin count excludes blocked users, requests are pending users. Counts are calculated within the authenticated admin's restaurant.
10. `POST /inventory/preview`: body `{ items: [{ batchId, quantity, remove?: boolean }] }`, returns `{ checked, updated, deleted, unchanged }`. Validate duplicate/missing/foreign IDs and nonnegative finite quantities, compare against current persisted batch balances, never trust client original balances.
11. Existing `PUT /inventory` remains array-compatible by default. Optional `includeReport: true` returns `{ batches, statistics: { checked, updated, deleted, unchanged }, completedAt }`. `statistics` uses transaction-local original quantities versus applied quantities. Actor display data remains from authenticated UI/session; server supplies timestamp and aggregates. HTTP and RPC DTOs permit and forward the optional flag; old clients and tests still get the old array shape.

## Shortage event semantics

- Existing low-stock threshold is at most three portions. AVAILABLE -> LOW_STOCK/STOP_LIST starts a shortage episode for a dish. LOW_STOCK -> STOP_LIST is the same episode, never another incident.
- Attribute an incident to each recipe product whose own available portions <= 3 when the episode starts. Do not count unrelated ingredients. A direct AVAILABLE -> STOP_LIST also counts once.
- Recovery to AVAILABLE resets the episode. A later shortage can increment again. Refreshes, retries, duplicate existing stock events and concurrent refreshes must not inflate counts.
- Persist latest dish state and product incident records in recommendation DB, scoped by restaurant. Use a DB transaction and per-restaurant lock to serialize comparison/update and unique incident identifiers for idempotence. Redis is a cache, not the source of historical counts.
- Initial synchronization records a baseline without inventing past incidents. New dish first observation is also a baseline. Record tracking start time, show a clear empty state until real transitions exist. Do not manufacture historical analytics from current shortage status.
- Observe existing stock/order/expiration refresh flow; do not change event transport/queue configuration. Refresh reads may reconcile the latest state, but repeated identical snapshots do not add incidents. Never advance baseline from an RPC failure.
- Time filtering uses incident occurredAt, affectedDishes is the distinct dish count in the selected period, ranking is incidents descending with stable name/id tie breaking.

## Implementation ownership and plan

1. Inventory/supplies backend unit: inventory stats and write-off history, supply stats, preview/report aggregates, existing RPC handlers/DTOs and business tests. New constants only in inventory topology (names shared with root); do not edit gateway/recommendation/order/auth/frontend files.
2. Frontend unit: typed statistics API, all listed pages/details/confirmation/report, write-off modal, three-column dashboard plus pie/shortage blocks, cache invalidation/polling and UI tests. Do not edit backend files.
3. Root integration: gateway routes/auth restrictions/RPC constants, order statistics source, recommendation aggregate/shortage persistence/migration, admin stats, integration/contract tests, docs, validation and deployment.

New inventory commands: `GET_INVENTORY_STATISTICS = command.inventory.get_statistics`, `GET_INVENTORY_WRITE_OFFS = command.inventory.get_write_offs`, `PREVIEW_INVENTORY = command.inventory.preview`, `GET_SUPPLY_STATISTICS = command.inventory.get_supply_statistics` (optional id returns details). Use existing INVENTORY_COMMANDS queue. Existing UPDATE_QUANTITY_INVENTORY supports optional includeReport. All other new stats commands stay in their owning service's existing queue.

## Verification

Begin with behavior tests that fail for missing functionality. Cover tenant isolation; Moscow midnight/month and inclusive period limits; unknown historical money; completed/rejected order selection; product-vs-batch counting; automatic expiration visibility with zero balances; summed multi-batch stock; inventory preview/transaction reporting; and shortage baseline, repeat reads, duplicate events, worsening, recovery/new episode and concurrent refresh.

Run existing frontend tests/typecheck/production build, service builds and focused + existing business/auth/AI contract suites. Apply migrations on isolated PostgreSQL as application role, including privilege checks. Add a safe end-to-end scenario under a temporary restaurant that drives known stock/order/expiration transitions, checks HTTP counters and shortage persistence, and deletes only its own records. Verify responsive layout against the user screenshot. Deployment must preserve RabbitMQ/Redis/local AI setup and verify both successful Actions and live endpoints.
