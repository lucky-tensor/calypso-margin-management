import React, { useState, useEffect, useCallback } from 'react';
import type { Role } from '../context/AuthContext';

interface UserSummary {
  id: string;
  username: string;
  role: Role;
  display_name: string;
}

const ROLE_LABELS: Record<Role, string> = {
  sales_rep: 'Sales Rep',
  inventory_manager: 'Inventory Manager',
  admin: 'Admin',
};

const ALL_ROLES: Role[] = ['sales_rep', 'inventory_manager', 'admin'];

interface EditDialogProps {
  user: UserSummary;
  onSave: (id: string, role: Role, display_name: string) => Promise<void>;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
}

function EditDialog({ user, onSave, onCancel, saving, error }: EditDialogProps) {
  const [role, setRole] = useState<Role>(user.role);
  const [displayName, setDisplayName] = useState(user.display_name);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(user.id, role, displayName);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm p-6">
        <h2 className="text-sm font-semibold text-zinc-900 mb-4">Edit User</h2>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-1">Username</label>
            <p className="text-sm text-zinc-900">{user.username}</p>
          </div>
          <div>
            <label htmlFor="display-name" className="block text-xs font-medium text-zinc-600 mb-1">
              Display Name
            </label>
            <input
              id="display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none"
            />
          </div>
          <div>
            <label htmlFor="role-select" className="block text-xs font-medium text-zinc-600 mb-1">
              Role
            </label>
            <select
              id="role-select"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-md text-sm focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none bg-white"
            >
              {ALL_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </select>
          </div>
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-3 rounded text-sm text-red-700">
              {error}
            </div>
          )}
          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-md transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export const UsersView: React.FC = () => {
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load users');
      const data: UserSummary[] = await res.json();
      setUsers(data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSave = async (id: string, role: Role, display_name: string) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/users/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role, display_name }),
      });
      if (!res.ok) {
        const data = await res.json();
        setSaveError(data.error || 'Failed to update user');
        return;
      }
      const updated: UserSummary = await res.json();
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
      setEditingUser(null);
    } catch {
      setSaveError('Network error updating user');
    } finally {
      setSaving(false);
    }
  };

  const handleEditClick = (user: UserSummary) => {
    setSaveError(null);
    setEditingUser(user);
  };

  const handleCancelEdit = () => {
    setEditingUser(null);
    setSaveError(null);
  };

  return (
    <div>
      <h2 className="text-lg font-semibold text-zinc-900 mb-4">Users</h2>

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
      {!loading && !error && users.length === 0 && (
        <div className="text-center py-12">
          <p className="text-zinc-500 text-sm">No users found.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50">
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Username</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Display Name</th>
                <th className="text-left px-4 py-3 font-medium text-zinc-600">Role</th>
                <th className="text-center px-4 py-3 font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-zinc-100 last:border-b-0 hover:bg-zinc-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-zinc-900">{user.username}</td>
                  <td className="px-4 py-3 text-zinc-700">{user.display_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${
                        user.role === 'admin'
                          ? 'bg-purple-100 text-purple-800'
                          : user.role === 'inventory_manager'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-zinc-100 text-zinc-700'
                      }`}
                    >
                      {ROLE_LABELS[user.role]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => handleEditClick(user)}
                      className="px-2.5 py-1 text-xs font-medium text-white bg-zinc-800 hover:bg-zinc-900 rounded-md transition-colors"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit dialog */}
      {editingUser && (
        <EditDialog
          user={editingUser}
          onSave={handleSave}
          onCancel={handleCancelEdit}
          saving={saving}
          error={saveError}
        />
      )}
    </div>
  );
};
