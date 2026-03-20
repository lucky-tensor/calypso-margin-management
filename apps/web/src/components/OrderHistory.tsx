import React, { useState, useEffect, useCallback } from 'react';
import type { Order, OrderStatus } from 'core';

const UOM_LABELS: Record<string, string> = {
  each: 'Each',
  linear_foot: 'Linear ft',
  square_foot: 'Square ft',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
  shipped: 'Shipped',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatPercent(value: number): string {
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getMarginColorClass(
  marginPercent: number,
  marginTarget: number,
  marginFloor: number,
): string {
  if (marginPercent >= marginTarget) return 'text-emerald-700 font-semibold';
  if (marginPercent >= marginFloor) return 'text-amber-700 font-semibold';
  return 'text-red-700 font-semibold';
}

function getMarginBgClass(
  marginPercent: number,
  marginTarget: number,
  marginFloor: number,
): string {
  if (marginPercent >= marginTarget) return 'bg-emerald-50';
  if (marginPercent >= marginFloor) return 'bg-amber-50';
  return 'bg-red-50';
}

const STATUS_FILTER_TABS: { value: OrderStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
];

interface ConfirmDialogProps {
  message: string;
  actionType: 'confirm' | 'cancel';
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, actionType, onConfirm, onCancel }: ConfirmDialogProps) {
  const actionLabel = actionType === 'confirm' ? 'Confirm' : 'Cancel order';
  const actionClass =
    actionType === 'confirm'
      ? 'bg-zinc-800 hover:bg-zinc-900 text-white'
      : 'bg-red-600 hover:bg-red-700 text-white';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-zinc-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors"
          >
            Go back
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${actionClass}`}
          >
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export const OrderHistory: React.FC = () => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | 'all'>('all');
  const [customerFilter, setCustomerFilter] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<{
    orderId: string;
    action: 'confirm' | 'cancel';
  } | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (customerFilter.trim()) params.set('customer', customerFilter.trim());

      const url = `/api/orders${params.toString() ? `?${params.toString()}` : ''}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load orders');
      const data: Order[] = await res.json();
      setOrders(data);
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, customerFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusChange = async (orderId: string, newStatus: 'confirmed' | 'cancelled') => {
    setActionError(null);
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        setActionError(data.error || 'Failed to update order');
        return;
      }
      const updated: Order = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch {
      setActionError('Network error updating order');
    }
  };

  const handleConfirmClick = (orderId: string) => {
    setPendingAction({ orderId, action: 'confirm' });
  };

  const handleCancelClick = (orderId: string) => {
    setPendingAction({ orderId, action: 'cancel' });
  };

  const handleDialogConfirm = async () => {
    if (!pendingAction) return;
    const { orderId, action } = pendingAction;
    setPendingAction(null);
    if (action === 'confirm') {
      await handleStatusChange(orderId, 'confirmed');
    } else {
      await handleStatusChange(orderId, 'cancelled');
    }
  };

  const handleDialogCancel = () => {
    setPendingAction(null);
  };

  const dialogMessage =
    pendingAction?.action === 'confirm'
      ? 'Confirm this order?'
      : 'Cancel this order? This action cannot be undone.';

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Order History</h2>

      {/* Filters */}
      <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Status tabs */}
        <div className="flex gap-1 bg-zinc-100 rounded-lg p-1">
          {STATUS_FILTER_TABS.map((tab) => (
            <button
              key={tab.value}
              onClick={() => setStatusFilter(tab.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                statusFilter === tab.value
                  ? 'bg-white text-zinc-900 shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Customer filter */}
        <div>
          <input
            type="text"
            value={customerFilter}
            onChange={(e) => setCustomerFilter(e.target.value)}
            placeholder="Filter by customer..."
            aria-label="Filter by customer"
            className="px-3 py-1.5 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm w-48"
          />
        </div>
      </div>

      {/* Action error */}
      {actionError && (
        <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
          {actionError}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-800"></div>
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && orders.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">No orders found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && orders.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Date</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Customer</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Product</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Qty</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">UOM</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Revenue</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Cost</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Margin %</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Conf./Canc. by</th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const p = order.properties;
                const marginColorClass = getMarginColorClass(
                  p.margin_percent,
                  p.margin_target,
                  p.margin_floor,
                );
                const marginBgClass = getMarginBgClass(
                  p.margin_percent,
                  p.margin_target,
                  p.margin_floor,
                );

                let auditInfo: string | null = null;
                if (p.status === 'confirmed' && p.confirmed_by) {
                  auditInfo = `${p.confirmed_by}${p.confirmed_at ? ' at ' + formatDateTime(p.confirmed_at) : ''}`;
                } else if (p.status === 'cancelled' && p.cancelled_by) {
                  auditInfo = `${p.cancelled_by}${p.cancelled_at ? ' at ' + formatDateTime(p.cancelled_at) : ''}`;
                }

                return (
                  <tr
                    key={order.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-4 py-3 text-zinc-600 whitespace-nowrap">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.customer}</td>
                    <td className="px-4 py-3 text-zinc-700">{p.product_name}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {p.quantity.toLocaleString('en-US')}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">
                      {UOM_LABELS[p.unit_of_measure] ?? p.unit_of_measure}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {formatCurrency(p.total_revenue)}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">
                      {formatCurrency(p.total_cost)}
                    </td>
                    <td className={`px-4 py-3 text-right ${marginBgClass}`}>
                      <span className={marginColorClass}>{formatPercent(p.margin_percent)}%</span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                          p.status === 'confirmed'
                            ? 'bg-emerald-100 text-emerald-800'
                            : p.status === 'cancelled'
                              ? 'bg-zinc-100 text-zinc-600'
                              : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {STATUS_LABELS[p.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-zinc-500 max-w-[140px] truncate">
                      {auditInfo ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {p.status === 'draft' && (
                          <button
                            onClick={() => handleConfirmClick(order.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
                          >
                            Confirm
                          </button>
                        )}
                        {(p.status === 'draft' || p.status === 'confirmed') && (
                          <button
                            onClick={() => handleCancelClick(order.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                          >
                            Cancel
                          </button>
                        )}
                        {p.status === 'cancelled' && (
                          <span className="text-xs text-zinc-400">—</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirm/Cancel dialog */}
      {pendingAction && (
        <ConfirmDialog
          message={dialogMessage}
          actionType={pendingAction.action}
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
};
