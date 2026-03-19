import { test, expect, describe, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import React from 'react';
import { Login } from '../../src/components/Login';
import { AuthProvider } from '../../src/context/AuthContext';

describe('Login demo buttons', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  test('shows demo account buttons when VITE_DEMO_MODE is true', async () => {
    // The VITE_DEMO_MODE env var is baked in at build time by Vite.
    // In the component test environment, we import the built module directly.
    // We need to set the env var before the module loads.
    // Since vitest-browser re-imports, we control this via env in vitest config.
    // For this test, we verify the buttons render when the module is loaded with VITE_DEMO_MODE=true.

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

    // The demo buttons should be visible when VITE_DEMO_MODE=true
    // (which is set in the test environment via vitest config define)
    await expect.element(screen.getByText('Demo accounts')).toBeVisible();
    await expect.element(screen.getByText('Sales Rep')).toBeVisible();
    await expect.element(screen.getByText('Order Clerk')).toBeVisible();
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

    // Verify the login fetch was called with sales_rep credentials
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
});
