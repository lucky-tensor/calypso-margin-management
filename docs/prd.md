# MeshMargin -- Product Requirements Document

## 1. Product Vision & Value Proposition

**Product:** MeshMargin -- The Margin Management Tool Built for Unit-Based Industrial Sales

**Core Problem:** Industrial distributors and manufacturers selling dimension-based products (wire mesh, tubing, textiles, sheet metal) lose margin silently because sales, operations, and finance use different units of measure. A sales rep quotes per linear foot, operations thinks in eaches, and cost accounting lives in square feet. These mismatches compound across hundreds of daily orders into significant margin erosion that no one can see until the P&L arrives.

**Value Proposition:** MeshMargin eliminates margin leakage at the exact moment an order is created. By combining unit conversion, cost modeling, and real-time margin validation in a single interface, every order reflects the true economics of the product -- regardless of which unit of measure the customer or sales rep uses.

**Successful Outcome:** An order entry team member selects a product, enters a quantity in any unit, inputs a sell price, and immediately sees the true cost, converted quantities in all units, and the real margin -- before the order is submitted. No spreadsheet side-calculations. No guesswork. No hidden losses.

**Positioning:** MeshMargin validates pricing decisions, it does not generate them. The user enters whatever sell price they choose (from a price list, a negotiation, or their own judgment) and MeshMargin shows whether the margin is acceptable. The tool is a control layer, not a pricing engine.

**V1 Product Geometry:** V1 supports **flat/sheet/roll products** defined by width x length (rectangles). This covers wire mesh panels, welded wire rolls, sheet metal, textiles, and similar. Round products (tubing by OD/wall/length), weight-based products, and complex assemblies are on the roadmap but explicitly out of V1.

---

## 2. Target Users & Personas

### Buyer (Decision Maker)

| Role             | Motivation                                 | Success Metric                                |
| ---------------- | ------------------------------------------ | --------------------------------------------- |
| COO              | Operational accuracy, margin consistency   | Reduced pricing errors, improved gross margin |
| VP of Operations | Process control, employee onboarding speed | Fewer order corrections, faster new-hire ramp |
| VP of Sales      | Revenue protection, team confidence        | Consistent quoting, fewer margin give-backs   |

### Daily User (Operator)

| Role              | Context                                                    | Key Need                                       |
| ----------------- | ---------------------------------------------------------- | ---------------------------------------------- |
| Order Entry Clerk | Processes 50-200 orders/day, enters data from customer POs | Fast, error-free entry with instant feedback   |
| Inside Sales Rep  | Takes phone orders, quotes on the fly                      | Real-time margin visibility while on the phone |

### Design Implication

The interface must be optimized for **speed and clarity**, not analytical depth. These are operational users who need answers in seconds, not dashboards they study for minutes. Large text, obvious color signals, minimal clicks.

---

## 3. Core Workflows & User Stories

### Workflow 1: Order Entry (Primary)

This is the core value loop. Everything else exists to support this.

1. User logs in to MeshMargin
2. User lands on the **Order Entry** view (default)
3. User selects a **customer** (free-text field, e.g., "Acme Fencing Co")
4. User selects a product from the dropdown (e.g., "4x4 Welded Wire Mesh - 10ga")
5. A **product context line** appears: "1 each = 48" x 120" (10 ft roll) -- Galvanized Steel"
6. Product dimensions and cost structure load automatically
7. User enters **quantity** (e.g., 10) and selects **unit of measure** (e.g., "eaches")
8. The **conversion panel** instantly shows equivalent quantities:
   - 10 eaches = 100 linear feet = 400 square feet
   - If the converted eaches quantity is fractional (e.g., 0.73 eaches), a note appears: "Fractional unit -- verify with operations whether to round up or cut to size"
9. User enters **sell price per unit** (e.g., $45.00 per each)
10. The **margin panel** instantly shows:
    - Total Revenue: $450.00
    - Total Cost: $320.00 (derived from product cost structure)
    - Margin: $130.00 (28.9%) -- displayed in **green** (above product's target margin)
11. User clicks **Confirm Order**
12. Order is saved with all computed fields frozen at confirmation time
13. Audit fields recorded: `confirmed_by` (current user), `confirmed_at` (timestamp)

**Margin Color Thresholds (per-product, configurable):**

- Green: margin >= product's `margin_target` (default 25%)
- Yellow: margin between product's `margin_floor` and `margin_target` (default 15-24.9%)
- Red: margin < product's `margin_floor` (default 15%)

If the product has no custom thresholds, system defaults apply.

### Workflow 2: Product Catalog Management

1. User navigates to **Products** view
2. User sees a table of all configured products
3. User clicks **Add Product** to open a form:
   - Name, SKU, Material
   - Width (inches), Length per unit (inches)
   - Weight per sqft (for reference)
   - Cost per each, Cost per linear foot, Cost per square foot (at least one required)
   - Primary cost basis (which cost field drives margin calculation)
   - Margin target % (default: 25)
   - Margin floor % (default: 15)
4. User saves the product
5. Product is immediately available in the Order Entry dropdown

### Workflow 3: Order History Review

1. User navigates to **Order History** view
2. User sees a table of all orders with margin % color-coded
3. User can filter by status: All / Draft / Confirmed / Cancelled
4. User can filter by customer name
5. User can confirm draft orders or cancel orders
6. Margin column provides at-a-glance visibility into pricing quality
7. Each order row shows who confirmed/cancelled it and when

---

## 4. Data Model

MeshMargin uses the existing **property graph** schema (entities table with JSONB properties). This provides flexibility for the MVP without requiring schema migrations for field changes.

### Entity Types

```
user      -- Authentication accounts (existing)
product   -- Catalog of products with dimensions and cost structures
order     -- Order records with inputs and computed economics
```

### Product Properties

```typescript
interface ProductProperties {
  name: string; // "4x4 Welded Wire Mesh - 10ga"
  sku: string; // "WM-4x4-10GA"
  material: string; // "Galvanized Steel"
  width_inches: number; // Roll/sheet width, e.g., 48
  length_inches: number; // Length per each, e.g., 120 (10 feet)
  weight_per_sqft: number; // Reference weight, e.g., 0.58 lbs
  cost_per_each: number | null; // e.g., 32.00
  cost_per_linft: number | null; // e.g., 3.20
  cost_per_sqft: number | null; // e.g., 0.80
  primary_cost_basis: 'each' | 'linear_foot' | 'square_foot';
  margin_target: number; // Target margin %, e.g., 25. Default: 25
  margin_floor: number; // Minimum acceptable margin %, e.g., 15. Default: 15
}
```

**Validation rules:**

- `name`, `sku`, `width_inches`, `length_inches`, `primary_cost_basis` are required
- The cost field matching `primary_cost_basis` must be non-null
- `width_inches` and `length_inches` must be > 0
- `margin_target` must be > `margin_floor`
- `margin_floor` must be >= 0

### Order Properties

```typescript
interface OrderProperties {
  customer: string; // Free-text customer name, e.g., "Acme Fencing Co"
  product_id: string; // FK to product entity
  product_name: string; // Denormalized for display
  quantity: number; // User-entered quantity
  unit_of_measure: 'each' | 'linear_foot' | 'square_foot';
  sell_price_per_unit: number; // User-entered sell price

  // Computed at creation time (authoritative, frozen on confirm)
  qty_eaches: number;
  qty_linft: number;
  qty_sqft: number;
  total_revenue: number;
  total_cost: number;
  margin_dollars: number;
  margin_percent: number;

  // Margin thresholds snapshot (from product at order creation time)
  margin_target: number;
  margin_floor: number;

  status: 'draft' | 'confirmed' | 'cancelled';
  notes: string;

  // Audit fields
  created_by: string; // User ID who created the order
  confirmed_by: string | null; // User ID who confirmed
  confirmed_at: string | null; // ISO timestamp
  cancelled_by: string | null; // User ID who cancelled
  cancelled_at: string | null; // ISO timestamp
}
```

**Status transitions:**

- `draft` -> `confirmed` (sets confirmed_by + confirmed_at)
- `draft` -> `cancelled` (sets cancelled_by + cancelled_at)
- `confirmed` -> `cancelled` (sets cancelled_by + cancelled_at)
- No other transitions allowed (no un-cancelling, no un-confirming)

**Draft cost freshness rule:** Draft orders store the cost computed at creation time. If a product's cost is updated, existing drafts are **not** automatically recalculated. The order entry clerk should cancel stale drafts and re-enter if costs have changed. This keeps the system simple and predictable. A future enhancement could flag drafts older than 24 hours with a "stale cost" warning.

**Fractional units:** Fractional quantities are allowed in all units. If a conversion results in fractional eaches (e.g., 0.73 eaches from a linear foot order), the UI displays a warning: "Fractional unit -- verify with operations whether to round up or cut to size." The tool does not enforce rounding -- that's an operational decision.

---

## 5. Unit Conversion Logic

The conversion engine is the mathematical core of MeshMargin. All functions are **pure** (no side effects, no DB access) and live in `packages/core` so they can run both server-side (authoritative) and client-side (instant feedback).

### Dimensional Basis

Every product has two key dimensions:

- **width_inches**: The width of the roll/sheet/panel
- **length_inches**: The length of one "each" unit

**V1 limitation:** This model assumes flat rectangular geometry. Products defined by diameter, wall thickness, weight, or other non-rectangular dimensions require a different conversion model (see Section 8, roadmap).

### Conversion Formulas

Starting from the relationship that one "each" is a rectangle of `width_inches` x `length_inches`:

```
1 each = (length_inches / 12) linear feet
1 each = (width_inches * length_inches) / 144 square feet
```

Derived:

```
1 linear foot = 12 / length_inches eaches
1 linear foot = width_inches / 12 square feet

1 square foot = 144 / (width_inches * length_inches) eaches
1 square foot = 12 / width_inches linear feet
```

### Conversion Function

```
convertUnits(product, quantity, fromUnit) -> { eaches, linear_feet, square_feet }
```

Given a quantity in any unit, returns the equivalent in all three units.

### Cost Calculation

```
calculateCost(product, conversions) -> totalCost
```

Uses the product's `primary_cost_basis` to determine which cost rate and which converted quantity to multiply:

- If basis is `each`: `cost_per_each * conversions.eaches`
- If basis is `linear_foot`: `cost_per_linft * conversions.linear_feet`
- If basis is `square_foot`: `cost_per_sqft * conversions.square_feet`

### Margin Calculation

```
calculateMargin(revenue, cost) -> { dollars, percent }
```

- `margin_dollars = revenue - cost`
- `margin_percent = (margin_dollars / revenue) * 100`
- If revenue is 0, margin_percent is 0 (avoid division by zero)

### Margin Threshold Evaluation

```
evaluateMargin(margin_percent, margin_target, margin_floor) -> 'healthy' | 'warning' | 'critical'
```

- `healthy`: margin_percent >= margin_target
- `warning`: margin_floor <= margin_percent < margin_target
- `critical`: margin_percent < margin_floor

### Composite Function

```
computeOrderFields(product, quantity, unit, sellPricePerUnit) -> {
  qty_eaches, qty_linft, qty_sqft,
  total_revenue, total_cost,
  margin_dollars, margin_percent
}
```

This orchestrates conversion -> cost -> margin in one call. Used by both the frontend (live preview) and the backend (authoritative storage).

---

## 6. UI/UX Design Philosophy

### Principles

1. **Operational, not analytical.** This is a tool used during order entry, not a BI dashboard. Every element earns its place by helping the user enter orders faster and more accurately.

2. **Margin is the hero.** The margin display is the largest, most prominent element. It uses color to communicate instantly -- the user should never have to read a number to know if the margin is acceptable.

3. **No mode switching.** The Order Entry view is self-contained. The user doesn't navigate away to look up conversions, check costs, or validate pricing. Everything is visible simultaneously.

4. **Fast for repeat use.** An experienced user should be able to enter an order in under 10 seconds: select product (keyboard searchable), tab to quantity, tab to price, confirm.

5. **Product context always visible.** When a product is selected, the UI always shows what "1 each" means in physical terms (e.g., "48" x 120" -- 10 ft roll") so the user can sanity-check their entry.

### Layout

```
+----------------------------------------------------------+
| [M] MeshMargin          [User] [Logout]                 |
+------+---------------------------------------------------+
|      |                                                   |
| Nav  |  Main Content Area                                |
|      |                                                   |
| [*]  |  (Order Entry / Products / History)               |
| [ ]  |                                                   |
| [ ]  |                                                   |
|      |                                                   |
+------+---------------------------------------------------+
```

- **Left nav:** Slim icon sidebar with three views + logout
- **Main area:** Full-width content for the active view
- **No right panel:** MeshMargin uses the full width for content

### Order Entry Layout

```
+---------------------------+---------------------------+
|  INPUTS                   |  RESULTS                  |
|                           |                           |
|  Customer: [___________]  |  PRODUCT CONTEXT          |
|  Product: [dropdown    ]  |  1 each = 48"x120" (10ft) |
|  Quantity: [___] [UOM v]  |  Galvanized Steel         |
|  Price/Unit: [$___.__]    |                           |
|                           |  UNIT CONVERSIONS         |
|                           |  10 eaches                |
|                           |  100 linear feet          |
|                           |  400 square feet          |
|                           |  [!] Fractional warning   |
|                           |                           |
|                           |  COST & MARGIN            |
|                           |  Revenue:  $450.00        |
|                           |  Cost:     $320.00        |
|                           |                           |
|                           |  +---------------------+  |
|                           |  |  $130.00   28.9%    |  |
|                           |  |  MARGIN              |  |
|                           |  +---------------------+  |
|                           |                           |
|  Notes: [______________]  |                           |
|  [Confirm Order]          |                           |
+---------------------------+---------------------------+
```

### Color System

- **Zinc grays** for chrome and backgrounds (inherited from template)
- **Emerald/green** for healthy margins (at or above product's target)
- **Amber/yellow** for warning margins (between floor and target)
- **Red** for critical margins (below product's floor)
- **Indigo** for interactive elements (buttons, links, selections)

---

## 7. API Surface

### Authentication (existing, rebranded)

| Method | Path                 | Description    |
| ------ | -------------------- | -------------- |
| POST   | `/api/auth/register` | Create account |
| POST   | `/api/auth/login`    | Authenticate   |
| GET    | `/api/auth/me`       | Verify session |
| POST   | `/api/auth/logout`   | End session    |

Cookie renamed from `calypso_auth` to `meshmargin_auth`.

### Products

| Method | Path                | Description       |
| ------ | ------------------- | ----------------- |
| GET    | `/api/products`     | List all products |
| POST   | `/api/products`     | Create product    |
| PATCH  | `/api/products/:id` | Update product    |

All endpoints require authentication.

### Orders

| Method | Path              | Description                                                |
| ------ | ----------------- | ---------------------------------------------------------- |
| GET    | `/api/orders`     | List orders (optional `?status=` and `?customer=` filters) |
| POST   | `/api/orders`     | Create order (server computes all derived fields)          |
| PATCH  | `/api/orders/:id` | Update status and/or notes only                            |

All endpoints require authentication.

**Order creation flow:**

1. Client sends `{ customer, product_id, quantity, unit_of_measure, sell_price_per_unit, notes? }`
2. Server fetches the product entity
3. Server calls `computeOrderFields()` from `packages/core`
4. Server snapshots the product's `margin_target` and `margin_floor` onto the order
5. Server stores the order with all computed fields + audit fields + status `'draft'`
6. Server returns the complete order entity

**Order status update flow:**

1. Client sends `{ status: 'confirmed' | 'cancelled', notes? }`
2. Server validates the transition is allowed
3. Server sets audit fields (`confirmed_by`/`cancelled_by` + timestamp)
4. Server returns the updated order

This ensures the server is the authoritative source for margin calculations, even though the client also runs the same math for instant preview.

---

## 8. MVP Scope

### In Scope (build now)

- User authentication (login/register)
- Product catalog CRUD (add, edit, list) with per-product margin thresholds
- Order entry with real-time unit conversion and margin calculation
- Customer field on orders (free-text)
- Product context display ("1 each = 48" x 120"")
- Fractional unit warnings
- Order lifecycle (draft -> confirmed / cancelled) with audit trail
- Order history with margin visibility, customer filter, and audit info
- Unit conversion engine (eaches, linear feet, square feet)
- Cost modeling (per-each, per-linft, per-sqft with primary basis selection)
- Margin calculation with per-product color-coded thresholds
- Margin threshold evaluation (healthy / warning / critical)

### Explicitly Out of Scope (build later)

- **Non-rectangular product geometries** -- Tubing (OD/wall/length), weight-based products, complex assemblies. Requires a pluggable conversion engine architecture. Roadmap: V2.
- **Customer entity / price lists** -- V1 uses free-text customer name. A proper customer entity with contracted pricing, discounts, and customer-specific margins is roadmap V2.
- **SSO / enterprise auth** -- V1 uses username/password with JWT. Azure AD / Okta SSO integration, MFA, password complexity, and account lockout are required for enterprise deployment. Roadmap: V2.
- **CPQ integration** -- No configure-price-quote workflows
- **Pricing governance** -- No approval rules, discount limits, or price floors
- **Margin alerts** -- No notifications when margins fall below thresholds
- **Analytics/reporting** -- No dashboards, trend analysis, or margin leakage reports. A denormalized reporting view (materialized view over JSONB order data) should be considered for near-term to support finance team queries.
- **ERP integration** -- No data sync with external systems
- **Multi-tenancy** -- Single-tenant deployment for MVP. The database schema already includes a `tenant_id` column on entities, which can be activated for multi-tenant deployment without schema changes.
- **Role-based access** -- All authenticated users have full access
- **Product deletion** -- Products can be edited but not deleted (prevent orphaned orders)
- **Order editing** -- Once created, order economics are frozen; only status changes allowed
- **Bulk operations** -- One order at a time for MVP
- **Print / export** -- No PDF generation, email, or clipboard copy of order summaries. Roadmap: V2.
- **Stale draft warnings** -- No automatic flagging of draft orders with outdated cost data. Roadmap: V2.
- **Data retention policy** -- Orders are business-critical records. Retention period and backup strategy to be defined for production deployment.

### Deployment Model

V1 is deployed as a **single-tenant web application**. One instance per customer. For initial sales, this means standing up a dedicated instance (database + server + frontend) per customer. SaaS multi-tenant architecture is a V2 concern, enabled by the existing `tenant_id` column.

---

## 9. Technical Constraints & Architecture

### Runtime & Stack

- **Server:** Bun HTTP server (no Express/Fastify)
- **Frontend:** React 18 + Vite + Tailwind CSS
- **Database:** PostgreSQL with property graph model (entities + relations tables, JSONB properties)
- **Monorepo:** Bun workspaces (`apps/server`, `apps/web`, `packages/core`, `packages/db`)

### Shared Core Package

The conversion and margin logic lives in `packages/core/conversions.ts` and is imported by both:

- `apps/server` -- for authoritative order computation on POST
- `apps/web` -- for instant client-side preview during entry

This "dual computation" pattern means the same math runs in both places. The server result is canonical; the client result is a preview. They will always agree because they use the same code.

### Property Graph Model

Products and orders are stored as generic entities:

```sql
entities(id TEXT, type TEXT, properties JSONB, tenant_id TEXT, version INT, created_at, updated_at)
```

This means:

- No SQL joins for product-order relationships (use `product_id` in order properties)
- No SQL-level aggregation on margin fields (acceptable for MVP; denormalized reporting view planned for near-term)
- Schema changes require no migrations (just update the TypeScript types)
- `tenant_id` is available for future multi-tenant activation

### No ORM

Raw SQL via `postgres` (postgres.js). Queries are straightforward SELECT/INSERT/UPDATE on the entities table with JSONB property access where needed.

### Audit Trail

V1 captures audit fields inline on the order entity (created_by, confirmed_by, confirmed_at, cancelled_by, cancelled_at). The codebase includes a `data-policies.ts` module with `AuditEvent` and `ConsequentialWriteRequest` type definitions that provide the seam for a full audit journal in V2. For V1, the inline fields are sufficient to answer "who confirmed this order and when."

---

## 10. Example Scenarios

### Scenario 1: Standard order in eaches

**Product:** 4x4 Welded Wire Mesh, 10 gauge galvanized

- Width: 48 inches, Length per each: 120 inches (10-foot roll)
- Cost per each: $32.00, Primary cost basis: each
- Margin target: 25%, Margin floor: 15%

**Order:** Acme Fencing Co wants 10 eaches at $45.00 each

**Product context displayed:** "1 each = 48" x 120" (10 ft roll) -- Galvanized Steel"

**Conversions:**

- 10 eaches
- 10 \* (120 / 12) = 100 linear feet
- 10 _ (48 _ 120) / 144 = 400 square feet

**Economics:**

- Revenue: 10 \* $45.00 = $450.00
- Cost: 10 \* $32.00 = $320.00 (using primary basis: each)
- Margin: $130.00 / $450.00 = 28.9% -- HEALTHY (above 25% target)

### Scenario 2: Order in linear feet (same product)

**Order:** Acme Fencing Co wants 50 linear feet at $5.00/linft

**Conversions:**

- 50 linft = 50 / (120/12) = 5 eaches
- 50 linft = 50 \* (48/12) = 200 sqft

**Economics:**

- Revenue: 50 \* $5.00 = $250.00
- Cost: 5 eaches \* $32.00 = $160.00
- Margin: $90.00 / $250.00 = 36.0% -- HEALTHY (above 25% target)

### Scenario 3: Fractional unit warning

**Order:** Acme Fencing Co wants 73 linear feet at $4.80/linft

**Conversions:**

- 73 linft = 73 / 10 = **7.3 eaches** (FRACTIONAL)
- 73 linft = 73 \* 4 = 292 sqft

**UI displays:** "Fractional unit -- verify with operations whether to round up or cut to size"

**Economics:**

- Revenue: 73 \* $4.80 = $350.40
- Cost: 7.3 \* $32.00 = $233.60
- Margin: $116.80 / $350.40 = 33.3% -- HEALTHY

### Scenario 4: Low margin warning

**Product:** Commodity welded wire, high volume

- Margin target: 18%, Margin floor: 10% (custom thresholds for this product line)

**Order:** Budget Builders wants 500 sqft at $0.95/sqft

**Economics:**

- Revenue: $475.00
- Cost: $410.00
- Margin: $65.00 / $475.00 = 13.7% -- WARNING (between 10% floor and 18% target)

**UI:** Margin box displays in **amber/yellow**. Order can still be confirmed -- the tool informs, it does not block.
