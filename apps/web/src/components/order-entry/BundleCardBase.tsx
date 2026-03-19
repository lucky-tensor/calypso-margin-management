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
  ) => void;
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

  const handleCreateOrders = () => {
    const orderItems = items.map((item) => ({
      productId: item.product.id,
      quantity: item.quantity,
      sellPricePerEach: parseFloat(itemPrices[item.product.id] ?? '0'),
      customer,
    }));
    onCreateOrders(orderItems);
  };

  const allPricesValid = items.every((item) => {
    const price = parseFloat(itemPrices[item.product.id] ?? '');
    return !isNaN(price) && price > 0;
  });

  const canCreateOrders = allPricesValid && customer.trim().length > 0;

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
                    {p.width_inches}&quot; &times; {p.length_inches}&quot; rolls ({rollLengthStr})
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

      {/* Customer pricing */}
      {combinedEconomics && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-700">
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
      )}

      {/* Combined margin */}
      {combinedEconomics && (
        <MarginBox
          marginDollars={combinedEconomics.marginDollars}
          marginPercent={combinedEconomics.marginPercent}
          marginTarget={combinedEconomics.marginTarget}
          marginFloor={combinedEconomics.marginFloor}
          variant="compact"
        />
      )}

      {/* Create Orders button */}
      <button
        type="button"
        onClick={handleCreateOrders}
        disabled={!canCreateOrders || creating}
        className="w-full px-3 py-1.5 text-xs font-semibold text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creating ? 'Creating...' : 'Create Orders'}
      </button>
    </div>
  );
}
