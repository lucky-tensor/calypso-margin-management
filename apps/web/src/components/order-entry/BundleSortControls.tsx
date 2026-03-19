import React from 'react';

export type BundleSortKey = 'price-sqft' | 'price-linft';

export interface BundleSortControlsProps {
  sortKey: BundleSortKey;
  onSortChange: (key: BundleSortKey) => void;
  /** When true, sort is using cost-based fallback; labels show "Cost/" instead of "Price/" */
  usingCost?: boolean;
}

export function BundleSortControls({
  sortKey,
  onSortChange,
  usingCost = false,
}: BundleSortControlsProps) {
  const prefix = usingCost ? 'Cost' : 'Price';
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-zinc-500">Sort by:</span>
      <button
        type="button"
        onClick={() => onSortChange('price-sqft')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          sortKey === 'price-sqft'
            ? 'bg-zinc-800 text-white'
            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
        }`}
      >
        {prefix}/sqft ↑
      </button>
      <button
        type="button"
        onClick={() => onSortChange('price-linft')}
        className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
          sortKey === 'price-linft'
            ? 'bg-zinc-800 text-white'
            : 'bg-zinc-100 text-zinc-700 hover:bg-zinc-200'
        }`}
      >
        {prefix}/linft ↑
      </button>
    </div>
  );
}
