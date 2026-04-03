import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Product, UnitOfMeasure } from 'core';
import {
  calculateCost,
  convertUnits,
  calculateMargin,
  findBundlesByWidth,
  findBundlesBySqft,
} from 'core';
import type { Bundle } from 'core';
import { MarginBox } from './order-entry/MarginBox';
import { BundleSortControls } from './order-entry/BundleSortControls';
import type { BundleSortKey } from './order-entry/BundleSortControls';
import { BundleCardBase } from './order-entry/BundleCardBase';
import { StockBadge } from './order-entry/StockBadge';
import type { AvailabilityData } from './order-entry/StockBadge';
import { StockPositionPanel } from './order-entry/StockPositionPanel';
import type { StockPositionData } from './order-entry/StockPositionPanel';
import { useAuth } from '../context/AuthContext';

const UOM_OPTIONS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'square_foot', label: 'Square ft' },
  { value: 'linear_foot', label: 'Linear ft' },
];

type OrderMode = 'specific-product' | 'search-by-uom';
type SearchUomToggle = 'linft' | 'sqft';

const MODE_TABS: { value: OrderMode; label: string }[] = [
  { value: 'specific-product', label: 'Specific Product' },
  { value: 'search-by-uom', label: 'Order Optimizer' },
];

export function targetMarginPricePerEach(product: Product): string {
  const costPerEach = product.properties.cost_per_each ?? 0;
  const target = product.properties.margin_target / 100;
  const raw = costPerEach / (1 - target);
  return (Math.ceil(raw * 100) / 100).toFixed(2);
}

interface OrderForm {
  productId: string;
  quantity: string;
  uom: UnitOfMeasure;
  sellPrice: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = {
  productId: '',
  quantity: '',
  uom: 'square_foot',
  sellPrice: '',
  notes: '',
};

function getProductContextLine(product: Product): string {
  const p = product.properties;
  const lengthFeet = p.length_inches / 12;
  const rollStr = Number.isInteger(lengthFeet) ? `${lengthFeet} ft` : `${lengthFeet.toFixed(1)} ft`;
  return `1 unit = ${p.width_inches}" × ${p.length_inches}" (${rollStr} roll) — ${p.material}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

// --- Search by UoM Panel ---

interface SearchByUoMPanelProps {
  products: Product[];
  customer: string;
  onOrderSuccess: () => void;
  onOrderError: (msg: string) => void;
}

function SearchByUoMPanel({
  products,
  customer,
  onOrderSuccess,
  onOrderError,
}: SearchByUoMPanelProps) {
  const { user } = useAuth();
  const [toggle, setToggle] = useState<SearchUomToggle>('linft');
  const [width, setWidth] = useState('');
  const [length, setLength] = useState('');
  const [sqft, setSqft] = useState('');
  const [sortKey, setSortKey] = useState<BundleSortKey>('price-sqft');
  const [creating, setCreating] = useState(false);

  // Active bundle for right-column analytics (hovered or selected)
  const [activeBundleKey, setActiveBundleKey] = useState<string | null>(null);

  // Per-product inventory data for the active bundle
  const [bundleAvailability, setBundleAvailability] = useState<Record<string, AvailabilityData>>(
    {},
  );
  const [bundleStockPositions, setBundleStockPositions] = useState<
    Record<string, StockPositionData>
  >({});

  // Lifted item prices state: keyed by bundleKey, then by productId
  const [allItemPrices, setAllItemPrices] = useState<Record<string, Record<string, string>>>({});

  // Distinct widths from product catalog, sorted ascending
  const distinctWidths = useMemo(() => {
    const widths = new Set<number>();
    for (const p of products) {
      widths.add(p.properties.width_inches);
    }
    return Array.from(widths).sort((a, b) => a - b);
  }, [products]);

  const widthInches = parseFloat(width);
  const lengthFeet = parseFloat(length);
  const totalSqft = parseFloat(sqft);

  const hasWidth = !isNaN(widthInches) && widthInches > 0;
  const hasLength = !isNaN(lengthFeet) && lengthFeet > 0;
  const hasSqft = !isNaN(totalSqft) && totalSqft > 0;

  const rawBundles: Bundle[] = useMemo(() => {
    if (toggle === 'linft') {
      if (!hasWidth || !hasLength) return [];
      const totalLengthInches = lengthFeet * 12;
      return findBundlesByWidth(products, widthInches, totalLengthInches);
    } else {
      if (!hasSqft) return [];
      return findBundlesBySqft(products, totalSqft);
    }
  }, [toggle, products, widthInches, lengthFeet, hasWidth, hasLength, hasSqft, totalSqft]);

  // Filter bundles where every item has quantity === 0
  const visibleBundles: Bundle[] = useMemo(() => {
    return rawBundles.filter((bundle) => bundle.items.some((item) => item.quantity > 0));
  }, [rawBundles]);

  // Generate stable bundle keys (same logic used for rendering)
  const bundleKeys = useMemo(() => {
    return rawBundles.map(
      (bundle, idx) => bundle.items.map((i) => i.product.id).join('|') + '-' + idx,
    );
  }, [rawBundles]);

  // Seed lifted prices for new bundles (target-margin price per each)
  useEffect(() => {
    setAllItemPrices((prev) => {
      const next = { ...prev };
      let changed = false;
      for (let idx = 0; idx < rawBundles.length; idx++) {
        const bKey = bundleKeys[idx];
        if (!next[bKey]) {
          const prices: Record<string, string> = {};
          for (const item of rawBundles[idx].items) {
            const cost = item.product.properties.cost_per_each ?? 0;
            const target = item.product.properties.margin_target / 100;
            const raw = cost / (1 - target);
            prices[item.product.id] = (Math.ceil(raw * 100) / 100).toFixed(2);
          }
          next[bKey] = prices;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [rawBundles, bundleKeys]);

  // Determine if all bundles have all sell prices entered
  const allSellPricesEntered = useMemo(() => {
    if (visibleBundles.length === 0) return false;
    for (const bundle of visibleBundles) {
      const origIdx = rawBundles.indexOf(bundle);
      const bKey = bundleKeys[origIdx];
      const prices = allItemPrices[bKey];
      if (!prices) return false;
      for (const item of bundle.items) {
        if (item.quantity === 0) continue;
        const priceStr = prices[item.product.id] ?? '';
        const price = parseFloat(priceStr);
        if (isNaN(price) || price <= 0) return false;
      }
    }
    return true;
  }, [visibleBundles, rawBundles, bundleKeys, allItemPrices]);

  // Compute customer sell price per sqft/linft for each visible bundle (when all prices entered)
  const customerPricesPerBundle = useMemo(() => {
    if (!allSellPricesEntered) return null;
    const result: Array<{ customerPricePerSqft: number; customerPricePerLinft: number }> = [];
    for (const bundle of visibleBundles) {
      const origIdx = rawBundles.indexOf(bundle);
      const bKey = bundleKeys[origIdx];
      const prices = allItemPrices[bKey];
      let totalRevenue = 0;
      for (const item of bundle.items) {
        if (item.quantity === 0) continue;
        const price = parseFloat(prices[item.product.id] ?? '0');
        totalRevenue += item.quantity * price;
      }
      result.push({
        customerPricePerSqft: bundle.totalSqft === 0 ? 0 : totalRevenue / bundle.totalSqft,
        customerPricePerLinft: bundle.totalLinft === 0 ? 0 : totalRevenue / bundle.totalLinft,
      });
    }
    return result;
  }, [allSellPricesEntered, visibleBundles, rawBundles, bundleKeys, allItemPrices]);

  const sortedBundles: Bundle[] = useMemo(() => {
    if (visibleBundles.length === 0) return visibleBundles;

    // Build index array to maintain association with customerPricesPerBundle
    const indices = visibleBundles.map((_, i) => i);

    if (customerPricesPerBundle) {
      // Sort by customer sell price
      if (sortKey === 'price-sqft') {
        indices.sort(
          (a, b) =>
            customerPricesPerBundle[a].customerPricePerSqft -
            customerPricesPerBundle[b].customerPricePerSqft,
        );
      } else {
        indices.sort(
          (a, b) =>
            customerPricesPerBundle[a].customerPricePerLinft -
            customerPricesPerBundle[b].customerPricePerLinft,
        );
      }
    } else {
      // Fallback: sort by cost-based price
      if (sortKey === 'price-sqft') {
        indices.sort((a, b) => visibleBundles[a].pricePerSqft - visibleBundles[b].pricePerSqft);
      } else {
        indices.sort((a, b) => visibleBundles[a].pricePerLinft - visibleBundles[b].pricePerLinft);
      }
    }

    return indices.map((i) => visibleBundles[i]);
  }, [visibleBundles, sortKey, customerPricesPerBundle]);

  // Fetch inventory data for the active bundle's products
  useEffect(() => {
    if (!activeBundleKey) return;

    // Find the active bundle
    const origIdx = rawBundles.findIndex((_, idx) => bundleKeys[idx] === activeBundleKey);
    if (origIdx === -1) return;
    const activeBundle = rawBundles[origIdx];
    const role = user?.role;

    for (const item of activeBundle.items) {
      if (item.quantity === 0) continue;
      const productId = item.product.id;

      if (role === 'sales_rep') {
        fetch(`/api/inventory/${productId}/availability`, { credentials: 'include' })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              setBundleAvailability((prev) => ({ ...prev, [productId]: data as AvailabilityData }));
            }
          })
          .catch(() => {});
      } else if (role === 'inventory_manager' || role === 'admin') {
        fetch(`/api/inventory/${productId}`, { credentials: 'include' })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              setBundleStockPositions((prev) => ({
                ...prev,
                [productId]: data as StockPositionData,
              }));
            }
          })
          .catch(() => {});
      }
    }
  }, [activeBundleKey, rawBundles, bundleKeys, user?.role]);

  // Combined economics for the active bundle (from its card's combinedEconomics logic)
  const activeBundleEconomics = useMemo(() => {
    if (!activeBundleKey) return null;
    const origIdx = rawBundles.findIndex((_, idx) => bundleKeys[idx] === activeBundleKey);
    if (origIdx === -1) return null;
    const bundle = rawBundles[origIdx];
    const prices = allItemPrices[activeBundleKey];
    if (!prices) return null;

    let totalRevenue = 0;
    let totalCost = 0;
    let allPricesEntered = true;
    let weightedTarget = 0;
    let weightedFloor = 0;

    for (const item of bundle.items) {
      if (item.quantity === 0) continue;
      const priceStr = prices[item.product.id] ?? '';
      const price = parseFloat(priceStr);
      if (isNaN(price) || price <= 0) {
        allPricesEntered = false;
        continue;
      }
      const conversions = convertUnits(item.product, item.quantity, 'each');
      const itemCost = calculateCost(item.product, conversions);
      const itemRevenue = item.quantity * price;
      totalRevenue += itemRevenue;
      totalCost += itemCost;
      weightedTarget += item.product.properties.margin_target * itemCost;
      weightedFloor += item.product.properties.margin_floor * itemCost;
    }

    if (!allPricesEntered || totalRevenue === 0) return null;

    const { dollars: marginDollars, percent: marginPercent } = calculateMargin(
      totalRevenue,
      totalCost,
    );
    const avgTarget = totalCost > 0 ? weightedTarget / totalCost : 25;
    const avgFloor = totalCost > 0 ? weightedFloor / totalCost : 15;

    return {
      totalRevenue,
      totalCost,
      marginDollars,
      marginPercent,
      marginTarget: avgTarget,
      marginFloor: avgFloor,
    };
  }, [activeBundleKey, rawBundles, bundleKeys, allItemPrices]);

  // Items in the active bundle (non-zero quantity)
  const activeBundleItems = useMemo(() => {
    if (!activeBundleKey) return [];
    const origIdx = rawBundles.findIndex((_, idx) => bundleKeys[idx] === activeBundleKey);
    if (origIdx === -1) return [];
    return rawBundles[origIdx].items.filter((item) => item.quantity > 0);
  }, [activeBundleKey, rawBundles, bundleKeys]);

  const handleCreateOrders = async (
    items: Array<{
      productId: string;
      quantity: number;
      sellPricePerEach: number;
      customer: string;
    }>,
  ) => {
    setCreating(true);
    try {
      for (const item of items) {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            customer: item.customer.trim() || customer.trim(),
            product_id: item.productId,
            quantity: item.quantity,
            unit_of_measure: 'each',
            sell_price_per_unit: item.sellPricePerEach,
            notes: '',
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to create order');
        }
      }
      onOrderSuccess();
    } catch (err) {
      onOrderError(err instanceof Error ? err.message : 'Failed to create order');
    } finally {
      setCreating(false);
    }
  };

  // Empty state logic
  const showEmptyState =
    toggle === 'linft'
      ? hasWidth && hasLength && sortedBundles.length === 0
      : hasSqft && products.length === 0;
  const showNoBundles =
    toggle === 'sqft' && hasSqft && products.length > 0 && sortedBundles.length === 0;

  const emptyMessage =
    toggle === 'linft' ? `No products available at ${widthInches}"` : 'No products in catalog';

  const role = user?.role;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
      {/* Left column: search controls and bundle list */}
      <div className="space-y-4">
        {/* Toggle: Linear ft | Sqft */}
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1 w-fit">
          <button
            type="button"
            onClick={() => setToggle('linft')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              toggle === 'linft'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Linear ft
          </button>
          <button
            type="button"
            onClick={() => setToggle('sqft')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              toggle === 'sqft'
                ? 'bg-white text-zinc-900 shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900'
            }`}
          >
            Sq ft
          </button>
        </div>

        {/* Inputs */}
        {toggle === 'linft' ? (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="search-width"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Width
              </label>
              <select
                id="search-width"
                value={width}
                onChange={(e) => setWidth(e.target.value)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
              >
                <option value="">Select width...</option>
                {distinctWidths.map((w) => (
                  <option key={w} value={w}>
                    {w}&quot;
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="search-length"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Total Length (ft)
              </label>
              <input
                id="search-length"
                type="number"
                step="any"
                min="0"
                value={length}
                onChange={(e) => setLength(e.target.value)}
                placeholder="200"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 max-w-xs">
            <div>
              <label htmlFor="search-sqft" className="block text-sm font-medium text-zinc-700 mb-1">
                Total Area (sqft)
              </label>
              <input
                id="search-sqft"
                type="number"
                step="any"
                min="0"
                value={sqft}
                onChange={(e) => setSqft(e.target.value)}
                placeholder="500"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
          </div>
        )}

        {/* Empty states */}
        {(showEmptyState || showNoBundles) && (
          <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 text-center">
            <p className="text-sm text-zinc-500">{emptyMessage}</p>
          </div>
        )}

        {/* Bundle list */}
        {sortedBundles.length > 0 && (
          <div className="space-y-3">
            <BundleSortControls
              sortKey={sortKey}
              onSortChange={setSortKey}
              usingSellPrice={allSellPricesEntered}
            />

            {(() => {
              const showPills = sortedBundles.length >= 2;
              const minCostTotal = showPills
                ? Math.min(...sortedBundles.map((b) => b.costTotal))
                : Infinity;
              const minOverage = showPills
                ? Math.min(...sortedBundles.map((b) => b.overage))
                : Infinity;
              return sortedBundles.map((bundle) => {
                // Find the original index to get the correct bundleKey
                const origIdx = rawBundles.indexOf(bundle);
                const bKey = bundleKeys[origIdx];
                return (
                  <div
                    key={bKey}
                    onClick={(e) => {
                      // Only select the bundle when clicking the card background, not interactive elements
                      const target = e.target as HTMLElement;
                      if (
                        target.tagName === 'BUTTON' ||
                        target.tagName === 'INPUT' ||
                        target.tagName === 'SELECT' ||
                        target.tagName === 'LABEL' ||
                        target.closest('button') ||
                        target.closest('input') ||
                        target.closest('select')
                      ) {
                        return;
                      }
                      setActiveBundleKey(bKey);
                    }}
                    className={`rounded-lg transition-shadow cursor-pointer ${activeBundleKey === bKey ? 'ring-2 ring-zinc-400' : ''}`}
                  >
                    <BundleCardBase
                      bundleKey={bKey}
                      bundle={bundle}
                      displayMode={toggle}
                      customer={customer}
                      onCreateOrders={handleCreateOrders}
                      creating={creating}
                      isBestMargin={showPills && bundle.costTotal === minCostTotal}
                      isLeastWaste={showPills && bundle.overage === minOverage}
                      itemPrices={allItemPrices[bKey]}
                      onItemPriceChange={(productId, value) => {
                        setAllItemPrices((prev) => ({
                          ...prev,
                          [bKey]: { ...prev[bKey], [productId]: value },
                        }));
                      }}
                    />
                  </div>
                );
              });
            })()}
          </div>
        )}
      </div>

      {/* Right column: analytics panel */}
      <div className="space-y-4">
        {activeBundleKey && activeBundleItems.length > 0 ? (
          <>
            {/* Combined economics */}
            {activeBundleEconomics ? (
              <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 space-y-2">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Bundle Economics
                </p>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600">Revenue</span>
                  <span className="font-medium text-zinc-900">
                    {formatCurrency(activeBundleEconomics.totalRevenue)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-600">Cost</span>
                  <span className="font-medium text-zinc-900">
                    {formatCurrency(activeBundleEconomics.totalCost)}
                  </span>
                </div>
                <MarginBox
                  marginDollars={activeBundleEconomics.marginDollars}
                  marginPercent={activeBundleEconomics.marginPercent}
                  marginTarget={activeBundleEconomics.marginTarget}
                  marginFloor={activeBundleEconomics.marginFloor}
                  variant="large"
                />
              </div>
            ) : (
              <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
                <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                  Bundle Economics
                </p>
                <p className="text-sm text-zinc-400">Enter sell prices to see margin analysis.</p>
              </div>
            )}

            {/* Per-product inventory stats */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">
                Inventory by Product
              </p>
              {activeBundleItems.map((item) => {
                const productId = item.product.id;
                const availability = bundleAvailability[productId] ?? null;
                const stockPosition = bundleStockPositions[productId] ?? null;
                return (
                  <div key={productId}>
                    <p className="text-xs font-medium text-zinc-700 mb-1">
                      {item.product.properties.name}
                    </p>
                    {role === 'sales_rep' && availability && (
                      <StockBadge availability={availability} projectedEaches={item.quantity} />
                    )}
                    {(role === 'inventory_manager' || role === 'admin') && stockPosition && (
                      <StockPositionPanel
                        position={stockPosition}
                        pendingOrderWeight={item.product.properties.pending_order_weight ?? 0.7}
                        projectedEaches={item.quantity}
                      />
                    )}
                    {role === 'sales_rep' && !availability && (
                      <p className="text-xs text-zinc-400">No stock data available.</p>
                    )}
                    {(role === 'inventory_manager' || role === 'admin') && !stockPosition && (
                      <p className="text-xs text-zinc-400">No stock data available.</p>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full min-h-48 text-zinc-400 text-sm">
            Select a bundle to see analytics.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Main OrderEntry Component ---

export interface OrderEntryProps {
  onNavigateToHistory?: () => void;
}

export const OrderEntry: React.FC<OrderEntryProps> = ({ onNavigateToHistory }) => {
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [mode, setMode] = useState<OrderMode>('specific-product');

  // Shared customer field — persists across mode switches
  const [customer, setCustomer] = useState('');

  // Unified success/error state
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [orderConfirmed, setOrderConfirmed] = useState(false);

  // Tracks whether the current product selection came from "Select for Quote".
  // When true, skip the auto-seed of sell price so the quoted price is preserved.
  const skipSellPriceSeedRef = useRef(false);

  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  // Stock data state
  const [availability, setAvailability] = useState<AvailabilityData | null>(null);
  const [stockPosition, setStockPosition] = useState<StockPositionData | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(null);
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load products');
      const data: Product[] = await res.json();
      setProducts(data);
    } catch {
      setProductError('Failed to load products');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const selectedProduct = products.find((p) => p.id === form.productId) ?? null;

  // When product changes, fetch stock data based on user role
  useEffect(() => {
    if (!selectedProduct) {
      setAvailability(null);
      setStockPosition(null);
      return;
    }

    const role = user?.role;

    if (role === 'sales_rep') {
      // Fetch simplified availability
      fetch(`/api/inventory/${selectedProduct.id}/availability`, { credentials: 'include' })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setAvailability(data as AvailabilityData);
          }
        })
        .catch(() => {
          // Silently fail — stock data is supplementary
        });
    } else if (role === 'inventory_manager' || role === 'admin') {
      // Fetch full stock position
      fetch(`/api/inventory/${selectedProduct.id}`, { credentials: 'include' })
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setStockPosition(data as StockPositionData);
          }
        })
        .catch(() => {
          // Silently fail — stock data is supplementary
        });
    }
  }, [selectedProduct, user?.role]);

  // When product changes, seed sell price with the target-margin per-each rate.
  // Skip seeding when a quoted price was pre-filled via "Select for Quote".
  useEffect(() => {
    if (selectedProduct) {
      if (skipSellPriceSeedRef.current) {
        skipSellPriceSeedRef.current = false;
        return;
      }
      setForm((prev) => ({ ...prev, sellPrice: targetMarginPricePerEach(selectedProduct) }));
    }
  }, [selectedProduct]);

  const qty = parseFloat(form.quantity);
  const sellPricePerEach = parseFloat(form.sellPrice);
  const hasQty = !isNaN(qty) && qty > 0;
  const hasPrice = !isNaN(sellPricePerEach) && sellPricePerEach >= 0;

  // Compute unit conversions
  const conversions =
    selectedProduct && hasQty ? convertUnits(selectedProduct, qty, form.uom) : null;

  // Compute revenue, cost, margin using per-each price
  const computed =
    selectedProduct && hasQty && hasPrice && conversions
      ? (() => {
          const total_revenue = conversions.eaches * sellPricePerEach;
          const total_cost = calculateCost(selectedProduct, conversions);
          const { dollars: margin_dollars, percent: margin_percent } = calculateMargin(
            total_revenue,
            total_cost,
          );
          return {
            qty_eaches: conversions.eaches,
            qty_linft: conversions.linear_feet,
            qty_sqft: conversions.square_feet,
            total_revenue,
            total_cost,
            margin_dollars,
            margin_percent,
          };
        })()
      : null;

  const isFractionalEaches = computed !== null && !Number.isInteger(computed.qty_eaches);

  // Stock-based order gate: false when availability says can_order is false
  const stockBlocked = availability !== null && !availability.can_order;

  // Equivalent rates (per sqft and per linft) from sell price per each
  const equivalentRates =
    selectedProduct && hasPrice
      ? (() => {
          const p = selectedProduct.properties;
          const sqftPerEach = (p.width_inches * p.length_inches) / 144;
          const linftPerEach = p.length_inches / 12;
          const pricePerSqft = sellPricePerEach / sqftPerEach;
          const pricePerLinft = sellPricePerEach / linftPerEach;
          return { pricePerSqft, pricePerLinft };
        })()
      : null;

  const handleChange = <K extends keyof OrderForm>(field: K, value: OrderForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setOrderConfirmed(false);
  };

  const handleRoundUp = () => {
    if (!computed || !selectedProduct) return;
    const p = selectedProduct.properties;
    const sqftPerEach = (p.width_inches * p.length_inches) / 144;
    const linftPerEach = p.length_inches / 12;
    const roundedEaches = Math.ceil(computed.qty_eaches);
    const roundedQty =
      form.uom === 'square_foot' ? roundedEaches * sqftPerEach : roundedEaches * linftPerEach;
    handleChange('quantity', roundedQty.toString());
  };

  const handleRoundDown = () => {
    if (!computed || !selectedProduct) return;
    const p = selectedProduct.properties;
    const sqftPerEach = (p.width_inches * p.length_inches) / 144;
    const linftPerEach = p.length_inches / 12;
    const roundedEaches = Math.floor(computed.qty_eaches);
    const roundedQty =
      form.uom === 'square_foot' ? roundedEaches * sqftPerEach : roundedEaches * linftPerEach;
    handleChange('quantity', roundedQty.toString());
  };

  const handleNewOrder = () => {
    setOrderConfirmed(false);
    setSubmitError(null);
    setCustomer('');
    setForm({ ...EMPTY_FORM });
    setAvailability(null);
    setStockPosition(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setSubmitError(null);
    setOrderConfirmed(false);
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer: customer.trim(),
          product_id: form.productId,
          quantity: qty,
          unit_of_measure: form.uom,
          sell_price_per_unit: sellPricePerEach,
          notes: form.notes.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error || 'Failed to submit order');
        return;
      }

      setOrderConfirmed(true);
      setForm({ ...EMPTY_FORM });
    } catch {
      setSubmitError('Network error submitting order');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBundleOrderSuccess = () => {
    setOrderConfirmed(true);
    setSubmitError(null);
  };

  const handleBundleOrderError = (msg: string) => {
    setSubmitError(msg);
    setOrderConfirmed(false);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">New Order</h2>

      {loadingProducts && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {!loadingProducts && productError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
          {productError}
        </div>
      )}

      {!loadingProducts && !productError && products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm mb-2">No products found.</p>
          <p className="text-zinc-400 text-sm">
            Add products in the catalog before creating an order.
          </p>
        </div>
      )}

      {!loadingProducts && !productError && products.length > 0 && (
        <>
          {/* Unified success banner */}
          {orderConfirmed && (
            <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded text-sm text-emerald-700">
              <p className="font-medium mb-2">Order confirmed!</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleNewOrder}
                  className="px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors"
                >
                  New Order
                </button>
                <button
                  type="button"
                  onClick={onNavigateToHistory}
                  className="px-3 py-1 text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 rounded-md transition-colors"
                >
                  View Orders
                </button>
              </div>
            </div>
          )}

          {/* Unified error banner */}
          {submitError && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Shared Customer field */}
          <div className="mb-4">
            <label
              htmlFor="field-customer"
              className="block text-sm font-medium text-zinc-700 mb-1"
            >
              Customer
            </label>
            <input
              id="field-customer"
              type="text"
              value={customer}
              onChange={(e) => {
                setCustomer(e.target.value);
                setSubmitError(null);
                setOrderConfirmed(false);
              }}
              placeholder="Customer name"
              tabIndex={1}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          {/* Mode selector */}
          <div className="flex gap-1 mb-6 bg-zinc-100 rounded-lg p-1 w-fit">
            {MODE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setMode(tab.value)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  mode === tab.value
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {mode === 'search-by-uom' && (
            <SearchByUoMPanel
              products={products}
              customer={customer}
              onOrderSuccess={handleBundleOrderSuccess}
              onOrderError={handleBundleOrderError}
            />
          )}

          {mode === 'specific-product' && (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {/* Left column: inputs */}
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="field-product"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Product
                    </label>
                    <select
                      id="field-product"
                      value={form.productId}
                      onChange={(e) => handleChange('productId', e.target.value)}
                      tabIndex={2}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
                    >
                      <option value="">Select a product...</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.properties.name} ({p.properties.sku})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="field-quantity"
                        className="block text-sm font-medium text-zinc-700 mb-1"
                      >
                        Quantity
                      </label>
                      <input
                        id="field-quantity"
                        type="number"
                        step="any"
                        min="0"
                        value={form.quantity}
                        onChange={(e) => handleChange('quantity', e.target.value)}
                        placeholder="0"
                        tabIndex={3}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="field-uom"
                        className="block text-sm font-medium text-zinc-700 mb-1"
                      >
                        Unit of measure
                      </label>
                      <select
                        id="field-uom"
                        value={form.uom}
                        onChange={(e) => handleChange('uom', e.target.value as UnitOfMeasure)}
                        tabIndex={4}
                        className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
                      >
                        {UOM_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="field-sell-price"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Sell price per roll ($)
                    </label>
                    <input
                      id="field-sell-price"
                      type="number"
                      step="0.01"
                      min="0"
                      value={form.sellPrice}
                      onChange={(e) => handleChange('sellPrice', e.target.value)}
                      placeholder="0.00"
                      tabIndex={5}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
                    />
                    {equivalentRates && (
                      <p className="mt-1 text-xs text-zinc-500">
                        {`\u2248 $${equivalentRates.pricePerSqft.toFixed(2)} / sqft \u00b7 $${equivalentRates.pricePerLinft.toFixed(2)} / linft`}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="field-notes"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Notes (optional)
                    </label>
                    <textarea
                      id="field-notes"
                      value={form.notes}
                      onChange={(e) => handleChange('notes', e.target.value)}
                      placeholder="Notes about this order..."
                      rows={3}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm resize-none"
                    />
                  </div>

                  {/* Stock blocked banner */}
                  {stockBlocked && (
                    <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
                      Cannot place order — product is out of stock.
                    </div>
                  )}

                  <button
                    type="submit"
                    tabIndex={6}
                    disabled={
                      submitting || !selectedProduct || !hasQty || !hasPrice || stockBlocked
                    }
                    className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {submitting ? 'Submitting...' : 'Confirm Order'}
                  </button>
                </div>

                {/* Right column: computed results */}
                <div className="space-y-4">
                  {selectedProduct ? (
                    <>
                      {/* Product context */}
                      <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                          Product Context
                        </p>
                        <p className="text-sm text-zinc-800">
                          {getProductContextLine(selectedProduct)}
                        </p>
                      </div>

                      {/* Unit conversions */}
                      {computed ? (
                        <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 space-y-2">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Unit Conversions
                          </p>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-600">Each</span>
                            <span className="font-medium text-zinc-900">
                              {formatNumber(computed.qty_eaches)} units
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-600">Linear feet</span>
                            <span className="font-medium text-zinc-900">
                              {formatNumber(computed.qty_linft)} lin ft
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-600">Square feet</span>
                            <span className="font-medium text-zinc-900">
                              {formatNumber(computed.qty_sqft)} sq ft
                            </span>
                          </div>

                          {isFractionalEaches && (
                            <div className="mt-2 space-y-2">
                              <button
                                type="button"
                                onClick={handleRoundUp}
                                className="w-full px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors text-left"
                              >
                                {`\u2191 Round up to ${Math.ceil(computed.qty_eaches)} eaches (${Math.ceil(computed.qty_eaches) * ((selectedProduct.properties.width_inches * selectedProduct.properties.length_inches) / 144)} sqft)`}
                              </button>
                              <button
                                type="button"
                                onClick={handleRoundDown}
                                className="w-full px-3 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-md hover:bg-amber-100 transition-colors text-left"
                              >
                                {`\u2193 Round down to ${Math.floor(computed.qty_eaches)} eaches (${Math.floor(computed.qty_eaches) * ((selectedProduct.properties.width_inches * selectedProduct.properties.length_inches) / 144)} sqft)`}
                              </button>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Unit Conversions
                          </p>
                          <p className="text-sm text-zinc-400">
                            Enter quantity and price to see conversions.
                          </p>
                        </div>
                      )}

                      {/* Cost & Margin */}
                      {computed ? (
                        <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 space-y-2">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Cost & Margin
                          </p>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-600">Revenue</span>
                            <span className="font-medium text-zinc-900">
                              {formatCurrency(computed.total_revenue)}
                            </span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-zinc-600">Cost</span>
                            <span className="font-medium text-zinc-900">
                              {formatCurrency(computed.total_cost)}
                            </span>
                          </div>

                          {/* Margin display */}
                          <MarginBox
                            marginDollars={computed.margin_dollars}
                            marginPercent={computed.margin_percent}
                            marginTarget={selectedProduct.properties.margin_target}
                            marginFloor={selectedProduct.properties.margin_floor}
                            variant="large"
                          />
                        </div>
                      ) : (
                        <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4">
                          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                            Cost & Margin
                          </p>
                          <p className="text-sm text-zinc-400">
                            Enter quantity and price to see margin calculation.
                          </p>
                        </div>
                      )}

                      {/* Stock display — role-aware */}
                      {availability && (
                        <StockBadge
                          availability={availability}
                          projectedEaches={computed ? computed.qty_eaches : null}
                        />
                      )}

                      {stockPosition && selectedProduct && (
                        <StockPositionPanel
                          position={stockPosition}
                          pendingOrderWeight={
                            selectedProduct.properties.pending_order_weight ?? 0.7
                          }
                          projectedEaches={computed ? computed.qty_eaches : null}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full min-h-48 text-zinc-400 text-sm">
                      Select a product to see details.
                    </div>
                  )}
                </div>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
};
