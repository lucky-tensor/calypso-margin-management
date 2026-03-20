# MeshMargin V2 — Inventory Position, Reorder Points & Role-Based Access

## 1. Purpose

MeshMargin V1 is a **margin control layer** — it ensures every order is priced correctly. But it has two gaps:

1. **No inventory awareness.** A sales rep can confirm an order for 500 eaches of a product that has 3 left in the warehouse. Managers have no way to set stock buffers, trigger reorder alerts, or prevent overselling.

2. **No role separation.** Every authenticated user sees everything. Managers can't restrict sales reps from inventory configuration, threshold tuning, or operational reports.

This spec adds **inventory position tracking** and **role-based access control** to MeshMargin so that:

- Managers define safety stock levels and reorder points per product SKU
- Sales reps see real-time stock availability during order entry
- Orders that would breach safety stock are **blocked** at the server
- Orders that would drop stock below the reorder point trigger a **warning**
- Stock positions account for both confirmed (approved) and draft (pending) orders at configurable weights
- **Inventory managers** access reports, thresholds, transaction logs, and stock adjustments
- **Sales reps** see a simplified availability signal — enough to sell, not the full operational machinery

---

## 2. Role-Based Access Control

### 2.1 Roles

V1 has no role concept — `UserProperties` is `{ username, password_hash }` and the JWT carries `{ id, username }`. V2 introduces three roles:

| Role | Code | Description |
|------|------|------------|
| **Sales Rep** | `sales_rep` | Creates and manages orders. Sees simplified stock availability (enough to know if they can sell). Cannot configure thresholds, view inventory reports, adjust stock, or mark orders shipped. |
| **Inventory Manager** | `inventory_manager` | Full access to inventory operations: dashboard, transaction logs, stock adjustments, threshold configuration, shipment processing. Can also do everything a sales rep can. |
| **Admin** | `admin` | All permissions. Can manage users and assign roles. Supersets all other roles. |

Roles are **not** hierarchical by default — each role has an explicit capability set. However, `inventory_manager` includes all `sales_rep` capabilities, and `admin` includes everything. This is expressed as a capability union, not inheritance.

### 2.2 Data Model Changes

**UserProperties — extended:**

```typescript
interface UserProperties {
  username: string;
  password_hash: string;
  role: Role;              // NEW — 'sales_rep' | 'inventory_manager' | 'admin'
  display_name: string;    // NEW — human-readable name for audit trails, e.g. "Jane Smith"
}

type Role = 'sales_rep' | 'inventory_manager' | 'admin';
```

**Default role:** New accounts created via `/api/auth/register` default to `sales_rep`. Role can only be changed by an `admin` via `PATCH /api/users/:id`.

**JWT payload — extended:**

```typescript
interface JwtPayload {
  id: string;
  username: string;
  role: Role;        // NEW — included in token so every request carries the role
}
```

**Migration:** Existing users (including seeded demo accounts) that lack a `role` property are treated as `sales_rep` at read time. The seed script is updated to assign explicit roles.

### 2.3 Capability Matrix

Each API endpoint and UI surface maps to a capability. The matrix defines which roles have which capabilities.

**API Capabilities:**

| Capability | Endpoint | `sales_rep` | `inventory_manager` | `admin` |
|-----------|----------|:-----------:|:-------------------:|:-------:|
| Create order | `POST /api/orders` | Yes | Yes | Yes |
| List orders | `GET /api/orders` | Yes | Yes | Yes |
| Confirm order | `PATCH /api/orders/:id` (→confirmed) | Yes | Yes | Yes |
| Cancel order | `PATCH /api/orders/:id` (→cancelled) | Yes | Yes | Yes |
| **Ship order** | `PATCH /api/orders/:id` (→shipped) | **No** | Yes | Yes |
| List products | `GET /api/products` | Yes | Yes | Yes |
| Create product | `POST /api/products` | No | Yes | Yes |
| Edit product (pricing/dimensions) | `PATCH /api/products/:id` | No | Yes | Yes |
| **Edit product (inventory thresholds)** | `PATCH /api/products/:id` (inventory fields) | **No** | Yes | Yes |
| **View stock position** (full) | `GET /api/inventory/:productId` | **No** | Yes | Yes |
| **View stock position** (simplified) | `GET /api/inventory/:productId/availability` | Yes | Yes | Yes |
| **View all stock positions** | `GET /api/inventory` | **No** | Yes | Yes |
| **View transaction log** | `GET /api/inventory/:productId/transactions` | **No** | Yes | Yes |
| **Adjust stock** | `POST /api/inventory/:productId/adjust` | **No** | Yes | Yes |
| Manage users | `PATCH /api/users/:id` | No | No | Yes |
| List users | `GET /api/users` | No | No | Yes |

**UI Visibility:**

| UI Element | `sales_rep` | `inventory_manager` | `admin` |
|-----------|:-----------:|:-------------------:|:-------:|
| Order Entry view | Yes | Yes | Yes |
| Order History view | Yes | Yes | Yes |
| Products view (read-only list) | Yes | Yes | Yes |
| Products view (add/edit) | No | Yes | Yes |
| **Inventory nav item** | **No** | Yes | Yes |
| **Inventory dashboard** | **No** | Yes | Yes |
| **Transaction log** | **No** | Yes | Yes |
| **Stock adjustment dialog** | **No** | Yes | Yes |
| **"Mark Shipped" button** (Order History) | **No** | Yes | Yes |
| **Inventory Settings section** (Product edit) | **No** | Yes | Yes |
| **Full stock breakdown** (Order Entry) | **No** | Yes | Yes |
| **Simplified stock badge** (Order Entry) | Yes | Yes | Yes |
| **User management view** | No | No | Yes |

### 2.4 Sales Rep Stock View vs Manager Stock View

This is a key UX distinction. Both roles see stock information during order entry, but at different levels of detail:

**Sales rep sees — simplified availability badge:**

```
┌─────────────────────┐
│  STOCK               │
│  84 available        │     ← just one number: effective_available
│  [■■■■■■░░░░]       │     ← color-coded bar (green/amber/red)
│  Status: In Stock    │     ← or "Low Stock" or "Out of Stock"
└─────────────────────┘
```

Three status labels for sales reps (not the technical terms):
- Green: **"In Stock"** — go ahead and sell
- Amber: **"Low Stock"** — sell, but be aware availability is limited
- Red: **"Out of Stock"** — order will be blocked

The sales rep does **not** see: committed_qty, pending_qty, pending_order_weight, reorder_point, safety_stock, days_of_stock, or any threshold configuration. These are operational details that would confuse the workflow and give reps information they shouldn't act on (e.g., negotiating price based on stock levels).

**Inventory manager sees — full stock position:**

The full breakdown as specified in Section 7.1 (qty_on_hand, committed, pending with weight, effective_available, reorder_point, safety_stock, days_of_stock).

### 2.5 API Enforcement

**Server-side middleware — `requireRole()`:**

Every protected endpoint uses a role check after authentication:

```typescript
function requireRole(...allowed: Role[]): (user: AuthenticatedUser) => boolean {
  return (user) => allowed.includes(user.role);
}
```

**Enforcement is server-side only.** The frontend hides UI elements based on role, but the server independently validates every request. A sales rep who crafts a direct API call to `POST /api/inventory/:id/adjust` gets a `403 Forbidden` response.

**403 response format:**

```json
{
  "error": "Forbidden",
  "message": "This action requires the inventory_manager role.",
  "required_role": "inventory_manager",
  "current_role": "sales_rep"
}
```

### 2.6 Simplified Availability Endpoint

A new endpoint exists specifically for the sales rep's limited stock view:

```
GET /api/inventory/:productId/availability
```

Returns only what a sales rep needs:

```json
{
  "product_id": "...",
  "effective_available": 84,
  "status": "warning",
  "status_label": "Low Stock",
  "can_order": true
}
```

This endpoint is accessible to all authenticated roles. It computes the same `effective_available` as the full stock position endpoint, but returns a minimal payload that exposes no operational details (no thresholds, no breakdown, no weights).

### 2.7 Auth API Changes

**`GET /api/auth/me` — extended response:**

```json
{
  "user": {
    "id": "...",
    "username": "sales_rep",
    "role": "sales_rep",
    "display_name": "Demo Sales Rep"
  }
}
```

The frontend `AuthContext` stores the role and makes it available via `useAuth()`. The `User` interface becomes:

```typescript
interface User {
  id: string;
  username: string;
  role: Role;
  display_name: string;
}
```

**`POST /api/auth/register` — role assignment:**

New accounts default to `sales_rep`. The request body can optionally include a `role` field, but **only if the request is made by an authenticated `admin`**. Unauthenticated registration always produces a `sales_rep`.

**New endpoints:**

| Method | Path | Auth | Role | Description |
|--------|------|------|------|-------------|
| `GET` | `/api/users` | Yes | `admin` | List all users (id, username, role, display_name — no password_hash) |
| `PATCH` | `/api/users/:id` | Yes | `admin` | Update user role and/or display_name |

### 2.8 Frontend Role Gating

**Navigation filtering:**

```typescript
const navItems = [
  { id: 'order-entry', icon: ShoppingCart, label: 'Order Entry', roles: ['sales_rep', 'inventory_manager', 'admin'] },
  { id: 'products',    icon: Package,      label: 'Products',    roles: ['sales_rep', 'inventory_manager', 'admin'] },
  { id: 'inventory',   icon: Warehouse,    label: 'Inventory',   roles: ['inventory_manager', 'admin'] },
  { id: 'history',     icon: History,       label: 'History',     roles: ['sales_rep', 'inventory_manager', 'admin'] },
  { id: 'users',       icon: Users,        label: 'Users',       roles: ['admin'] },
];

// Filter to only show nav items the current user's role allows
const visibleNav = navItems.filter(item => item.roles.includes(user.role));
```

**Component-level gating:**

A `<RoleGate role={...}>` wrapper component conditionally renders children based on the current user's role:

```tsx
<RoleGate role="inventory_manager">
  <InventorySettingsSection product={product} />
</RoleGate>
```

This is a convenience for UI rendering. It does not replace server-side enforcement.

---

## 3. Core Concepts

### Stock Position Model

Every product SKU has an **inventory position** computed from three inputs:

```
┌─────────────────────────────────────────────────────┐
│                    qty_on_hand                       │  Physical stock in warehouse
├─────────────────────────────────────────────────────┤
│  - committed_qty (confirmed orders, weight = 1.0)   │  Definitely leaving
│  - pending_qty × pending_weight (draft orders)      │  Probably leaving
├─────────────────────────────────────────────────────┤
│  = effective_available                               │  What you can actually sell
└─────────────────────────────────────────────────────┘
```

| Term | Definition |
|------|-----------|
| `qty_on_hand` | Physical inventory in the warehouse. Updated via inventory transactions (receipts, adjustments, shipments). |
| `committed_qty` | Sum of `qty_eaches` across all **confirmed** (not cancelled) orders for this product. These units are spoken for — they will ship. Counted at 100%. |
| `pending_qty` | Sum of `qty_eaches` across all **draft** orders for this product. Some will convert to confirmed, some will be cancelled. |
| `pending_order_weight` | Manager-configurable weight (0.0–1.0) applied to `pending_qty`. Default: `0.70` (assume 70% of drafts will convert). |
| `net_available` | `qty_on_hand - committed_qty`. Hard floor — ignores drafts entirely. |
| `effective_available` | `qty_on_hand - committed_qty - (pending_qty × pending_order_weight)`. The realistic sellable stock. This is the number used for threshold evaluation. |

### Threshold Evaluation

Three-tier system, mirroring the existing margin health model:

```
qty_on_hand
│
│   ▲ effective_available is here
│
├── reorder_point ──────── stock_warning:  "Reorder needed"
│                          Order ALLOWED, response includes warning flag.
│                          UI shows amber stock badge.
│
├── safety_stock ───────── stock_critical: "Safety stock breached"
│                          Order BLOCKED (server returns 400).
│                          UI shows red badge + disabled confirm button.
│
└── 0
```

| Status | Condition | Behavior |
|--------|-----------|----------|
| `healthy` | `effective_available > reorder_point` | No indicator. Business as usual. |
| `warning` | `safety_stock < effective_available ≤ reorder_point` | Order **allowed**. Response includes `stock_warning: true`. UI shows amber "Reorder Needed" badge. |
| `critical` | `effective_available ≤ safety_stock` | Order **blocked**. Server returns 400 with `stock_blocked` error. UI prevents submission. |

**Threshold evaluation happens prospectively** — the system checks what the stock position *would be* after the new order, not what it is now. This prevents the last order from breaching safety stock.

```
projected_effective = effective_available - new_order_qty_eaches
```

---

## 4. Data Model Changes

### 4.1 ProductProperties — New Fields

Added to the existing `ProductProperties` interface:

```typescript
// --- Inventory configuration (set by managers) ---

qty_on_hand_eaches: number;        // Current physical stock. Updated via inventory
                                    // transactions. Default: 0.

safety_stock_eaches: number;       // Absolute minimum buffer. Orders that would drop
                                    // effective_available to or below this level are
                                    // BLOCKED. Default: 0 (no safety stock enforced).

reorder_point_eaches: number;      // Trigger level. When effective_available drops to
                                    // or below this level, a "reorder needed" warning
                                    // is surfaced. Must be >= safety_stock. Default: 0.

reorder_qty_eaches: number | null; // Standard replenishment quantity — how many eaches
                                    // to order from the supplier. Informational only
                                    // (no auto-PO in V2). null = not configured.

lead_time_days: number | null;     // Supplier lead time in calendar days. Used for
                                    // "days until stockout" calculation. null = unknown.

pending_order_weight: number;      // Weight applied to draft order qty when computing
                                    // effective_available. Range: 0.0 to 1.0.
                                    // Default: 0.70. Set to 0.0 to ignore drafts
                                    // entirely; set to 1.0 to treat drafts as firm.
```

**`qty_on_hand_eaches` is denormalized.** The authoritative value is the sum of all inventory transactions for the product. The product entity caches this value for fast reads. It is recomputed on every inventory transaction write.

**Validation rules (additions):**

- `safety_stock_eaches >= 0`
- `reorder_point_eaches >= safety_stock_eaches`
- `reorder_qty_eaches > 0` when not null
- `lead_time_days > 0` when not null
- `0.0 <= pending_order_weight <= 1.0`

### 4.2 New Entity Type: `inventory_txn`

Every stock movement is an immutable transaction record. This provides a full audit trail and makes `qty_on_hand` reproducible at any point in time.

```typescript
type InventoryTxnType =
  | 'initial'       // Opening balance (seed / go-live)
  | 'receipt'        // Stock received from supplier
  | 'adjustment'     // Manual correction (positive or negative)
  | 'shipment'       // Stock leaves warehouse (order fulfilled)
  | 'return';        // Stock returned to warehouse

interface InventoryTxnProperties {
  product_id: string;                // FK to product entity
  product_sku: string;               // Denormalized for display
  txn_type: InventoryTxnType;
  qty_eaches: number;                // Positive = stock in, negative = stock out.
                                     //   receipt/initial/return: positive
                                     //   shipment: negative
                                     //   adjustment: either direction
  reference: string;                 // Free-text: PO number, order ID, reason, etc.
  balance_after: number;             // Running balance snapshot (qty_on_hand after this txn)
  created_by: string;                // User ID
}
```

**Entity storage:** Stored in the existing `entities` table with `type = 'inventory_txn'`.

**`balance_after`:** Computed at write time as `previous_balance + qty_eaches`. Stored for fast display in the transaction log without re-summing history.

**Immutability:** Inventory transactions are never updated or deleted. Corrections are made by posting a new `adjustment` transaction. This mirrors accounting journal discipline.

### 4.3 OrderProperties — New Fields

```typescript
// --- Inventory snapshot (frozen at order creation) ---

stock_position_at_creation: {
  qty_on_hand: number;
  committed_qty: number;
  pending_qty: number;
  effective_available: number;
  projected_effective: number;     // effective_available after this order
  stock_status: StockStatus;       // status at time of creation
};
```

This snapshot is informational — it records the stock position the sales rep saw when the order was created. It does not change when stock changes later.

### 4.4 New Status: `shipped`

The order status machine gains a fourth state to trigger stock decrement:

```
draft ──→ confirmed ──→ shipped
  │           │
  │           ▼
  └──────→ cancelled
```

| Transition | Side Effect |
|-----------|-------------|
| `draft → confirmed` | Sets `confirmed_by`, `confirmed_at`. No stock movement. |
| `confirmed → shipped` | Sets `shipped_by`, `shipped_at`. Creates a `shipment` inventory_txn with `qty_eaches = -order.qty_eaches`. Updates product `qty_on_hand_eaches`. |
| `draft → cancelled` | Sets `cancelled_by`, `cancelled_at`. No stock movement. |
| `confirmed → cancelled` | Sets `cancelled_by`, `cancelled_at`. No stock movement (nothing shipped). |

**New audit fields on OrderProperties:**

```typescript
shipped_by: string | null;
shipped_at: string | null;
```

---

## 5. Stock Position Engine

All functions are **pure** and live in `packages/core/inventory.ts` alongside the existing conversion engine. They run both server-side (authoritative) and client-side (live preview).

### 5.1 Types

```typescript
type StockStatus = 'healthy' | 'warning' | 'critical';

interface StockPosition {
  qty_on_hand: number;         // Physical stock (from product)
  committed_qty: number;       // Sum of confirmed order eaches
  pending_qty: number;         // Sum of draft order eaches
  net_available: number;       // qty_on_hand - committed_qty
  effective_available: number; // qty_on_hand - committed_qty - (pending_qty × weight)
  status: StockStatus;
  reorder_point: number;       // Echo back for display
  safety_stock: number;        // Echo back for display
  reorder_qty: number | null;
  lead_time_days: number | null;
  days_of_stock: number | null; // effective_available / avg_daily_usage (null if no data)
}

interface StockCheckResult {
  allowed: boolean;
  position: StockPosition;
  projected_effective: number;  // effective_available after proposed order
  projected_status: StockStatus;
  warning: string | null;       // Human-readable warning if status != healthy
  block_reason: string | null;  // Human-readable reason if blocked
}
```

### 5.2 Functions

```
computeStockPosition(
  product: Product,
  confirmedOrderQtyEaches: number,
  draftOrderQtyEaches: number,
) → StockPosition
```

Core calculation. All inputs are scalars — the caller aggregates orders before calling.

```
effective_available = qty_on_hand - committed - (pending × pending_order_weight)
```

Status evaluation:

```
if effective_available > reorder_point → 'healthy'
if effective_available > safety_stock  → 'warning'
else                                   → 'critical'
```

---

```
checkOrderStock(
  product: Product,
  confirmedOrderQtyEaches: number,
  draftOrderQtyEaches: number,
  newOrderQtyEaches: number,
) → StockCheckResult
```

**Prospective check.** Computes the stock position *as if* the new order were added as a draft, then evaluates thresholds.

```
projected_pending = draftOrderQtyEaches + newOrderQtyEaches
projected_effective = qty_on_hand - committed - (projected_pending × weight)
```

Decision:

```
if projected_effective ≤ safety_stock:
  allowed = false
  block_reason = "Order would breach safety stock. Available: X, Safety stock: Y, This order: Z eaches."

elif projected_effective ≤ reorder_point:
  allowed = true
  warning = "Stock below reorder point after this order. Effective available: X, Reorder point: Y."

else:
  allowed = true
  warning = null
```

---

```
computeDaysOfStock(
  effectiveAvailable: number,
  avgDailyUsageEaches: number,
) → number | null
```

Returns `effective_available / avg_daily_usage`, or null if usage is zero/unknown. `avg_daily_usage` is computed server-side from confirmed order history over the trailing 30 days (configurable). This is a display-only metric — not used for threshold decisions.

---

## 6. API Changes

### 6.1 Products — Inventory Fields

`POST /api/products` and `PATCH /api/products/:id` accept the new inventory configuration fields. Validation enforced per Section 4.1.

`GET /api/products` returns the new fields. Existing products that predate this feature default to:

```json
{
  "qty_on_hand_eaches": 0,
  "safety_stock_eaches": 0,
  "reorder_point_eaches": 0,
  "reorder_qty_eaches": null,
  "lead_time_days": null,
  "pending_order_weight": 0.70
}
```

### 6.2 Stock Position Endpoint

```
GET /api/inventory/:productId
```

Returns the live `StockPosition` for a single product. Server computes `committed_qty` and `pending_qty` by aggregating orders:

```sql
SELECT
  COALESCE(SUM(
    CASE WHEN properties->>'status' = 'confirmed'
    THEN (properties->>'qty_eaches')::numeric END
  ), 0) AS committed_qty,
  COALESCE(SUM(
    CASE WHEN properties->>'status' = 'draft'
    THEN (properties->>'qty_eaches')::numeric END
  ), 0) AS pending_qty
FROM entities
WHERE type = 'order'
  AND properties->>'product_id' = :productId
```

Response:

```json
{
  "product_id": "...",
  "product_sku": "WM-4X4-10GA",
  "position": {
    "qty_on_hand": 150,
    "committed_qty": 45,
    "pending_qty": 30,
    "net_available": 105,
    "effective_available": 84,
    "status": "warning",
    "reorder_point": 100,
    "safety_stock": 25,
    "reorder_qty": 200,
    "lead_time_days": 14,
    "days_of_stock": 12.0
  }
}
```

---

```
GET /api/inventory
```

Returns stock positions for **all** products. Used by the Inventory dashboard. Same computation, batched.

Response: `Array<{ product_id, product_sku, product_name, position: StockPosition }>`

---

### 6.3 Inventory Transactions

```
GET /api/inventory/:productId/transactions
```

Returns the transaction log for a product, newest first. Supports `?limit=` and `?offset=` pagination.

Response:

```json
[
  {
    "id": "...",
    "created_at": "2026-03-20T14:30:00Z",
    "properties": {
      "product_id": "...",
      "product_sku": "WM-4X4-10GA",
      "txn_type": "receipt",
      "qty_eaches": 200,
      "reference": "PO-2026-0451",
      "balance_after": 350,
      "created_by": "user-id"
    }
  }
]
```

---

```
POST /api/inventory/:productId/adjust
```

Creates a manual inventory transaction (receipt, adjustment, or return). `initial` transactions are created by the seed script only.

Request:

```json
{
  "txn_type": "receipt" | "adjustment" | "return",
  "qty_eaches": 200,
  "reference": "PO-2026-0451"
}
```

**Server-side effects:**

1. Validate `txn_type` is one of the allowed manual types
2. Compute `balance_after = current_qty_on_hand + qty_eaches`
3. Reject if `balance_after < 0` (cannot go negative)
4. Insert `inventory_txn` entity
5. Update `product.properties.qty_on_hand_eaches = balance_after`
6. Return the transaction and updated stock position

---

### 6.4 Order Creation — Stock Gate

`POST /api/orders` gains a stock availability check **after** margin validation and **before** insert:

```
1. Fetch product
2. Compute order fields (conversions, cost, margin)   ← existing
3. Validate margin >= floor                            ← existing
4. Aggregate committed_qty and pending_qty for product ← NEW
5. Call checkOrderStock(product, committed, pending, new_order_qty_eaches) ← NEW
6. If !allowed → return 400 { error, stock_position }  ← NEW
7. Insert order with stock_position_at_creation snapshot ← NEW
8. Return order (with stock_warning flag if applicable) ← NEW
```

Response additions on success:

```json
{
  "id": "...",
  "properties": { "..." },
  "stock_warning": "Stock below reorder point after this order. Effective available: 84, Reorder point: 100."
}
```

### 6.5 Order Status Transition — `shipped`

`PATCH /api/orders/:id` with `{ "status": "shipped" }`:

1. Validate transition: only `confirmed → shipped` is allowed
2. Set `shipped_by` and `shipped_at`
3. Create `shipment` inventory_txn: `{ qty_eaches: -order.qty_eaches, reference: order.id }`
4. Update `product.qty_on_hand_eaches -= order.qty_eaches`
5. Return updated order

---

## 7. UI Changes

### 7.1 Order Entry — Stock Position Display

When a product is selected, the Order Entry view fetches `GET /api/inventory/:productId` and displays a **stock badge** next to the product context line:

```
+---------------------------+---------------------------+
|  INPUTS                   |  RESULTS                  |
|                           |                           |
|  Customer: [___________]  |  PRODUCT CONTEXT          |
|  Product: [dropdown    ]  |  1 each = 48"×120" (10ft) |
|  Quantity: [___] [UOM v]  |  Galvanized Steel         |
|  Price/Unit: [$___.__]    |                           |
|                           |  STOCK POSITION           |
|                           |  ┌───────────────────┐    |
|                           |  │ 150 on hand        │    |
|                           |  │  45 committed       │    |
|                           |  │  30 pending (×0.7)  │    |
|                           |  │ ─────────────────── │    |
|                           |  │  84 effective avail │    |
|                           |  │ [■■■■■■░░░░] 56%   │    |
|                           |  │ Reorder: 100        │    |
|                           |  │ Safety:   25        │    |
|                           |  └───────────────────┘    |
|                           |                           |
|                           |  UNIT CONVERSIONS         |
|                           |  ...                      |
```

**Stock bar:** Visual fill from 0 to `reorder_point + safety_stock` (or `qty_on_hand` if larger). Color matches status:

- Green (`healthy`): effective_available > reorder_point
- Amber (`warning`): safety_stock < effective_available ≤ reorder_point
- Red (`critical`): effective_available ≤ safety_stock

**After the user enters quantity:** The display updates to show projected position:

```
│  84 effective avail        │
│  → 74 after this order     │
│  Status: WARNING           │
│  "Stock below reorder pt"  │
```

**When blocked (critical):**

- Confirm Order button is **disabled**
- Red banner: "Cannot create order — would breach safety stock for WM-4X4-10GA. Available: 84 eaches, safety stock: 25, this order requires: 100 eaches."

### 7.2 Product Catalog — Inventory Configuration

The Add/Edit Product modal gains a new **Inventory** section:

```
───── Inventory Settings ─────

Safety Stock (eaches):   [____25__]
Reorder Point (eaches):  [___100__]
Reorder Qty (eaches):    [___200__]   (optional)
Lead Time (days):        [____14__]   (optional)
Pending Order Weight:    [__0.70__]   (0.0 – 1.0)

Current Stock (eaches):  150          [Adjust Stock]
```

The "Adjust Stock" button opens a small dialog for posting inventory transactions (receipt, adjustment, return) without navigating away.

### 7.3 Inventory Dashboard — New View

New nav item: **Inventory** (between Products and History).

```
+----------------------------------------------------------+
|  INVENTORY DASHBOARD                        [Adjust +]   |
+----------------------------------------------------------+
|                                                          |
|  Filter: [All ▼] [Below Reorder ▼] [Critical ▼]        |
|                                                          |
|  ┌──────────┬────────┬───────┬────────┬────────┬───────┐ |
|  │ SKU      │ On Hand│ Comtd │ Pndg   │ Eff.   │Status │ |
|  │          │        │       │ (wtd)  │ Avail  │       │ |
|  ├──────────┼────────┼───────┼────────┼────────┼───────┤ |
|  │ WM-..GA  │ 150    │ 45    │ 21     │ 84     │ ⚠ Warn│ |
|  │ WM-..96  │ 80     │ 10    │ 7      │ 65     │ ● OK  │ |
|  │ WM-..120 │ 12     │ 8     │ 5      │ 0.5    │ ✖ Crit│ |
|  │ WM-..240 │ 200    │ 20    │ 14     │ 170    │ ● OK  │ |
|  │ WM-..240 │ 45     │ 40    │ 10     │ -2     │ ✖ Crit│ |
|  └──────────┴────────┴───────┴────────┴────────┴───────┘ |
|                                                          |
|  Click row → transaction log + adjust stock              |
+----------------------------------------------------------+
```

**Row click** expands or navigates to the product's transaction log:

```
  Transaction Log: WM-4X4-10GA
  ┌────────────┬──────────┬──────────┬─────────┬──────────┐
  │ Date       │ Type     │ Qty      │ Balance │ Ref      │
  ├────────────┼──────────┼──────────┼─────────┼──────────┤
  │ 2026-03-20 │ Receipt  │ +200     │ 350     │ PO-0451  │
  │ 2026-03-18 │ Shipment │ -50      │ 150     │ ord-abc  │
  │ 2026-03-15 │ Receipt  │ +100     │ 200     │ PO-0448  │
  │ 2026-03-01 │ Initial  │ +100     │ 100     │ Go-live  │
  └────────────┴──────────┴──────────┴─────────┴──────────┘
```

### 7.4 Order History — Stock & Shipment

- New status filter option: `shipped`
- Order cards for confirmed orders show a **"Mark Shipped"** button
- Shipped orders display the `shipped_by` and `shipped_at` audit fields
- Each order card shows the `stock_position_at_creation` snapshot so managers can review what the sales rep saw at order time

---

## 8. Seed Data

### 8.1 Demo Users — Updated

The existing demo users gain roles. A third demo user is added for the inventory manager persona:

```typescript
const DEMO_USERS = [
  { username: 'sales_rep',     password: 'demo1234', role: 'sales_rep',          display_name: 'Demo Sales Rep' },
  { username: 'order_clerk',   password: 'demo1234', role: 'sales_rep',          display_name: 'Demo Order Clerk' },
  { username: 'inv_manager',   password: 'demo1234', role: 'inventory_manager',  display_name: 'Demo Inventory Mgr' },
  { username: 'admin',         password: 'demo1234', role: 'admin',              display_name: 'Demo Admin' },
];
```

The Login screen's demo account buttons update to show all four accounts with their role labels.

### 8.2 Inventory Data

The demo seed extends to populate inventory data for all five products:

```typescript
const INVENTORY_SEED = [
  { sku: 'WM-4X4-10GA',        qty_on_hand: 150, safety_stock: 25,  reorder_point: 100, reorder_qty: 200, lead_time_days: 14 },
  { sku: 'WM-4X4-10GA-36X96',  qty_on_hand: 80,  safety_stock: 15,  reorder_point: 50,  reorder_qty: 100, lead_time_days: 14 },
  { sku: 'WM-4X4-10GA-60X120', qty_on_hand: 12,  safety_stock: 10,  reorder_point: 40,  reorder_qty: 80,  lead_time_days: 21 },
  { sku: 'WM-4X4-10GA-48X240', qty_on_hand: 200, safety_stock: 30,  reorder_point: 80,  reorder_qty: 150, lead_time_days: 14 },
  { sku: 'WM-4X4-10GA-60X240', qty_on_hand: 45,  safety_stock: 20,  reorder_point: 60,  reorder_qty: 120, lead_time_days: 21 },
];
```

Each product gets:

1. Inventory config fields added to product properties
2. An `initial` inventory transaction recording the opening balance
3. `pending_order_weight` set to `0.70` (default)

Note: `WM-4X4-10GA-60X120` is seeded near-critical (12 on hand, safety stock 10) to demonstrate the blocking/warning behavior in demos.

### 8.3 Demo Walkthrough Path

The seed data is designed to support this demo flow:

1. **Login as `sales_rep`** → Order Entry. Select WM-4X4-10GA. See green "In Stock" badge (84 available). Enter order. See amber "Low Stock" after.  Select WM-4X4-10GA-60X120. See red "Out of Stock." Confirm button disabled. Note: no inventory nav, no threshold visibility, no "Mark Shipped" button.
2. **Login as `inv_manager`** → Inventory dashboard shows all 5 products with full breakdowns. WM-60X120 is critical. Click to see transaction log. Adjust stock (+50 receipt). Product goes healthy. Switch to Order Entry — see full stock position with committed/pending/weight breakdown. Go to History — "Mark Shipped" button visible on confirmed orders.
3. **Login as `admin`** → Users view. Change `order_clerk` role to `inventory_manager`. Log in as `order_clerk` — now sees Inventory nav.

---

## 9. Example Scenarios

### Scenario 1: Healthy stock — order proceeds normally

**Product:** WM-4X4-10GA (qty_on_hand: 150, safety: 25, reorder: 100, weight: 0.70)
**Existing orders:** 45 eaches confirmed, 30 eaches in draft

```
effective_available = 150 - 45 - (30 × 0.70) = 84
```

**New order:** 10 eaches

```
projected_pending = 30 + 10 = 40
projected_effective = 150 - 45 - (40 × 0.70) = 77
77 > 25 (safety) → allowed
77 < 100 (reorder) → warning: "Stock below reorder point"
```

**Result:** Order created. Response includes `stock_warning`. UI shows amber badge.

### Scenario 2: Order blocked — would breach safety stock

**Product:** WM-4X4-10GA-60X120 (qty_on_hand: 12, safety: 10, reorder: 40, weight: 0.70)
**Existing orders:** 8 confirmed, 5 draft

```
effective_available = 12 - 8 - (5 × 0.70) = 0.5
```

**New order:** 3 eaches

```
projected_pending = 5 + 3 = 8
projected_effective = 12 - 8 - (8 × 0.70) = -1.6
-1.6 ≤ 10 (safety) → BLOCKED
```

**Result:** Server returns 400. Message: "Cannot create order — would breach safety stock for WM-4X4-10GA-60X120. Effective available: 0.5 eaches, safety stock: 10, this order requires: 3 eaches."

### Scenario 3: Manager adjusts pending weight

A manager finds that 90% of their drafts convert (high-volume account). They set `pending_order_weight = 0.90` for WM-4X4-10GA.

**Same numbers as Scenario 1:**

```
effective_available = 150 - 45 - (30 × 0.90) = 78
```

The higher weight makes the system more conservative — it triggers reorder warnings earlier and blocks orders sooner. This is the correct behavior for a product where drafts almost always convert.

### Scenario 4: Shipment decrements stock

An order for 50 eaches of WM-4X4-10GA is marked "shipped":

1. Server validates: confirmed → shipped (allowed)
2. Creates inventory_txn: `{ txn_type: 'shipment', qty_eaches: -50, reference: order.id, balance_after: 100 }`
3. Updates product: `qty_on_hand_eaches = 100`
4. Stock position recalculates on next query

### Scenario 5: Sales rep sees simplified view, manager sees full breakdown

**Same product, same stock — different views based on role.**

**Sales rep logs in:** Selects WM-4X4-10GA in Order Entry. Calls `GET /api/inventory/:id/availability`. Sees:

```
┌─────────────────────┐
│  STOCK               │
│  84 available        │
│  [■■■■■■░░░░]       │
│  Status: Low Stock   │
└─────────────────────┘
```

No visibility into committed vs pending breakdown, no thresholds, no weights. They know they can sell ~84 eaches. The nav has three items: Order Entry, Products, History. No Inventory tab.

**Inventory manager logs in:** Selects same product. Calls `GET /api/inventory/:id`. Sees:

```
┌───────────────────────┐
│  STOCK POSITION        │
│  150 on hand           │
│   45 committed         │
│   30 pending (×0.70)   │
│  ────────────────────  │
│   84 effective avail   │
│  [■■■■■■░░░░] 56%    │
│  Reorder pt:  100      │
│  Safety stk:   25      │
│  Days of stock: 12     │
└───────────────────────┘
```

Nav has four items: Order Entry, Products, Inventory, History. Can click into Inventory dashboard, adjust stock, configure thresholds, mark orders shipped.

### Scenario 6: Sales rep blocked — attempts API bypass

Sales rep crafts a direct `POST /api/inventory/abc/adjust` request to add stock. Server checks `user.role` from the JWT:

```json
{ "error": "Forbidden", "message": "This action requires the inventory_manager role.", "required_role": "inventory_manager", "current_role": "sales_rep" }
```

403 returned. Enforcement is always server-side, never just UI hiding.

### Scenario 7: Manager sets weight to 0.0 (ignore drafts)

For a product line where drafts are speculative quotes that rarely convert, the manager sets `pending_order_weight = 0.0`.

```
effective_available = qty_on_hand - committed_qty - (pending × 0.0)
                    = qty_on_hand - committed_qty
                    = net_available
```

Only confirmed orders count against stock. Maximum selling flexibility, higher stockout risk.

---

## 10. Implementation Sequence

This feature decomposes into the following issues, ordered by dependency:

### Phase 1: RBAC foundation

1. **Add `Role` type and extend `UserProperties` with `role` + `display_name`**
   Update `packages/core/types.ts`. Add `Role` type. Extend `UserProperties`. Default existing users to `sales_rep`.

2. **Extend JWT payload with `role`**
   Update `signJwt` / `verifyJwt` to include `role`. Update `getAuthenticatedUser` return type. Add `requireRole()` middleware helper.

3. **Add role to auth API responses**
   `GET /api/auth/me` returns `role` and `display_name`. `POST /api/auth/login` includes role in JWT. `POST /api/auth/register` defaults to `sales_rep`.

4. **Add user management endpoints**
   `GET /api/users` (admin only). `PATCH /api/users/:id` (admin only) — update role, display_name.

5. **Update frontend `AuthContext` and `User` type**
   Add `role` and `display_name` to frontend `User` interface. `useAuth()` exposes role.

6. **Add `<RoleGate>` component and role-filtered navigation**
   Nav items filtered by role. `<RoleGate>` wrapper for conditional rendering. Products view: hide add/edit for sales_rep.

### Phase 2: Core inventory engine + data model

7. **Add `StockPosition` types and `computeStockPosition` / `checkOrderStock` to `packages/core/inventory.ts`**
   Pure functions, no DB. Unit-testable immediately. Add `StockStatus`, `StockPosition`, `StockCheckResult` to types.

8. **Extend `ProductProperties` with inventory fields**
   Add new fields to the type. Update product validation. Defaults for existing products (all zeros/nulls).

9. **Add `inventory_txn` entity type**
   Add `InventoryTxnProperties` type. Register entity type.

10. **Add `shipped` status to `OrderStatus`**
    Update type, status transition map, add `shipped_by`/`shipped_at` audit fields.

### Phase 3: Inventory API endpoints (role-gated)

11. **`POST /api/inventory/:productId/adjust`** — manual stock adjustment (inventory_manager+)
    Creates inventory_txn, updates product qty_on_hand. Validates balance_after >= 0.

12. **`GET /api/inventory/:productId`** — full stock position (inventory_manager+)
    Aggregates orders, calls `computeStockPosition`. Returns full breakdown.

13. **`GET /api/inventory/:productId/availability`** — simplified stock (all authenticated)
    Returns only `effective_available`, `status`, `status_label`, `can_order`.

14. **`GET /api/inventory`** — all products stock positions (inventory_manager+)

15. **`GET /api/inventory/:productId/transactions`** — transaction log (inventory_manager+)

16. **Stock gate on `POST /api/orders`** (all authenticated — blocking is universal)
    Add `checkOrderStock` call between margin validation and insert. Return `stock_warning` on success, 400 on block.

17. **`shipped` transition on `PATCH /api/orders/:id`** (inventory_manager+)
    Handle confirmed → shipped. Create shipment txn. Update qty_on_hand. Role-gated.

18. **Role-gate existing product endpoints**
    `POST /api/products` and `PATCH /api/products/:id` require `inventory_manager+`.

### Phase 4: Seed data

19. **Update seed script — users**
    Add `role` and `display_name` to existing demo users. Add `inv_manager` and `admin` demo accounts.

20. **Update seed script — inventory**
    Add inventory fields to product seeds. Create initial `inventory_txn` for each product.

### Phase 5: UI — role-aware

21. **Order Entry — stock display (role-aware)**
    Sales rep: fetch `/availability`, show simplified badge. Inventory manager: fetch full `/inventory/:id`, show full breakdown. Both: disable confirm when blocked.

22. **Product catalog — inventory config section (inventory_manager+ only)**
    `<RoleGate>` around inventory settings in Add/Edit modal.

23. **Inventory dashboard view (inventory_manager+ only)**
    New nav item (hidden for sales_rep). Table of all products with stock positions. Row expand for transaction log.

24. **Order History — shipped status + "Mark Shipped" button (inventory_manager+ only)**
    `<RoleGate>` around "Mark Shipped" button. New `shipped` filter option.

25. **Stock adjustment dialog (inventory_manager+ only)**
    Reusable from both Product Catalog and Inventory Dashboard.

26. **User management view (admin only)**
    List users, change roles. Simple table + edit dialog.

27. **Login screen — updated demo buttons**
    Show all four demo accounts with role labels.

---

## 11. Explicitly Out of Scope

| Item | Reason |
|------|--------|
| Automatic purchase orders | V2 is inform-only. Managers see reorder signals, then act outside MeshMargin. |
| Demand forecasting | `days_of_stock` uses trailing 30-day average. Statistical forecasting (seasonality, trends) is V3. |
| Multiple warehouse locations | Single location per product. Multi-location inventory is a multi-tenant concern. |
| Lot tracking / serial numbers | Not needed for wire mesh roll products in V2. |
| Backorder management | Blocked orders must be retried manually after stock is replenished. |
| Inventory reservation (soft lock) | Draft orders affect stock position via `pending_order_weight` but do not hard-lock inventory. |
| Barcode / scanner integration | Manual entry only for V2. |
| Inventory valuation (FIFO/LIFO/WAC) | Cost is per-product, not per-lot. Valuation methods are a finance feature. |
| Custom permission granularity | V2 uses fixed role → capability mapping. No per-user or per-resource permissions. |
| SSO / enterprise auth | V2 uses username/password with JWT. Azure AD / Okta / SAML is V3. |
| Audit log for role changes | Role changes are applied immediately. A full admin audit journal is V3. |
| Row-level order visibility | Sales reps see all orders, not just their own. Per-user order filtering is V3. |
| Team / department hierarchy | Roles are flat. Org-chart-based access (e.g., "sales manager sees their team's orders") is V3. |
