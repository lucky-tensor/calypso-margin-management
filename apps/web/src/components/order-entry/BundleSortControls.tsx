import React from 'react';

export type BundleSortKey = 'price-sqft' | 'price-linft';

export interface BundleSortControlsProps {
  sortKey: BundleSortKey;
  onSortChange: (key: BundleSortKey) => void;
  /** When true, labels show "Price/…"; when false, labels show "Cost/… (est.)" */
  usingSellPrice?: boolean;
}

export function BundleSortControls({
  sortKey,
  onSortChange,
  usingSellPrice = false,
}: BundleSortControlsProps) {
  const sqftLabel = usingSellPrice ? 'Price/sqft' : 'Cost/sqft (est.)';
  const linftLabel = usingSellPrice ? 'Price/linft' : 'Cost/linft (est.)';

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
        {sqftLabel} ↑
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
        {linftLabel} ↑
      </button>
    </div>
  );
}
