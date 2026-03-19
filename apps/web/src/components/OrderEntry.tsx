import React, { useState, useEffect, useCallback } from 'react';
import type { Product, UnitOfMeasure } from 'core';
import { computeOrderFields, evaluateMargin, calculateCost, convertUnits } from 'core';

const UOM_OPTIONS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'square_foot', label: 'Square ft' },
  { value: 'linear_foot', label: 'Linear ft' },
];

function targetMarginPrice(product: Product, uom: UnitOfMeasure): string {
  const cost = calculateCost(product, convertUnits(product, 1, uom));
  const target = product.properties.margin_target / 100;
  return (cost / (1 - target)).toFixed(2);
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

export const OrderEntry: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

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

  // When product or UOM changes, seed sell price with the zero-margin rate
  useEffect(() => {
    if (selectedProduct) {
      setForm((prev) => ({ ...prev, sellPrice: targetMarginPrice(selectedProduct, prev.uom) }));
    }
  }, [selectedProduct, form.uom]);

  const qty = parseFloat(form.quantity);
  const price = parseFloat(form.sellPrice);
  const hasQty = !isNaN(qty) && qty > 0;
  const hasPrice = !isNaN(price) && price >= 0;

  const computed =
    selectedProduct && hasQty && hasPrice
      ? computeOrderFields(selectedProduct, qty, form.uom, price)
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

  const handleChange = <K extends keyof OrderForm>(field: K, value: OrderForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setSuccessMessage(null);
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
          sell_price_per_unit: price,
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
                    Sell price per unit ($)
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
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                            Fractional unit — confirm with operations whether to round up or down
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
        </>
      )}
    </div>
  );
};
