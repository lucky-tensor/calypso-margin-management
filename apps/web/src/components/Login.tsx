import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

interface DemoAccount {
  label: string;
  username: string;
  password: string;
}

const DEMO_ACCOUNTS: DemoAccount[] = [
  { label: 'Sales Rep', username: 'sales_rep', password: 'demo1234' },
  { label: 'Order Clerk', username: 'order_clerk', password: 'demo1234' },
];

export const Login: React.FC = () => {
  const { setUser } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const loginWithCredentials = async (user: string, pass: string) => {
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username: user, password: pass }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!username || password.length < 6) {
      setError('Username required, password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed.');
      }

      setUser(data.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDemoLogin = (account: DemoAccount) => {
    setUsername(account.username);
    setPassword(account.password);
    loginWithCredentials(account.username, account.password);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col justify-center items-center font-sans">
      <div className="text-center mb-8">
        <h1 className="text-5xl font-bold text-zinc-900 mb-2">The Wire.</h1>
        <h3 className="text-xl font-medium text-zinc-500">Pricing Season</h3>
      </div>
      <div className="bg-white p-8 rounded-lg shadow-sm border border-zinc-200 w-full max-w-md">
        <h1 className="text-3xl font-bold text-zinc-900 mb-2 text-center">MeshMargin</h1>
        <p className="text-zinc-500 text-center mb-8">
          {isRegister ? 'Create an account' : 'Sign in to your account'}
        </p>

        {error && (
          <div className="mb-4 bg-red-50 border-l-4 border-red-500 p-4 rounded text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Username</label>
            <input
              type="text"
              required
              className="w-full px-4 py-3 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-shadow"
              placeholder="e.g. jsmith"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-1">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 border border-zinc-300 rounded-md focus:ring-2 focus:ring-zinc-900 focus:border-zinc-900 outline-none transition-shadow"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-zinc-800 hover:bg-zinc-900 text-white font-bold py-3 rounded-md transition-colors shadow-sm disabled:opacity-50"
          >
            {loading ? 'Authenticating...' : isRegister ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        <div className="mt-6 text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-zinc-700 hover:text-zinc-900 hover:underline transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : 'Need an account? Register'}
          </button>
        </div>

        {DEMO_MODE && (
          <div className="mt-6 pt-6 border-t border-zinc-200">
            <p className="text-sm text-zinc-500 text-center mb-3">Demo accounts</p>
            <div className="flex gap-3">
              {DEMO_ACCOUNTS.map((account) => (
                <button
                  key={account.username}
                  type="button"
                  disabled={loading}
                  onClick={() => handleDemoLogin(account)}
                  className="flex-1 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-medium py-2 px-4 rounded-md transition-colors text-sm disabled:opacity-50"
                >
                  {account.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
