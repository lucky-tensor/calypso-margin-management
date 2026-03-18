import React, { useState, useEffect, useCallback } from 'react';
import type { Order, OrderStatus } from 'core';

const UOM_LABELS: Record<string, string> = {
  each: 'Unidade',
  linear_foot: 'Pe linear',
  square_foot: 'Pe quadrado',
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  draft: 'Rascunho',
  confirmed: 'Confirmado',
  cancelled: 'Cancelado',
};

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
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
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Rascunho' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'cancelled', label: 'Cancelado' },
];

interface ConfirmDialogProps {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({ message, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <p className="text-sm text-zinc-700 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition-colors"
          >
            Voltar
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            Confirmar cancelamento
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
      if (!res.ok) throw new Error('Erro ao carregar pedidos');
      const data: Order[] = await res.json();
      setOrders(data);
    } catch {
      setError('Erro ao carregar pedidos');
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
        setActionError(data.error || 'Erro ao atualizar pedido');
        return;
      }
      const updated: Order = await res.json();
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
    } catch {
      setActionError('Erro de rede ao atualizar pedido');
    }
  };

  const handleConfirmarClick = (orderId: string) => {
    setPendingAction({ orderId, action: 'confirm' });
  };

  const handleCancelarClick = (orderId: string) => {
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
      ? 'Deseja confirmar este pedido?'
      : 'Deseja cancelar este pedido? Esta acao nao pode ser desfeita.';

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Historico de Pedidos</h2>

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
            placeholder="Filtrar por cliente..."
            aria-label="Filtrar por cliente"
            className="px-3 py-1.5 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm w-48"
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
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
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
          <p className="text-zinc-500 text-sm">Nenhum pedido encontrado.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && orders.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Data</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Cliente</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Produto</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Qtd</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">UOM</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Receita</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Custo</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Margem %</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Status</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Conf./Canc. por</th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Acoes</th>
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
                  auditInfo = `${p.confirmed_by}${p.confirmed_at ? ' em ' + formatDateTime(p.confirmed_at) : ''}`;
                } else if (p.status === 'cancelled' && p.cancelled_by) {
                  auditInfo = `${p.cancelled_by}${p.cancelled_at ? ' em ' + formatDateTime(p.cancelled_at) : ''}`;
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
                      {p.quantity.toLocaleString('pt-BR')}
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
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
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
                            onClick={() => handleConfirmarClick(order.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md transition-colors"
                          >
                            Confirmar
                          </button>
                        )}
                        {(p.status === 'draft' || p.status === 'confirmed') && (
                          <button
                            onClick={() => handleCancelarClick(order.id)}
                            className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                          >
                            Cancelar
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
          onConfirm={handleDialogConfirm}
          onCancel={handleDialogCancel}
        />
      )}
    </div>
  );
};
