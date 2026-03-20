import React, { useState, useEffect, useCallback } from 'react';
import { Plus, ChevronDown, ChevronRight } from 'lucide-react';
import type { StockStatus } from 'core';

// ─── Types ───────────────────────────────────────────────────────────────────

interface StockPosition {
  qty_on_hand: number;
  committed_qty: number;
  pending_qty: number;
  net_available: number;
  effective_available: number;
  status: StockStatus;
  reorder_point: number;
  safety_stock: number;
  reorder_qty: number;
  lead_time_days: number;
  days_of_stock: number | null;
}

interface InventoryEntry {
  product_id: string;
  product_sku: string;
  product_name: string;
  position: StockPosition;
}

interface InventoryTxn {
  id: string;
  created_at: string;
  product_id: string;
  product_sku: string;
  txn_type: string;
  qty_eaches: number;
  reference: string;
  balance_after: number;
  created_by: string;
}

type FilterType = 'all' | 'below_reorder' | 'critical';

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: StockStatus }) {
  const config: Record<StockStatus, { label: string; className: string }> = {
    healthy: {
      label: 'Healthy',
      className: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
    },
    warning: {
      label: 'Low Stock',
      className: 'bg-amber-50 text-amber-700 border border-amber-200',
    },
    critical: {
      label: 'Critical',
      className: 'bg-red-50 text-red-700 border border-red-200',
    },
  };

  const { label, className } = config[status];
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${className}`}
    >
      {label}
    </span>
  );
}

// ─── Stock Adjustment Dialog ──────────────────────────────────────────────────

interface AdjustDialogProps {
  entry: InventoryEntry | null;
  onClose: () => void;
  onSaved: () => void;
}

function StockAdjustDialog({ entry, onClose, onSaved }: AdjustDialogProps) {
  const [txnType, setTxnType] = useState<'receipt' | 'adjustment' | 'return'>('receipt');
  const [qty, setQty] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!entry) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNum = Number(qty);
    if (!qty || isNaN(qtyNum)) {
      setError('Quantity is required');
      return;
    }
    if (!reference.trim()) {
      setError('Reference is required');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${entry.product_id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          txn_type: txnType,
          qty_eaches: qtyNum,
          reference: reference.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save adjustment');
        return;
      }

      onSaved();
      onClose();
    } catch {
      setError('Network error saving adjustment');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">Stock Adjustment</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="px-5 pt-4 text-sm text-zinc-500">
          <span className="font-medium text-zinc-900">{entry.product_name}</span>{' '}
          <span className="font-mono text-xs">({entry.product_sku})</span>
        </div>

        <div className="px-5 pt-3 text-sm text-zinc-500">
          Current balance{' '}
          <span className="font-medium text-zinc-900">{entry.position.qty_on_hand} ea</span>
        </div>

        {error && (
          <div className="mx-5 mt-3 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Type</label>
            <select
              value={txnType}
              onChange={(e) => setTxnType(e.target.value as typeof txnType)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
            >
              <option value="receipt">Receipt</option>
              <option value="adjustment">Adjustment</option>
              <option value="return">Return</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Quantity (eaches, use negative to subtract)
            </label>
            <input
              type="number"
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              placeholder="0"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="PO number or note"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Transaction Log ──────────────────────────────────────────────────────────

function TransactionLog({ productId }: { productId: string }) {
  const [transactions, setTransactions] = useState<InventoryTxn[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/inventory/${productId}/transactions`, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load transactions');
        return r.json();
      })
      .then((data: { transactions: InventoryTxn[] }) => {
        setTransactions(data.transactions);
      })
      .catch(() => setError('Failed to load transactions'))
      .finally(() => setLoading(false));
  }, [productId]);

  if (loading) {
    return <div className="px-6 py-3 text-xs text-zinc-400">Loading transactions...</div>;
  }

  if (error) {
    return <div className="px-6 py-3 text-xs text-red-600">{error}</div>;
  }

  if (transactions.length === 0) {
    return <div className="px-6 py-3 text-xs text-zinc-400">No transactions found.</div>;
  }

  return (
    <div className="px-6 pb-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-left py-1.5 font-medium text-zinc-500">Date</th>
            <th className="text-left py-1.5 font-medium text-zinc-500">Type</th>
            <th className="text-right py-1.5 font-medium text-zinc-500">Qty</th>
            <th className="text-right py-1.5 font-medium text-zinc-500">Balance After</th>
            <th className="text-left py-1.5 font-medium text-zinc-500">Reference</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((txn) => (
            <tr key={txn.id} className="border-b border-zinc-50 last:border-b-0">
              <td className="py-1.5 text-zinc-500">
                {new Date(txn.created_at).toLocaleDateString()}
              </td>
              <td className="py-1.5 text-zinc-600 capitalize">{txn.txn_type}</td>
              <td
                className={`py-1.5 text-right font-mono ${txn.qty_eaches >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {txn.qty_eaches >= 0 ? '+' : ''}
                {txn.qty_eaches}
              </td>
              <td className="py-1.5 text-right font-mono text-zinc-600">{txn.balance_after}</td>
              <td className="py-1.5 text-zinc-500">{txn.reference}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export const InventoryDashboard: React.FC = () => {
  const [entries, setEntries] = useState<InventoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterType>('all');
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [adjustTarget, setAdjustTarget] = useState<InventoryEntry | null>(null);

  const fetchInventory = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/inventory', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load inventory');
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

  const filteredEntries = entries.filter((e) => {
    if (filter === 'all') return true;
    if (filter === 'below_reorder') {
      return e.position.status === 'warning' || e.position.status === 'critical';
    }
    if (filter === 'critical') return e.position.status === 'critical';
    return true;
  });

  const toggleRow = (productId: string) => {
    setExpandedRow((prev) => (prev === productId ? null : productId));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
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
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Inventory</h2>
        <button
          onClick={() => setAdjustTarget(entries[0] ?? null)}
          title="Adjust Stock"
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
        >
          <Plus size={16} />
          Adjust Stock
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'below_reorder', label: 'Below Reorder' },
            { id: 'critical', label: 'Critical' },
          ] as { id: FilterType; label: string }[]
        ).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setFilter(id)}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              filter === id
                ? 'bg-zinc-800 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filteredEntries.length === 0 ? (
        <div className="text-zinc-400 text-sm py-8 text-center">
          {filter === 'all' ? 'No inventory data available.' : 'No products match this filter.'}
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="w-8 px-3 py-3"></th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Name</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">On Hand</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Committed</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Pending</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">
                  Effective Available
                </th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((entry) => {
                const isExpanded = expandedRow === entry.product_id;
                const p = entry.position;

                return (
                  <React.Fragment key={entry.product_id}>
                    <tr
                      className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors cursor-pointer"
                      onClick={() => toggleRow(entry.product_id)}
                    >
                      <td className="px-3 py-3 text-zinc-400">
                        {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-zinc-600">
                        {entry.product_sku}
                      </td>
                      <td className="px-4 py-3 font-medium text-zinc-900">{entry.product_name}</td>
                      <td className="px-4 py-3 text-right text-zinc-600">{p.qty_on_hand}</td>
                      <td className="px-4 py-3 text-right text-zinc-600">{p.committed_qty}</td>
                      <td className="px-4 py-3 text-right text-zinc-600">{p.pending_qty}</td>
                      <td className="px-4 py-3 text-right text-zinc-600">
                        {p.effective_available.toFixed(1)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-zinc-50 border-b border-zinc-100">
                        <td colSpan={8} className="p-0">
                          <TransactionLog productId={entry.product_id} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {adjustTarget && (
        <StockAdjustDialog
          entry={adjustTarget}
          onClose={() => setAdjustTarget(null)}
          onSaved={fetchInventory}
        />
      )}
    </div>
  );
};
