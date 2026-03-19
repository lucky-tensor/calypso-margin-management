import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import type { Product, UnitOfMeasure } from 'core';
import {
  evaluateMargin,
  calculateCost,
  convertUnits,
  calculateMargin,
  findBundlesByWidth,
  findBundlesBySqft,
} from 'core';
import type { Bundle } from 'core';

const UOM_OPTIONS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'square_foot', label: 'Square ft' },
  { value: 'linear_foot', label: 'Linear ft' },
];

type OrderMode = 'by-product' | 'by-width' | 'by-area';

const MODE_TABS: { value: OrderMode; label: string }[] = [
  { value: 'by-product', label: 'By Product' },
  { value: 'by-width', label: 'By Width' },
  { value: 'by-area', label: 'By Area' },
];

type BundleSortKey = 'price-sqft' | 'price-linft';

function targetMarginPricePerEach(product: Product): string {
  const costPerEach = product.properties.cost_per_each ?? 0;
  const target = product.properties.margin_target / 100;
  return (costPerEach / (1 - target)).toFixed(2);
}

interface OrderForm {
  customer: string;
  productId: string;
  quantity: string;
  uom: UnitOfMeasure;
  sellPrice: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = {
  customer: '',
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

function formatPercent(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// --- By Width mode ---

interface WidthInputs {
  width: string;
  length: string;
  sellPrice: string;
}

const EMPTY_WIDTH_INPUTS: WidthInputs = {
  width: '',
  length: '',
  sellPrice: '',
};

interface BundleCardProps {
  bundle: Bundle;
  sellPricePerUnit: number;
  onSelectForQuote: (bundle: Bundle, sellPrice: number) => void;
}

function BundleCard({ bundle, sellPricePerUnit, onSelectForQuote }: BundleCardProps) {
  const { product, quantity, totalLinft, totalSqft, overage } = bundle;
  const p = product.properties;

  const totalRevenue = sellPricePerUnit * quantity;
  const costTotal = bundle.costTotal;
  const { dollars: marginDollars, percent: marginPercent } = calculateMargin(
    totalRevenue,
    costTotal,
  );
  const marginHealth = evaluateMargin(marginPercent, p.margin_target, p.margin_floor);

  const customerPricePerSqft = totalSqft === 0 ? 0 : totalRevenue / totalSqft;
  const customerPricePerLinft = totalLinft === 0 ? 0 : totalRevenue / totalLinft;

  const overageLinft = overage / (p.width_inches / 12);

  const marginColorClasses: Record<string, string> = {
    healthy: 'bg-emerald-50 border-emerald-400 text-emerald-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    critical: 'bg-red-50 border-red-400 text-red-800',
  };
  const marginTextClasses: Record<string, string> = {
    healthy: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-red-700',
  };

  const marginClass = marginColorClasses[marginHealth];
  const marginTextClass = marginTextClasses[marginHealth];

  const overageLinftRounded = Math.round(overageLinft * 10) / 10;
  const overageLabel =
    overageLinftRounded <= 0 ? 'no waste' : `${formatNumber(overageLinftRounded, 1)} ft overage`;

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
      {/* Header: product name + SKU */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{p.name}</p>
          <p className="text-xs text-zinc-500">{p.sku}</p>
        </div>
        <button
          type="button"
          onClick={() => onSelectForQuote(bundle, sellPricePerUnit)}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
        >
          Select for Quote
        </button>
      </div>

      {/* Quantity + delivery */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-zinc-700">
          <span className="font-medium">{quantity}</span> rolls
        </span>
        <span className="text-zinc-500">
          {formatNumber(totalLinft, 0)} ft — {overageLabel}
        </span>
      </div>

      {/* Customer pricing */}
      {sellPricePerUnit > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
          <span>
            <span className="font-medium">${customerPricePerSqft.toFixed(2)}</span>
            <span className="text-zinc-500"> / sqft</span>
          </span>
          <span>
            <span className="font-medium">${customerPricePerLinft.toFixed(2)}</span>
            <span className="text-zinc-500"> / linft</span>
          </span>
        </div>
      )}

      {/* Margin — rep only */}
      {sellPricePerUnit > 0 && (
        <div className={`rounded-md border px-3 py-2 ${marginClass}`}>
          <div className="flex items-baseline gap-3">
            <span className={`text-sm font-bold ${marginTextClass}`}>
              {formatCurrency(marginDollars)}
            </span>
            <span className={`text-sm font-semibold ${marginTextClass}`}>
              {formatPercent(marginPercent)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ByAreaBundleCardProps {
  bundle: Bundle;
  sellPricePerUnit: number;
  onSelectForQuote: (bundle: Bundle, sellPrice: number) => void;
}

function ByAreaBundleCard({ bundle, sellPricePerUnit, onSelectForQuote }: ByAreaBundleCardProps) {
  const { product, quantity, totalLinft, totalSqft, overage } = bundle;
  const p = product.properties;

  const totalRevenue = sellPricePerUnit * quantity;
  const costTotal = bundle.costTotal;
  const { dollars: marginDollars, percent: marginPercent } = calculateMargin(
    totalRevenue,
    costTotal,
  );
  const marginHealth = evaluateMargin(marginPercent, p.margin_target, p.margin_floor);

  const customerPricePerSqft = totalSqft === 0 ? 0 : totalRevenue / totalSqft;
  const customerPricePerLinft = totalLinft === 0 ? 0 : totalRevenue / totalLinft;

  const lengthFeet = p.length_inches / 12;
  const rollLengthStr = Number.isInteger(lengthFeet)
    ? `${lengthFeet} ft`
    : `${lengthFeet.toFixed(1)} ft`;

  const overageRounded = Math.round(overage * 10) / 10;
  const deliveredLabel =
    overageRounded <= 0
      ? `${formatNumber(totalSqft, 0)} sqft delivered`
      : `${formatNumber(totalSqft, 0)} sqft delivered — ${formatNumber(overageRounded, 1)} sqft overage`;

  const marginColorClasses: Record<string, string> = {
    healthy: 'bg-emerald-50 border-emerald-400 text-emerald-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    critical: 'bg-red-50 border-red-400 text-red-800',
  };
  const marginTextClasses: Record<string, string> = {
    healthy: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-red-700',
  };

  const marginClass = marginColorClasses[marginHealth];
  const marginTextClass = marginTextClasses[marginHealth];

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
      {/* Header: product name + SKU */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-zinc-900">{p.name}</p>
          <p className="text-xs text-zinc-500">{p.sku}</p>
          <p className="text-xs text-zinc-400">
            {p.width_inches}&quot; &times; {p.length_inches}&quot; rolls ({rollLengthStr})
          </p>
        </div>
        <button
          type="button"
          onClick={() => onSelectForQuote(bundle, sellPricePerUnit)}
          className="shrink-0 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
        >
          Select for Quote
        </button>
      </div>

      {/* Quantity + delivery */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-zinc-700">
          <span className="font-medium">{quantity}</span> rolls
        </span>
        <span className="text-zinc-500">{deliveredLabel}</span>
      </div>

      {/* Customer pricing */}
      {sellPricePerUnit > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
          <span>
            <span className="font-medium">${customerPricePerSqft.toFixed(2)}</span>
            <span className="text-zinc-500"> / sqft</span>
          </span>
          <span>
            <span className="font-medium">${customerPricePerLinft.toFixed(2)}</span>
            <span className="text-zinc-500"> / linft</span>
          </span>
        </div>
      )}

      {/* Margin — rep only */}
      {sellPricePerUnit > 0 && (
        <div className={`rounded-md border px-3 py-2 ${marginClass}`}>
          <div className="flex items-baseline gap-3">
            <span className={`text-sm font-bold ${marginTextClass}`}>
              {formatCurrency(marginDollars)}
            </span>
            <span className={`text-sm font-semibold ${marginTextClass}`}>
              {formatPercent(marginPercent)}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

interface ByAreaPanelProps {
  products: Product[];
  onSelectForQuote: (productId: string, quantity: number, sellPrice: number) => void;
}

function ByAreaPanel({ products, onSelectForQuote }: ByAreaPanelProps) {
  const [sqft, setSqft] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sortKey, setSortKey] = useState<BundleSortKey>('price-sqft');

  const totalSqft = parseFloat(sqft);
  const sellPricePerUnit = parseFloat(sellPrice);

  const hasSqft = !isNaN(totalSqft) && totalSqft > 0;
  const hasSellPrice = !isNaN(sellPricePerUnit) && sellPricePerUnit >= 0;

  const rawBundles: Bundle[] = useMemo(() => {
    if (!hasSqft) return [];
    return findBundlesBySqft(products, totalSqft);
  }, [products, totalSqft, hasSqft]);

  const sortedBundles: Bundle[] = useMemo(() => {
    if (rawBundles.length === 0 || !hasSellPrice || sellPricePerUnit === 0) {
      return rawBundles;
    }
    const copy = [...rawBundles];
    if (sortKey === 'price-sqft') {
      copy.sort((a, b) => {
        const aPricePerSqft = a.totalSqft === 0 ? 0 : (sellPricePerUnit * a.quantity) / a.totalSqft;
        const bPricePerSqft = b.totalSqft === 0 ? 0 : (sellPricePerUnit * b.quantity) / b.totalSqft;
        return aPricePerSqft - bPricePerSqft;
      });
    } else {
      copy.sort((a, b) => {
        const aPricePerLinft =
          a.totalLinft === 0 ? 0 : (sellPricePerUnit * a.quantity) / a.totalLinft;
        const bPricePerLinft =
          b.totalLinft === 0 ? 0 : (sellPricePerUnit * b.quantity) / b.totalLinft;
        return aPricePerLinft - bPricePerLinft;
      });
    }
    return copy;
  }, [rawBundles, sortKey, sellPricePerUnit, hasSellPrice]);

  const handleSelectForQuote = (bundle: Bundle, bundleSellPrice: number) => {
    onSelectForQuote(bundle.product.id, bundle.quantity, bundleSellPrice);
  };

  const showEmptyState = hasSqft && products.length === 0;
  const showNoBundles = hasSqft && products.length > 0 && rawBundles.length === 0;

  return (
    <div className="space-y-4">
      {/* Inputs row */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor="area-input-sqft" className="block text-sm font-medium text-zinc-700 mb-1">
            Total Area (sqft)
          </label>
          <input
            id="area-input-sqft"
            type="number"
            step="any"
            min="0"
            value={sqft}
            onChange={(e) => setSqft(e.target.value)}
            placeholder="500"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="area-input-sell-price"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Sell price per unit ($)
          </label>
          <input
            id="area-input-sell-price"
            type="number"
            step="0.01"
            min="0"
            value={sellPrice}
            onChange={(e) => setSellPrice(e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
          />
        </div>
      </div>

      {/* Empty state: no products in catalog */}
      {showEmptyState && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 text-center">
          <p className="text-sm text-zinc-500">No products in catalog</p>
        </div>
      )}

      {/* No bundles found (shouldn't normally happen since all products are eligible) */}
      {showNoBundles && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 text-center">
          <p className="text-sm text-zinc-500">No products in catalog</p>
        </div>
      )}

      {/* Bundle list */}
      {sortedBundles.length > 0 && (
        <div className="space-y-3">
          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Sort by:</span>
            <button
              type="button"
              onClick={() => setSortKey('price-sqft')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                sortKey === 'price-sqft'
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Price/sqft ↑
            </button>
            <button
              type="button"
              onClick={() => setSortKey('price-linft')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                sortKey === 'price-linft'
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Price/linft ↑
            </button>
          </div>

          {/* Bundle cards */}
          {sortedBundles.map((bundle) => (
            <ByAreaBundleCard
              key={bundle.product.id}
              bundle={bundle}
              sellPricePerUnit={hasSellPrice ? sellPricePerUnit : 0}
              onSelectForQuote={handleSelectForQuote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ByWidthPanelProps {
  products: Product[];
  onSelectForQuote: (productId: string, quantity: number, sellPrice: number) => void;
}

function ByWidthPanel({ products, onSelectForQuote }: ByWidthPanelProps) {
  const [inputs, setInputs] = useState<WidthInputs>({ ...EMPTY_WIDTH_INPUTS });
  const [sortKey, setSortKey] = useState<BundleSortKey>('price-sqft');

  const widthInches = parseFloat(inputs.width);
  const lengthFeet = parseFloat(inputs.length);
  const sellPricePerUnit = parseFloat(inputs.sellPrice);

  const hasWidth = !isNaN(widthInches) && widthInches > 0;
  const hasLength = !isNaN(lengthFeet) && lengthFeet > 0;
  const hasSellPrice = !isNaN(sellPricePerUnit) && sellPricePerUnit >= 0;

  const rawBundles: Bundle[] = useMemo(() => {
    if (!hasWidth || !hasLength) return [];
    const totalLengthInches = lengthFeet * 12;
    return findBundlesByWidth(products, widthInches, totalLengthInches);
  }, [products, widthInches, lengthFeet, hasWidth, hasLength]);

  const sortedBundles: Bundle[] = useMemo(() => {
    if (rawBundles.length === 0 || !hasSellPrice || sellPricePerUnit === 0) {
      return rawBundles;
    }
    const copy = [...rawBundles];
    if (sortKey === 'price-sqft') {
      copy.sort((a, b) => {
        const aPricePerSqft = a.totalSqft === 0 ? 0 : (sellPricePerUnit * a.quantity) / a.totalSqft;
        const bPricePerSqft = b.totalSqft === 0 ? 0 : (sellPricePerUnit * b.quantity) / b.totalSqft;
        return aPricePerSqft - bPricePerSqft;
      });
    } else {
      copy.sort((a, b) => {
        const aPricePerLinft =
          a.totalLinft === 0 ? 0 : (sellPricePerUnit * a.quantity) / a.totalLinft;
        const bPricePerLinft =
          b.totalLinft === 0 ? 0 : (sellPricePerUnit * b.quantity) / b.totalLinft;
        return aPricePerLinft - bPricePerLinft;
      });
    }
    return copy;
  }, [rawBundles, sortKey, sellPricePerUnit, hasSellPrice]);

  const handleInputChange = (field: keyof WidthInputs, value: string) => {
    setInputs((prev) => ({ ...prev, [field]: value }));
  };

  const handleSelectForQuote = (bundle: Bundle, sellPrice: number) => {
    onSelectForQuote(bundle.product.id, bundle.quantity, sellPrice);
  };

  const showEmptyState = hasWidth && hasLength && rawBundles.length === 0;

  return (
    <div className="space-y-4">
      {/* Inputs row */}
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label
            htmlFor="width-input-width"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Width (inches)
          </label>
          <input
            id="width-input-width"
            type="number"
            step="any"
            min="0"
            value={inputs.width}
            onChange={(e) => handleInputChange('width', e.target.value)}
            placeholder="48"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="width-input-length"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Total Length (feet)
          </label>
          <input
            id="width-input-length"
            type="number"
            step="any"
            min="0"
            value={inputs.length}
            onChange={(e) => handleInputChange('length', e.target.value)}
            placeholder="200"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
          />
        </div>
        <div>
          <label
            htmlFor="width-input-sell-price"
            className="block text-sm font-medium text-zinc-700 mb-1"
          >
            Sell price per unit ($)
          </label>
          <input
            id="width-input-sell-price"
            type="number"
            step="0.01"
            min="0"
            value={inputs.sellPrice}
            onChange={(e) => handleInputChange('sellPrice', e.target.value)}
            placeholder="0.00"
            className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
          />
        </div>
      </div>

      {/* Empty state */}
      {showEmptyState && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-6 text-center">
          <p className="text-sm text-zinc-500">No products available at {widthInches}&quot;</p>
        </div>
      )}

      {/* Bundle list */}
      {sortedBundles.length > 0 && (
        <div className="space-y-3">
          {/* Sort controls */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-zinc-500">Sort by:</span>
            <button
              type="button"
              onClick={() => setSortKey('price-sqft')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                sortKey === 'price-sqft'
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Price/sqft ↑
            </button>
            <button
              type="button"
              onClick={() => setSortKey('price-linft')}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                sortKey === 'price-linft'
                  ? 'bg-zinc-800 text-white'
                  : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
              }`}
            >
              Price/linft ↑
            </button>
          </div>

          {/* Bundle cards */}
          {sortedBundles.map((bundle) => (
            <BundleCard
              key={bundle.product.id}
              bundle={bundle}
              sellPricePerUnit={hasSellPrice ? sellPricePerUnit : 0}
              onSelectForQuote={handleSelectForQuote}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export const OrderEntry: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [mode, setMode] = useState<OrderMode>('by-product');

  // Tracks whether the current product selection came from "Select for Quote".
  // When true, skip the auto-seed of sell price so the quoted price is preserved.
  const skipSellPriceSeedRef = useRef(false);

  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

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

  const marginHealth =
    computed && selectedProduct
      ? evaluateMargin(
          computed.margin_percent,
          selectedProduct.properties.margin_target,
          selectedProduct.properties.margin_floor,
        )
      : null;

  const isFractionalEaches = computed !== null && !Number.isInteger(computed.qty_eaches);

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
    setSuccessMessage(null);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setSubmitError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer: form.customer.trim(),
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

      setSuccessMessage('Order confirmed successfully!');
      setForm({ ...EMPTY_FORM });
    } catch {
      setSubmitError('Network error submitting order');
    } finally {
      setSubmitting(false);
    }
  };

  // Called by ByWidthPanel when rep clicks "Select for Quote"
  const handleSelectForQuote = (productId: string, quantity: number, sellPrice: number) => {
    if (sellPrice > 0) {
      skipSellPriceSeedRef.current = true;
    }
    setMode('by-product');
    setForm((prev) => ({
      ...prev,
      productId,
      quantity: quantity.toString(),
      uom: 'each',
      sellPrice: sellPrice > 0 ? sellPrice.toFixed(2) : prev.sellPrice,
    }));
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const marginColorClasses: Record<string, string> = {
    healthy: 'bg-emerald-50 border-emerald-400 text-emerald-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    critical: 'bg-red-50 border-red-400 text-red-800',
  };

  const marginTextClasses: Record<string, string> = {
    healthy: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-red-700',
  };

  const marginClass = marginHealth ? marginColorClasses[marginHealth] : '';
  const marginTextClass = marginHealth ? marginTextClasses[marginHealth] : 'text-zinc-400';

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
          {successMessage && (
            <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          {submitError && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
              {submitError}
            </div>
          )}

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

          {mode === 'by-width' && (
            <ByWidthPanel products={products} onSelectForQuote={handleSelectForQuote} />
          )}

          {mode === 'by-area' && (
            <ByAreaPanel products={products} onSelectForQuote={handleSelectForQuote} />
          )}

          {mode === 'by-product' && (
            <form onSubmit={handleSubmit}>
              <div className="grid grid-cols-2 gap-6">
                {/* Left column: inputs */}
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="field-customer"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Customer
                    </label>
                    <input
                      id="field-customer"
                      type="text"
                      value={form.customer}
                      onChange={(e) => handleChange('customer', e.target.value)}
                      placeholder="Customer name"
                      tabIndex={1}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
                    />
                  </div>

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
                      Sell price per each ($)
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

                  <button
                    type="submit"
                    tabIndex={6}
                    disabled={submitting || !selectedProduct || !hasQty || !hasPrice}
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
                          <div className={`mt-3 rounded-lg border-2 p-4 ${marginClass}`}>
                            <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">
                              Margin
                            </p>
                            <div className="flex items-baseline gap-3">
                              <span className={`text-2xl font-black ${marginTextClass}`}>
                                {formatCurrency(computed.margin_dollars)}
                              </span>
                              <span className={`text-xl font-bold ${marginTextClass}`}>
                                {formatPercent(computed.margin_percent)}%
                              </span>
                            </div>
                          </div>
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
