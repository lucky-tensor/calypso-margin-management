import React, { useState, useCallback, useMemo } from 'react';
import type { Bundle } from 'core';
import { calculateMargin, calculateCost, convertUnits } from 'core';
import { MarginBox } from './MarginBox';

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export interface BundleCardBaseProps {
  bundle: Bundle;
  /** Unique key to disambiguate price inputs across cards */
  bundleKey: string;
  /** 'linft' shows linear ft emphasis, 'sqft' shows sqft emphasis */
  displayMode: 'linft' | 'sqft';
  customer: string;
  onCreateOrders: (
    items: Array<{
      productId: string;
      quantity: number;
      sellPricePerEach: number;
      customer: string;
    }>,
  ) => Promise<void>;
  creating?: boolean;
  /** Whether this bundle has the lowest costTotal among all shown bundles */
  isBestMargin?: boolean;
  /** Whether this bundle has the lowest overage among all shown bundles */
  isLeastWaste?: boolean;
}

export function BundleCardBase({
  bundle,
  bundleKey,
  displayMode,
  customer,
  onCreateOrders,
  creating = false,
  isBestMargin = false,
  isLeastWaste = false,
}: BundleCardBaseProps) {
  const { totalLinft, totalSqft, overage, items } = bundle;

  // Per-item sell prices, keyed by product id
  const [itemPrices, setItemPrices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const item of items) {
      const cost = item.product.properties.cost_per_each ?? 0;
      const target = item.product.properties.margin_target / 100;
      const raw = cost / (1 - target);
      initial[item.product.id] = (Math.ceil(raw * 100) / 100).toFixed(2);
    }
    return initial;
  });

  const [showReview, setShowReview] = useState(false);

  const handlePriceChange = useCallback((productId: string, value: string) => {
    setItemPrices((prev) => ({ ...prev, [productId]: value }));
  }, []);

  // Compute combined economics across all items
  const combinedEconomics = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let allPricesEntered = true;
    let weightedTarget = 0;
    let weightedFloor = 0;

    for (const item of items) {
      const priceStr = itemPrices[item.product.id] ?? '';
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

    // Cost-weighted average thresholds for combined margin display
    const avgTarget = totalCost > 0 ? weightedTarget / totalCost : 25;
    const avgFloor = totalCost > 0 ? weightedFloor / totalCost : 15;

    return {
      totalRevenue,
      totalCost,
      marginDollars,
      marginPercent,
      marginTarget: avgTarget,
      marginFloor: avgFloor,
      customerPricePerSqft: totalSqft === 0 ? 0 : totalRevenue / totalSqft,
      customerPricePerLinft: totalLinft === 0 ? 0 : totalRevenue / totalLinft,
    };
  }, [items, itemPrices, totalLinft, totalSqft]);

  const handleConfirmClick = () => {
    setShowReview(true);
  };

  const handleCancelReview = () => {
    setShowReview(false);
  };

  const handleConfirmOrders = async () => {
    const orderItems = items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      sellPricePerEach: parseFloat(itemPrices[item.product.id] ?? '0'),
      customer,
    }));
    await onCreateOrders(orderItems);
    setShowReview(false);
  };

  const allPricesValid = items.every((item) => {
    const price = parseFloat(itemPrices[item.product.id] ?? '');
    return !isNaN(price) && price > 0;
  });

  const canConfirm = allPricesValid && customer.trim().length > 0;

  // Button label: "Confirm Order" for single item, "Confirm Orders" for multi-item
  const confirmButtonLabel = items.length === 1 ? 'Confirm Order' : 'Confirm Orders';

  // Display overage based on mode
  const overageDisplay =
    displayMode === 'linft'
      ? (() => {
          // Convert sqft overage to linft if needed
          const overageLinft =
            items.length === 1
              ? overage / (items[0].product.properties.width_inches / 12)
              : overage;
          const rounded = Math.round(overageLinft * 10) / 10;
          return rounded <= 0 ? 'no waste' : `${formatNumber(rounded, 1)} ft overage`;
        })()
      : (() => {
          const rounded = Math.round(overage * 10) / 10;
          return rounded <= 0
            ? `${formatNumber(totalSqft, 0)} sqft delivered`
            : `${formatNumber(totalSqft, 0)} sqft delivered — ${formatNumber(rounded, 1)} sqft overage`;
        })();

  return (
    <div className="bg-white border border-zinc-200 rounded-lg p-4 space-y-3">
      {/* Pill badges */}
      {(isBestMargin || isLeastWaste) && (
        <div className="flex gap-1.5">
          {isBestMargin && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700">
              Best Margin
            </span>
          )}
          {isLeastWaste && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700">
              Least Waste
            </span>
          )}
        </div>
      )}

      {/* Review step */}
      {showReview ? (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-zinc-900">Review Order</p>

          {/* Customer */}
          <div className="text-sm text-zinc-700">
            <span className="font-medium">Customer:</span> {customer}
          </div>

          {/* Line items */}
          <div className="space-y-2">
            {items.map((item) => {
              const p = item.product.properties;
              const priceEach = parseFloat(itemPrices[item.product.id] ?? '0');
              const conversions = convertUnits(item.product, item.quantity, 'each');
              const linft = conversions.linear_feet;
              const sqft = conversions.square_feet;
              const lineTotal = item.quantity * priceEach;

              return (
                <div key={item.product.id} className="bg-zinc-50 rounded-md p-3 text-sm">
                  <div className="font-medium text-zinc-900">{p.name}</div>
                  <div className="text-xs text-zinc-500">{p.sku}</div>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-600">
                    <span>{item.quantity} units</span>
                    <span>{formatNumber(linft, 1)} lin ft</span>
                    <span>{formatNumber(sqft, 0)} sq ft</span>
                  </div>
                  <div className="mt-1 flex justify-between text-zinc-700">
                    <span>{formatCurrency(priceEach)} / each</span>
                    <span className="font-medium">{formatCurrency(lineTotal)}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals */}
          {combinedEconomics && (
            <div className="border-t border-zinc-100 pt-2 space-y-1 text-sm">
              <div className="flex justify-between text-zinc-700">
                <span>Total Revenue</span>
                <span className="font-medium">
                  {formatCurrency(combinedEconomics.totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-zinc-700">
                <span>Total Cost</span>
                <span className="font-medium">{formatCurrency(combinedEconomics.totalCost)}</span>
              </div>
              <MarginBox
                marginDollars={combinedEconomics.marginDollars}
                marginPercent={combinedEconomics.marginPercent}
                marginTarget={combinedEconomics.marginTarget}
                marginFloor={combinedEconomics.marginFloor}
                variant="compact"
              />
            </div>
          )}

          {/* Confirm / Cancel */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleConfirmOrders}
              disabled={creating}
              className="flex-1 px-3 py-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? 'Confirming...' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={handleCancelReview}
              disabled={creating}
              className="flex-1 px-3 py-1.5 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Item rows */}
          {items.map((item) => {
            const p = item.product.properties;
            const lengthFeet = p.length_inches / 12;
            const rollLengthStr = Number.isInteger(lengthFeet)
              ? `${lengthFeet} ft`
              : `${lengthFeet.toFixed(1)} ft`;

            return (
              <div key={item.product.id} className="space-y-2">
                {/* Product header */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-zinc-900">{p.name}</p>
                    <p className="text-xs text-zinc-500">{p.sku}</p>
                    {displayMode === 'sqft' && (
                      <p className="text-xs text-zinc-400">
                        {p.width_inches}&quot; &times; {p.length_inches}&quot; rolls (
                        {rollLengthStr})
                      </p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <label
                      htmlFor={`price-${bundleKey}-${item.product.id}`}
                      className="block text-xs text-zinc-500 mb-0.5"
                    >
                      $/each
                    </label>
                    <input
                      id={`price-${bundleKey}-${item.product.id}`}
                      type="number"
                      step="0.01"
                      min="0"
                      value={itemPrices[item.product.id] ?? ''}
                      onChange={(e) => handlePriceChange(item.product.id, e.target.value)}
                      placeholder="0.00"
                      className="w-24 px-2 py-1 text-sm border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none"
                      aria-label={`Sell price for ${p.name}`}
                    />
                  </div>
                </div>

                {/* Quantity */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-zinc-700">
                    <span className="font-medium">{item.quantity}</span> rolls
                  </span>
                  {displayMode === 'linft' && (
                    <span className="text-zinc-500">
                      {formatNumber(item.quantity * (p.length_inches / 12), 0)} ft
                    </span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Separator if multiple items */}
          {items.length > 1 && <div className="border-t border-zinc-100" />}

          {/* Combined delivery/overage */}
          <div className="text-sm text-zinc-500">{overageDisplay}</div>

          {/* Full financial detail when prices are entered */}
          {combinedEconomics && (
            <div className="space-y-1">
              <div className="flex justify-between text-sm text-zinc-700">
                <span>Revenue</span>
                <span className="font-medium">
                  {formatCurrency(combinedEconomics.totalRevenue)}
                </span>
              </div>
              <div className="flex justify-between text-sm text-zinc-700">
                <span>Cost</span>
                <span className="font-medium">{formatCurrency(combinedEconomics.totalCost)}</span>
              </div>

              {/* Customer unit prices */}
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700 pt-1">
                <span>
                  <span className="font-medium">
                    ${combinedEconomics.customerPricePerSqft.toFixed(2)}
                  </span>
                  <span className="text-zinc-500"> / sqft</span>
                </span>
                <span>
                  <span className="font-medium">
                    ${combinedEconomics.customerPricePerLinft.toFixed(2)}
                  </span>
                  <span className="text-zinc-500"> / linft</span>
                </span>
              </div>

              {/* Combined margin */}
              <MarginBox
                marginDollars={combinedEconomics.marginDollars}
                marginPercent={combinedEconomics.marginPercent}
                marginTarget={combinedEconomics.marginTarget}
                marginFloor={combinedEconomics.marginFloor}
                variant="compact"
              />
            </div>
          )}

          {/* Confirm Order(s) button */}
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={!canConfirm || creating}
            className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Confirming...' : confirmButtonLabel}
          </button>
        </>
      )}
    </div>
  );
}
