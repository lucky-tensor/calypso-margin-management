import React from 'react';
import { evaluateMargin } from 'core';

const MARGIN_COLOR_CLASSES: Record<string, string> = {
  healthy: 'bg-emerald-50 border-emerald-400 text-emerald-800',
  warning: 'bg-amber-50 border-amber-400 text-amber-800',
  critical: 'bg-red-50 border-red-400 text-red-800',
};

const MARGIN_TEXT_CLASSES: Record<string, string> = {
  healthy: 'text-emerald-700',
  warning: 'text-amber-700',
  critical: 'text-red-700',
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

export interface MarginBoxProps {
  marginDollars: number;
  marginPercent: number;
  marginTarget: number;
  marginFloor: number;
  /** 'large' for By Product mode hero display, 'compact' for bundle cards */
  variant?: 'large' | 'compact';
}

export function MarginBox({
  marginDollars,
  marginPercent,
  marginTarget,
  marginFloor,
  variant = 'compact',
}: MarginBoxProps) {
  const displayMargin = Math.round(marginPercent * 10) / 10;
  const health = evaluateMargin(displayMargin, marginTarget, marginFloor);
  const colorClass = MARGIN_COLOR_CLASSES[health];
  const textClass = MARGIN_TEXT_CLASSES[health];

  if (variant === 'large') {
    return (
      <div className={`mt-3 rounded-lg border-2 p-4 ${colorClass}`}>
        <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">Margin</p>
        <div className="flex items-baseline gap-3">
          <span className={`text-2xl font-black ${textClass}`}>
            {formatCurrency(marginDollars)}
          </span>
          <span className={`text-xl font-bold ${textClass}`}>{formatPercent(marginPercent)}%</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-md border px-3 py-2 ${colorClass}`}>
      <div className="flex items-baseline gap-3">
        <span className={`text-sm font-bold ${textClass}`}>{formatCurrency(marginDollars)}</span>
        <span className={`text-sm font-semibold ${textClass}`}>
          {formatPercent(marginPercent)}%
        </span>
      </div>
    </div>
  );
}
