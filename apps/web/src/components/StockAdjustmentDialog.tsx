import React, { useState } from 'react';
import { X } from 'lucide-react';
import { RoleGate } from './RoleGate';

export type TransactionType = 'receipt' | 'adjustment' | 'return';

export interface StockAdjustmentTarget {
  productId: string;
  productName: string;
  productSku: string;
  currentQty: number;
}

interface StockAdjustmentDialogProps {
  target: StockAdjustmentTarget;
  onClose: () => void;
  onSuccess: () => void;
}

const TXN_TYPE_OPTIONS: { value: TransactionType; label: string }[] = [
  { value: 'receipt', label: 'Receipt' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'return', label: 'Return' },
];

function StockAdjustmentDialogInner({ target, onClose, onSuccess }: StockAdjustmentDialogProps) {
  const [txnType, setTxnType] = useState<TransactionType>('receipt');
  const [quantity, setQuantity] = useState('');
  const [reference, setReference] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsedQty = quantity === '' ? null : Number(quantity);
  const projectedBalance =
    parsedQty !== null && !isNaN(parsedQty) ? target.currentQty + parsedQty : null;

  const wouldGoNegative = projectedBalance !== null && projectedBalance < 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (parsedQty === null || isNaN(parsedQty)) {
      setError('Quantity is required');
      return;
    }

    if (!reference.trim()) {
      setError('Reference is required');
      return;
    }

    if (wouldGoNegative) {
      setError(
        `Adjustment would result in negative stock. Current: ${target.currentQty}, Adjustment: ${parsedQty}, Result: ${projectedBalance}`,
      );
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/inventory/${target.productId}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          txn_type: txnType,
          qty_eaches: parsedQty,
          reference: reference.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? 'Failed to submit adjustment');
        return;
      }

      onSuccess();
      onClose();
    } catch {
      setError('Network error submitting adjustment');
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
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Product context (read-only) */}
          <div className="bg-zinc-50 rounded-md p-3 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-zinc-700">{target.productName}</span>
              <span className="text-xs font-mono text-zinc-500">{target.productSku}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span>Current balance</span>
              <span className="font-medium text-zinc-700">{target.currentQty} ea</span>
            </div>
          </div>

          {/* Transaction type */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Transaction type</label>
            <select
              value={txnType}
              onChange={(e) => setTxnType(e.target.value as TransactionType)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
            >
              {TXN_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Quantity */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Quantity (eaches)
            </label>
            <input
              type="number"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder={txnType === 'adjustment' ? 'positive or negative' : 'positive'}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          {/* Projected balance */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-zinc-500">Projected balance</span>
            {projectedBalance !== null ? (
              <span className={`font-medium ${wouldGoNegative ? 'text-red-600' : 'text-zinc-900'}`}>
                {projectedBalance} ea
              </span>
            ) : (
              <span className="text-zinc-400">—</span>
            )}
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Reference</label>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="PO number, reason, etc."
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          {/* Error */}
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
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
              disabled={submitting || wouldGoNegative}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * StockAdjustmentDialog — gated by inventory_manager role.
 * Renders nothing if the current user doesn't have sufficient permissions.
 */
export function StockAdjustmentDialog(props: StockAdjustmentDialogProps) {
  return (
    <RoleGate role="inventory_manager">
      <StockAdjustmentDialogInner {...props} />
    </RoleGate>
  );
}
