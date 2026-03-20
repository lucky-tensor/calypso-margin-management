import React, { useState, useEffect, useCallback } from 'react';
import { PackagePlus } from 'lucide-react';
import type { StockPosition } from 'core';
import { StockAdjustmentDialog } from './StockAdjustmentDialog';
import type { StockAdjustmentTarget } from './StockAdjustmentDialog';

interface InventoryEntry {
  product_id: string;
  product_sku: string;
  product_name: string;
  position: StockPosition;
}

const STATUS_LABELS: Record<string, string> = {
  healthy: 'In Stock',
  warning: 'Low Stock',
  critical: 'Out of Stock',
};

const STATUS_CLASSES: Record<string, string> = {
  healthy: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  critical: 'bg-red-50 text-red-700',
};

export function InventoryDashboard() {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<StockAdjustmentTarget | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inventory', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to load inventory');
      }
      const data: InventoryEntry[] = await res.json();
      setEntries(data);
    } catch {
      setError('Failed to load inventory');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  const openAdjust = (entry: InventoryEntry) => {
    setAdjustTarget({
      productId: entry.product_id,
      productName: entry.product_name,
      productSku: entry.product_sku,
      currentQty: entry.position.qty_on_hand,
    });
  };

  const closeAdjust = () => setAdjustTarget(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Inventory Dashboard</h2>
      </div>

      {entries.length === 0 ? (
        <div className="text-zinc-400 text-sm py-8 text-center">No inventory data yet.</div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-600">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Product</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">On Hand</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Available</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Status</th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr
                  key={entry.product_id}
                  className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3 font-mono text-xs text-zinc-600">{entry.product_sku}</td>
                  <td className="px-4 py-3 font-medium text-zinc-900">{entry.product_name}</td>
                  <td className="px-4 py-3 text-right text-zinc-600">
                    {entry.position.qty_on_hand}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600">
                    {entry.position.effective_available}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_CLASSES[entry.position.status] ?? ''}`}
                    >
                      {STATUS_LABELS[entry.position.status] ?? entry.position.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => openAdjust(entry)}
                      className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                      title="Adjust Stock"
                    >
                      <PackagePlus size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {adjustTarget && (
        <StockAdjustmentDialog
          target={adjustTarget}
          onClose={closeAdjust}
          onSuccess={fetchInventory}
        />
      )}
    </div>
  );
}
