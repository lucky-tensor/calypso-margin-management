import React from 'react';

export type StockStatus = 'healthy' | 'warning' | 'critical';

export interface AvailabilityData {
  product_id: string;
  effective_available: number;
  status: StockStatus;
  status_label: string;
  can_order: boolean;
}

interface StockBadgeProps {
  availability: AvailabilityData;
  /** Projected quantity after entering this order (in eaches), or null if not yet entered */
  projectedEaches?: number | null;
}

function statusColorBar(status: StockStatus): string {
  if (status === 'healthy') return 'bg-emerald-500';
  if (status === 'warning') return 'bg-amber-500';
  return 'bg-red-500';
}

function statusBadgeClass(status: StockStatus): string {
  if (status === 'healthy') return 'text-emerald-700 bg-emerald-50 border border-emerald-200';
  if (status === 'warning') return 'text-amber-700 bg-amber-50 border border-amber-200';
  return 'text-red-700 bg-red-50 border border-red-200';
}

function projectedStatusBadgeClass(status: StockStatus): string {
  if (status === 'healthy') return 'text-emerald-700';
  if (status === 'warning') return 'text-amber-700';
  return 'text-red-700';
}

function projectedStatusLabel(status: StockStatus): string {
  if (status === 'healthy') return 'In Stock';
  if (status === 'warning') return 'Low Stock';
  return 'Out of Stock';
}

function computeProjectedStatus(available: number, orderedEaches: number): StockStatus {
  // Simplified: projected = available - orderedEaches
  // If <= 0 critical, > 0 and <= 10% of available -> warning, else healthy
  // Use simple threshold: <=0 critical, <=available/4 warning, else healthy
  const projected = available - orderedEaches;
  if (projected <= 0) return 'critical';
  if (projected <= available * 0.25) return 'warning';
  return 'healthy';
}

export function StockBadge({ availability, projectedEaches }: StockBadgeProps) {
  const { effective_available, status, status_label } = availability;
  const showProjected = projectedEaches != null && projectedEaches > 0;
  const projectedStatus = showProjected
    ? computeProjectedStatus(effective_available, projectedEaches!)
    : null;

  return (
    <div className="bg-zinc-50 rounded-lg border border-zinc-200 p-4 space-y-3">
      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide">Stock</p>

      {/* Color bar */}
      <div className="w-full h-1.5 rounded-full bg-zinc-200 overflow-hidden">
        <div
          className={`h-full rounded-full ${statusColorBar(status)}`}
          style={{
            width: status === 'healthy' ? '100%' : status === 'warning' ? '50%' : '10%',
          }}
        />
      </div>

      {/* Available count + status badge */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-zinc-700">
          <span className="font-semibold text-zinc-900">{effective_available}</span> available
        </span>
        <span
          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(status)}`}
        >
          {status_label}
        </span>
      </div>

      {/* Projected position after quantity entry */}
      {showProjected && projectedStatus && (
        <div className="border-t border-zinc-200 pt-2">
          <p className="text-xs text-zinc-500 mb-1">After this order:</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-zinc-700">
              <span className="font-semibold text-zinc-900">
                {Math.max(0, effective_available - projectedEaches!)}
              </span>{' '}
              projected
            </span>
            <span className={`text-xs font-medium ${projectedStatusBadgeClass(projectedStatus)}`}>
              {projectedStatusLabel(projectedStatus)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
