import React, { useState, useEffect, useCallback } from 'react';
import type { Product, ProductProperties, CostBasis } from 'core';
import { Plus, Pencil, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const COST_BASIS_OPTIONS: { value: CostBasis; label: string }[] = [
  { value: 'each', label: 'Each' },
  { value: 'linear_foot', label: 'Linear ft' },
  { value: 'square_foot', label: 'Square ft' },
];

const COST_BASIS_DISPLAY: Record<CostBasis, string> = {
  each: 'Each',
  linear_foot: 'Linear ft',
  square_foot: 'Square ft',
};

interface FormData {
  name: string;
  sku: string;
  material: string;
  width_inches: string;
  length_inches: string;
  weight_per_sqft: string;
  cost_per_each: string;
  cost_per_linft: string;
  cost_per_sqft: string;
  primary_cost_basis: CostBasis;
  margin_target: string;
  margin_floor: string;
}

const EMPTY_FORM: FormData = {
  name: '',
  sku: '',
  material: '',
  width_inches: '',
  length_inches: '',
  weight_per_sqft: '',
  cost_per_each: '',
  cost_per_linft: '',
  cost_per_sqft: '',
  primary_cost_basis: 'each',
  margin_target: '25',
  margin_floor: '15',
};

function formDataFromProduct(p: ProductProperties): FormData {
  return {
    name: p.name,
    sku: p.sku,
    material: p.material,
    width_inches: String(p.width_inches),
    length_inches: String(p.length_inches),
    weight_per_sqft: String(p.weight_per_sqft),
    cost_per_each: p.cost_per_each !== null ? String(p.cost_per_each) : '',
    cost_per_linft: p.cost_per_linft !== null ? String(p.cost_per_linft) : '',
    cost_per_sqft: p.cost_per_sqft !== null ? String(p.cost_per_sqft) : '',
    primary_cost_basis: p.primary_cost_basis,
    margin_target: String(p.margin_target),
    margin_floor: String(p.margin_floor),
  };
}

export function validateForm(form: FormData): string[] {
  const errors: string[] = [];
  if (!form.name.trim()) errors.push('Name is required');
  if (!form.sku.trim()) errors.push('SKU is required');
  if (!form.width_inches || Number(form.width_inches) <= 0)
    errors.push('Width must be greater than 0');
  if (!form.length_inches || Number(form.length_inches) <= 0)
    errors.push('Length must be greater than 0');

  const basis = form.primary_cost_basis;
  if (basis === 'each' && !form.cost_per_each)
    errors.push('Cost per each is required when cost basis is each');
  if (basis === 'linear_foot' && !form.cost_per_linft)
    errors.push('Cost per linear ft is required when cost basis is linear foot');
  if (basis === 'square_foot' && !form.cost_per_sqft)
    errors.push('Cost per square ft is required when cost basis is square foot');

  const mt = Number(form.margin_target);
  const mf = Number(form.margin_floor);
  if (mf < 0) errors.push('Margin floor must be >= 0');
  if (mt <= mf) errors.push('Margin target must be greater than margin floor');

  return errors;
}

function formDataToPayload(form: FormData): Partial<ProductProperties> {
  return {
    name: form.name.trim(),
    sku: form.sku.trim(),
    material: form.material.trim(),
    width_inches: Number(form.width_inches),
    length_inches: Number(form.length_inches),
    weight_per_sqft: Number(form.weight_per_sqft) || 0,
    cost_per_each: form.cost_per_each ? Number(form.cost_per_each) : null,
    cost_per_linft: form.cost_per_linft ? Number(form.cost_per_linft) : null,
    cost_per_sqft: form.cost_per_sqft ? Number(form.cost_per_sqft) : null,
    primary_cost_basis: form.primary_cost_basis,
    margin_target: Number(form.margin_target),
    margin_floor: Number(form.margin_floor),
  };
}

function ProductModal({
  editingProduct,
  onClose,
  onSaved,
}: {
  editingProduct: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormData>(
    editingProduct ? formDataFromProduct(editingProduct.properties) : { ...EMPTY_FORM },
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (field: keyof FormData, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors([]);

    const validationErrors = validateForm(form);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    try {
      const payload = formDataToPayload(form);
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      const method = editingProduct ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setErrors([data.error || 'Failed to save product']);
        return;
      }

      onSaved();
      onClose();
    } catch {
      setErrors(['Network error saving product']);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto">
        <div className="flex items-center justify-between p-5 border-b border-zinc-200">
          <h2 className="text-lg font-semibold text-zinc-900">
            {editingProduct ? 'Edit Product' : 'Add Product'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {errors.length > 0 && (
          <div className="mx-5 mt-4 bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
            <ul className="list-disc list-inside space-y-1">
              {errors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder="Product name"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">SKU</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => handleChange('sku', e.target.value)}
                placeholder="SKU code"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Material</label>
            <input
              type="text"
              value={form.material}
              onChange={(e) => handleChange('material', e.target.value)}
              placeholder="Material type"
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="field-width" className="block text-sm font-medium text-zinc-700 mb-1">
                Width (in.)
              </label>
              <input
                id="field-width"
                type="number"
                step="any"
                value={form.width_inches}
                onChange={(e) => handleChange('width_inches', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label
                htmlFor="field-length"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Length (in.)
              </label>
              <input
                id="field-length"
                type="number"
                step="any"
                value={form.length_inches}
                onChange={(e) => handleChange('length_inches', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Weight per sq ft (lb)
              </label>
              <input
                type="number"
                step="any"
                value={form.weight_per_sqft}
                onChange={(e) => handleChange('weight_per_sqft', e.target.value)}
                placeholder="0"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">
              Primary cost basis
            </label>
            <select
              value={form.primary_cost_basis}
              onChange={(e) => handleChange('primary_cost_basis', e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm bg-white"
            >
              {COST_BASIS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="field-cost-each"
                className="block text-sm font-medium text-zinc-700 mb-1"
              >
                Cost per each ($)
              </label>
              <input
                id="field-cost-each"
                type="number"
                step="0.01"
                value={form.cost_per_each}
                onChange={(e) => handleChange('cost_per_each', e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Cost per lin. ft ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.cost_per_linft}
                onChange={(e) => handleChange('cost_per_linft', e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Cost per sq ft ($)
              </label>
              <input
                type="number"
                step="0.01"
                value={form.cost_per_sqft}
                onChange={(e) => handleChange('cost_per_sqft', e.target.value)}
                placeholder="—"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Target margin (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.margin_target}
                onChange={(e) => handleChange('margin_target', e.target.value)}
                placeholder="25"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1">
                Margin floor (%)
              </label>
              <input
                type="number"
                step="0.1"
                value={form.margin_floor}
                onChange={(e) => handleChange('margin_floor', e.target.value)}
                placeholder="15"
                className="w-full px-3 py-2 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none text-sm"
              />
            </div>
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

export const ProductCatalog: React.FC = () => {
  const { user } = useAuth();
  const canEdit = user?.role === 'inventory_manager' || user?.role === 'admin';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/products', { credentials: 'include' });
      if (!res.ok) {
        throw new Error('Failed to load products');
      }
      const data: Product[] = await res.json();
      setProducts(data);
    } catch {
      setError('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const openAdd = () => {
    setEditingProduct(null);
    setModalOpen(true);
  };

  const openEdit = (product: Product) => {
    setEditingProduct(product);
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingProduct(null);
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-zinc-900">Product Catalog</h2>
        {canEdit && (
          <button
            onClick={openAdd}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
          >
            <Plus size={16} />
            Add Product
          </button>
        )}
      </div>

      {products.length === 0 ? (
        <div className="text-zinc-400 text-sm py-8 text-center">
          No products yet. Click &quot;Add Product&quot; to get started.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-600">SKU</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Name</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Material</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Width</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Length</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Cost Basis</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Cost</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Target Margin</th>
                <th className="text-right px-4 py-3 font-medium text-zinc-600">Margin Floor</th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const p = product.properties;
                const costDisplay = getCostDisplay(p);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-zinc-600">{p.sku}</td>
                    <td className="px-4 py-3 font-medium text-zinc-900">{p.name}</td>
                    <td className="px-4 py-3 text-zinc-600">{p.material}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{p.width_inches}&quot;</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{p.length_inches}&quot;</td>
                    <td className="px-4 py-3 text-zinc-600">
                      {COST_BASIS_DISPLAY[p.primary_cost_basis]}
                    </td>
                    <td className="px-4 py-3 text-right text-zinc-600">{costDisplay}</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{p.margin_target}%</td>
                    <td className="px-4 py-3 text-right text-zinc-600">{p.margin_floor}%</td>
                    <td className="px-4 py-3 text-center">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(product)}
                          className="p-1.5 rounded-lg hover:bg-zinc-100 text-zinc-400 hover:text-zinc-600 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOpen && (
        <ProductModal
          editingProduct={editingProduct}
          onClose={closeModal}
          onSaved={fetchProducts}
        />
      )}
    </div>
  );
};

function getCostDisplay(p: ProductProperties): string {
  switch (p.primary_cost_basis) {
    case 'each':
      return p.cost_per_each !== null ? `$${p.cost_per_each.toFixed(2)}` : '—';
    case 'linear_foot':
      return p.cost_per_linft !== null ? `$${p.cost_per_linft.toFixed(2)}` : '—';
    case 'square_foot':
      return p.cost_per_sqft !== null ? `$${p.cost_per_sqft.toFixed(2)}` : '—';
    default:
      return '—';
  }
}
