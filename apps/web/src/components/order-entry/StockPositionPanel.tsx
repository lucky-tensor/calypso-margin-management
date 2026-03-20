import React from 'react';
import type { StockStatus } from './StockBadge';

export interface StockPositionData {
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

interface StockPositionPanelProps {
  position: StockPositionData;
  pendingOrderWeight: number;
  /** Projected quantity after entering this order (in eaches), or null if not yet entered */
  projectedEaches?: number | null;
}

function statusColor(status: StockStatus): string {
  if (status === 'healthy') return 'text-emerald-700';
  if (status === 'warning') return 'text-amber-700';
  return 'text-red-700';
}

function statusLabel(status: StockStatus): string {
  if (status === 'healthy') return 'In Stock';
  if (status === 'warning') return 'Low Stock';
  return 'Out of Stock';
}

function projectedStatus(
  projected: number,
  reorderPoint: number,
  safetyStock: number,
): StockStatus {
  if (projected > reorderPoint) return 'healthy';
  if (projected > safetyStock) return 'warning';
  return 'critical';
}

export function StockPositionPanel({
  position,
  pendingOrderWeight,
  projectedEaches,
}: StockPositionPanelProps) {
  const showProjected = projectedEaches != null && projectedEaches > 0;

  // Projected effective: existing effective_available minus new order * weight
  const projectedEffective = showProjected
    ? position.effective_available - projectedEaches! * pendingOrderWeight
    : null;

  const projStatus =
    projectedEffective !== null
      ? projectedStatus(projectedEffective, position.reorder_point, position.safety_stock)
      : null;

  return (
    <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Stock Position</p>

      {/* Current status */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-500">Status</span>
        <span className={`text-sm font-semibold ${statusColor(position.status)}`}>
          {statusLabel(position.status)}
        </span>
      </div>

      {/* Breakdown */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">On hand</span>
          <span className="font-medium text-zinc-900">{position.qty_on_hand}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Committed</span>
          <span className="font-medium text-zinc-900">−{position.committed_qty}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Pending (×{pendingOrderWeight})</span>
          <span className="font-medium text-zinc-900">−{position.pending_qty}</span>
        </div>
        <div className="flex justify-between border-t border-zinc-200 pt-1.5">
          <span className="text-zinc-600 font-medium">Effective available</span>
          <span className="font-semibold text-zinc-900">{position.effective_available}</span>
        </div>
      </div>

      {/* Thresholds */}
      <div className="border-t border-zinc-200 pt-2 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-zinc-500">Reorder point</span>
          <span className="font-medium text-zinc-900">{position.reorder_point}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-500">Safety stock</span>
          <span className="font-medium text-zinc-900">{position.safety_stock}</span>
        </div>
        {position.days_of_stock !== null && (
          <div className="flex justify-between">
            <span className="text-zinc-500">Days of stock</span>
            <span className="font-medium text-zinc-900">
              {position.days_of_stock.toFixed(1)} days
            </span>
          </div>
        )}
      </div>

      {/* Projected position after quantity entry */}
      {showProjected && projectedEffective !== null && projStatus && (
        <div className="border-t border-zinc-200 pt-2 space-y-1">
          <p className="text-xs text-zinc-500 font-medium">After this order:</p>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Projected effective</span>
            <span className="font-medium text-zinc-900">{projectedEffective.toFixed(1)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-zinc-500">Projected status</span>
            <span className={`font-semibold ${statusColor(projStatus)}`}>
              {statusLabel(projStatus)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
