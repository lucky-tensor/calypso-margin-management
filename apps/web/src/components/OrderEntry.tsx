import React, { useState, useEffect, useCallback } from 'react';
import type { Product, UnitOfMeasure } from 'core';
import { computeOrderFields, evaluateMargin } from 'core';

const UOM_OPTIONS: { value: UnitOfMeasure; label: string }[] = [
  { value: 'each', label: 'Unidade' },
  { value: 'linear_foot', label: 'Pe linear' },
  { value: 'square_foot', label: 'Pe quadrado' },
];

interface OrderForm {
  customer: string;
  productId: string;
  quantity: string;
  uom: UnitOfMeasure;
  sellPrice: string;
  notes: string;
}

const EMPTY_FORM: OrderForm = {
  customer: '',
  productId: '',
  quantity: '',
  uom: 'each',
  sellPrice: '',
  notes: '',
};

function getProductContextLine(product: Product): string {
  const p = product.properties;
  const lengthFeet = p.length_inches / 12;
  const rollStr = Number.isInteger(lengthFeet) ? `${lengthFeet} pe` : `${lengthFeet.toFixed(1)} pe`;
  return `1 unidade = ${p.width_inches}" × ${p.length_inches}" (${rollStr} de rolo) — ${p.material}`;
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatNumber(value: number, decimals = 2): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

function formatPercent(value: number): string {
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

export const OrderEntry: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [productError, setProductError] = useState<string | null>(null);

  const [form, setForm] = useState<OrderForm>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoadingProducts(true);
    setProductError(null);
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      if (!res.ok) throw new Error('Erro ao carregar produtos');
      const data: Product[] = await res.json();
      setProducts(data);
    } catch {
      setProductError('Erro ao carregar produtos');
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const selectedProduct = products.find((p) => p.id === form.productId) ?? null;

  const qty = parseFloat(form.quantity);
  const price = parseFloat(form.sellPrice);
  const hasQty = !isNaN(qty) && qty > 0;
  const hasPrice = !isNaN(price) && price >= 0;

  const computed =
    selectedProduct && hasQty && hasPrice
      ? computeOrderFields(selectedProduct, qty, form.uom, price)
      : null;

  const marginHealth =
    computed && selectedProduct
      ? evaluateMargin(
          computed.margin_percent,
          selectedProduct.properties.margin_target,
          selectedProduct.properties.margin_floor,
        )
      : null;

  const isFractionalEaches = computed !== null && !Number.isInteger(computed.qty_eaches);

  const handleChange = <K extends keyof OrderForm>(field: K, value: OrderForm[K]) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSubmitError(null);
    setSuccessMessage(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) return;

    setSubmitError(null);
    setSuccessMessage(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customer: form.customer.trim(),
          product_id: form.productId,
          quantity: qty,
          unit_of_measure: form.uom,
          sell_price_per_unit: price,
          notes: form.notes.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setSubmitError(data.error || 'Erro ao confirmar pedido');
        return;
      }

      setSuccessMessage('Pedido confirmado com sucesso!');
      setForm({ ...EMPTY_FORM });
    } catch {
      setSubmitError('Erro de rede ao confirmar pedido');
    } finally {
      setSubmitting(false);
    }
  };

  const marginColorClasses: Record<string, string> = {
    healthy: 'bg-emerald-50 border-emerald-400 text-emerald-800',
    warning: 'bg-amber-50 border-amber-400 text-amber-800',
    critical: 'bg-red-50 border-red-400 text-red-800',
  };

  const marginTextClasses: Record<string, string> = {
    healthy: 'text-emerald-700',
    warning: 'text-amber-700',
    critical: 'text-red-700',
  };

  const marginClass = marginHealth ? marginColorClasses[marginHealth] : '';
  const marginTextClass = marginHealth ? marginTextClasses[marginHealth] : 'text-zinc-400';

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Entrada de Pedido</h2>

      {loadingProducts && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-600"></div>
        </div>
      )}

      {!loadingProducts && productError && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
          {productError}
        </div>
      )}

      {!loadingProducts && !productError && products.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm mb-2">Nenhum produto cadastrado.</p>
          <p className="text-zinc-400 text-sm">
            Adicione produtos no catalogo antes de criar um pedido.
          </p>
        </div>
      )}

      {!loadingProducts && !productError && products.length > 0 && (
        <>
          {successMessage && (
            <div className="mb-4 bg-emerald-50 border-l-4 border-emerald-500 p-3 rounded text-sm text-emerald-700">
              {successMessage}
            </div>
          )}

          {submitError && (
            <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
              {submitError}
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-2 gap-6">
              {/* Left column: inputs */}
              <div className="space-y-4">
                <div>
                  <label
                    htmlFor="field-customer"
                    className="block text-sm font-medium text-zinc-700 mb-1"
                  >
                    Cliente
                  </label>
                  <input
                    id="field-customer"
                    type="text"
                    value={form.customer}
                    onChange={(e) => handleChange('customer', e.target.value)}
                    placeholder="Nome do cliente"
                    tabIndex={1}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="field-product"
                    className="block text-sm font-medium text-zinc-700 mb-1"
                  >
                    Produto
                  </label>
                  <select
                    id="field-product"
                    value={form.productId}
                    onChange={(e) => handleChange('productId', e.target.value)}
                    tabIndex={2}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                  >
                    <option value="">Selecione um produto...</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.properties.name} ({p.properties.sku})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label
                      htmlFor="field-quantity"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Quantidade
                    </label>
                    <input
                      id="field-quantity"
                      type="number"
                      step="any"
                      min="0"
                      value={form.quantity}
                      onChange={(e) => handleChange('quantity', e.target.value)}
                      placeholder="0"
                      tabIndex={3}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="field-uom"
                      className="block text-sm font-medium text-zinc-700 mb-1"
                    >
                      Unid. de medida
                    </label>
                    <select
                      id="field-uom"
                      value={form.uom}
                      onChange={(e) => handleChange('uom', e.target.value as UnitOfMeasure)}
                      tabIndex={4}
                      className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm bg-white"
                    >
                      {UOM_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="field-sell-price"
                    className="block text-sm font-medium text-zinc-700 mb-1"
                  >
                    Preco por unidade (R$)
                  </label>
                  <input
                    id="field-sell-price"
                    type="number"
                    step="0.01"
                    min="0"
                    value={form.sellPrice}
                    onChange={(e) => handleChange('sellPrice', e.target.value)}
                    placeholder="0,00"
                    tabIndex={5}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm"
                  />
                </div>

                <div>
                  <label
                    htmlFor="field-notes"
                    className="block text-sm font-medium text-zinc-700 mb-1"
                  >
                    Observacoes (opcional)
                  </label>
                  <textarea
                    id="field-notes"
                    value={form.notes}
                    onChange={(e) => handleChange('notes', e.target.value)}
                    placeholder="Observacoes sobre o pedido..."
                    rows={3}
                    className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none text-sm resize-none"
                  />
                </div>

                <button
                  type="submit"
                  tabIndex={6}
                  disabled={submitting || !selectedProduct || !hasQty || !hasPrice}
                  className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Confirmando...' : 'Confirmar Pedido'}
                </button>
              </div>

              {/* Right column: computed results */}
              <div className="space-y-4">
                {selectedProduct ? (
                  <>
                    {/* Product context */}
                    <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
                      <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-1">
                        Contexto do Produto
                      </p>
                      <p className="text-sm text-zinc-800">
                        {getProductContextLine(selectedProduct)}
                      </p>
                    </div>

                    {/* Unit conversions */}
                    {computed ? (
                      <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 space-y-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                          Conversoes de Unidade
                        </p>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-600">Unidades</span>
                          <span className="font-medium text-zinc-900">
                            {formatNumber(computed.qty_eaches)} unidades
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-600">Pes lineares</span>
                          <span className="font-medium text-zinc-900">
                            {formatNumber(computed.qty_linft)} pes lineares
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-600">Pes quadrados</span>
                          <span className="font-medium text-zinc-900">
                            {formatNumber(computed.qty_sqft)} pes quadrados
                          </span>
                        </div>

                        {isFractionalEaches && (
                          <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-xs text-amber-700">
                            Unidade fracionada — verifique com operacoes se deve arredondar ou
                            cortar
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                          Conversoes de Unidade
                        </p>
                        <p className="text-sm text-zinc-400">
                          Informe quantidade e preco para ver as conversoes.
                        </p>
                      </div>
                    )}

                    {/* Cost & Margin */}
                    {computed ? (
                      <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4 space-y-2">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                          Custo e Margem
                        </p>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-600">Receita</span>
                          <span className="font-medium text-zinc-900">
                            {formatCurrency(computed.total_revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-zinc-600">Custo</span>
                          <span className="font-medium text-zinc-900">
                            {formatCurrency(computed.total_cost)}
                          </span>
                        </div>

                        {/* Margin display */}
                        <div className={`mt-3 rounded-xl border-2 p-4 ${marginClass}`}>
                          <p className="text-xs font-semibold uppercase tracking-wide opacity-70 mb-1">
                            Margem
                          </p>
                          <div className="flex items-baseline gap-3">
                            <span className={`text-2xl font-black ${marginTextClass}`}>
                              {formatCurrency(computed.margin_dollars)}
                            </span>
                            <span className={`text-xl font-bold ${marginTextClass}`}>
                              {formatPercent(computed.margin_percent)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-4">
                        <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">
                          Custo e Margem
                        </p>
                        <p className="text-sm text-zinc-400">
                          Informe quantidade e preco para ver o calculo de margem.
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full min-h-48 text-zinc-400 text-sm">
                    Selecione um produto para ver as informacoes.
                  </div>
                )}
              </div>
            </div>
          </form>
        </>
      )}
    </div>
  );
};
