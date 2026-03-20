import { test, expect, describe, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import React from 'react';
import { Login } from '../../src/components/Login';
import { AuthProvider } from '../../src/context/AuthContext';

describe('Login demo buttons', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  test('shows 4 demo account buttons when VITE_DEMO_MODE is true', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Demo accounts')).toBeVisible();
    await expect.element(screen.getByText('Sales Rep')).toBeVisible();
    await expect.element(screen.getByText('Order Clerk')).toBeVisible();
    await expect.element(screen.getByText('Inv Manager')).toBeVisible();
    await expect.element(screen.getByText('Admin')).toBeVisible();
  });

  test('clicking Sales Rep button triggers login with sales_rep credentials', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'demo-1', username: 'sales_rep' } }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Sales Rep')).toBeVisible();
    await screen.getByText('Sales Rep').click();

    const loginCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/auth/login') &&
        call[1]?.body?.includes('sales_rep'),
    );
    expect(loginCall).toBeTruthy();

    const body = JSON.parse(loginCall![1].body);
    expect(body.username).toBe('sales_rep');
    expect(body.password).toBe('demo1234');
  });

  test('clicking Order Clerk button triggers login with order_clerk credentials', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'demo-2', username: 'order_clerk' } }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Order Clerk')).toBeVisible();
    await screen.getByText('Order Clerk').click();

    const loginCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/auth/login') &&
        call[1]?.body?.includes('order_clerk'),
    );
    expect(loginCall).toBeTruthy();

    const body = JSON.parse(loginCall![1].body);
    expect(body.username).toBe('order_clerk');
    expect(body.password).toBe('demo1234');
  });

  test('clicking Inv Manager button triggers login with inv_manager credentials', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: { id: 'demo-3', username: 'inv_manager', role: 'inventory_manager' },
        }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Inv Manager')).toBeVisible();
    await screen.getByText('Inv Manager').click();

    const loginCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/auth/login') &&
        call[1]?.body?.includes('inv_manager'),
    );
    expect(loginCall).toBeTruthy();

    const body = JSON.parse(loginCall![1].body);
    expect(body.username).toBe('inv_manager');
    expect(body.password).toBe('demo1234');
  });

  test('clicking Admin button triggers login with admin credentials', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ user: { id: 'demo-4', username: 'admin', role: 'admin' } }),
      });
    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <Login />
      </AuthProvider>,
    );

    await expect.element(screen.getByText('Admin')).toBeVisible();
    await screen.getByText('Admin').click();

    const loginCall = mockFetch.mock.calls.find(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/api/auth/login') &&
        call[1]?.body?.includes('"admin"'),
    );
    expect(loginCall).toBeTruthy();

    const body = JSON.parse(loginCall![1].body);
    expect(body.username).toBe('admin');
    expect(body.password).toBe('demo1234');
  });
});
