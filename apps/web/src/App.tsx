import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { Role } from './context/AuthContext';
import { Login } from './components/Login';
import { ProductCatalog } from './components/ProductCatalog';
import { OrderEntry } from './components/OrderEntry';
import { OrderHistory } from './components/OrderHistory';
import { User, ShoppingCart, Package, History, Warehouse, Users } from 'lucide-react';
import { UsersView } from './components/UsersView';

type ViewId = 'order-entry' | 'products' | 'inventory' | 'history' | 'users';

interface NavItem {
  id: ViewId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon: React.ComponentType<any>;
  label: string;
  roles?: Role[];
}

function App() {
  const { user, logout, loading } = useAuth();
  const [activeView, setActiveView] = useState<ViewId>('order-entry');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-zinc-900"></div>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  const allNavItems: NavItem[] = [
    { id: 'order-entry', icon: ShoppingCart, label: 'Order Entry' },
    { id: 'products', icon: Package, label: 'Products' },
    { id: 'inventory', icon: Warehouse, label: 'Inventory', roles: ['inventory_manager', 'admin'] },
    { id: 'history', icon: History, label: 'History' },
    { id: 'users', icon: Users, label: 'Users', roles: ['admin'] },
  ];

  const navItems = allNavItems.filter((item) => !item.roles || item.roles.includes(user.role));

  return (
    <div className="flex h-screen w-full bg-zinc-50 font-sans overflow-hidden text-zinc-900">
      {/* Left Sidebar */}
      <nav className="w-16 shrink-0 border-r border-zinc-200 bg-white flex flex-col items-center py-6 justify-between z-10">
        <div className="flex flex-col items-center gap-6">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-sm">
            <span className="text-white font-black text-lg">M</span>
          </div>

          <div className="flex flex-col gap-4 mt-4 w-full px-2">
            {navItems.map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => setActiveView(id)}
                title={label}
                className={`p-3 rounded-lg flex items-center justify-center transition-all ${
                  activeView === id
                    ? 'bg-emerald-50 text-emerald-600'
                    : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600'
                }`}
              >
                <Icon size={20} strokeWidth={2.5} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-4">
          <button
            onClick={logout}
            title="Logout"
            className="w-10 h-10 rounded-lg bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-600 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors focus:ring-2 focus:ring-offset-2 focus:ring-red-500 outline-none"
          >
            <User size={18} />
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-12 px-5 border-b border-zinc-200 flex items-center shrink-0 bg-white shadow-sm">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-emerald-100" />
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">MeshMargin</h1>
            <span className="text-zinc-200 font-light text-base leading-none">/</span>
            <span className="text-xs text-zinc-400 font-medium">
              {navItems.find((n) => n.id === activeView)?.label}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-6">
          {activeView === 'order-entry' && (
            <OrderEntry onNavigateToHistory={() => setActiveView('history')} />
          )}
          {activeView === 'products' && <ProductCatalog />}
          {activeView === 'inventory' && (
            <div className="text-sm text-zinc-500">Inventory management coming soon.</div>
          )}
          {activeView === 'history' && <OrderHistory />}
          {activeView === 'users' && <UsersView />}
        </div>
      </main>
    </div>
  );
}

export default function Root() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}
