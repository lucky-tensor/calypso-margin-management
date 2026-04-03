import { test, expect, describe, beforeEach, vi } from 'vitest';
import { render } from 'vitest-browser-react';
import React from 'react';
import { AuthProvider, useAuth } from '../../src/context/AuthContext';
import type { Role } from '../../src/context/AuthContext';

/**
 * Component tests for AuthContext mid-session expiry handling (issue #129).
 *
 * Verifies:
 * - fetch('/api/auth/me') is called a second time when the tab transitions
 *   from hidden to visible (visibilitychange event).
 * - When the visibilitychange fetch returns 401, the user transitions to null
 *   (login screen appears).
 */

function AuthDisplay() {
  const { user, loading } = useAuth();
  if (loading) return <div data-testid="loading">Loading...</div>;
  if (!user) return <div data-testid="logged-out">Not logged in</div>;
  return (
    <div data-testid="logged-in">
      <span data-testid="username">{user.username}</span>
      <span data-testid="role">{user.role}</span>
    </div>
  );
}

/** Fire a synthetic visibilitychange event with the given state. */
function fireVisibilityChange(state: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('AuthContext — mid-session expiry via visibilitychange', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Reset visibilityState to visible between tests
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    });
  });

  test('fetch(/api/auth/me) is called a second time on visible transition after hidden', async () => {
    const mockFetch = vi
      .fn()
      // First call: initial mount session check — succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'user-vis-1',
            username: 'vis_user',
            role: 'sales_rep' as Role,
            display_name: 'Vis User',
          },
        }),
      })
      // Second call: visibilitychange re-check — also succeeds
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'user-vis-1',
            username: 'vis_user',
            role: 'sales_rep' as Role,
            display_name: 'Vis User',
          },
        }),
      });

    vi.stubGlobal('fetch', mockFetch);

    render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    // Wait for initial render to settle
    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    // Simulate tab going hidden then becoming visible again
    fireVisibilityChange('hidden');
    fireVisibilityChange('visible');

    await vi.waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    // Both calls should be to /api/auth/me
    expect(mockFetch.mock.calls[0][0]).toBe('/api/auth/me');
    expect(mockFetch.mock.calls[1][0]).toBe('/api/auth/me');
  });

  test('user transitions to null when visibilitychange re-check returns 401', async () => {
    const mockFetch = vi
      .fn()
      // First call: initial mount — session is valid
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          user: {
            id: 'user-vis-2',
            username: 'expiring_user',
            role: 'sales_rep' as Role,
            display_name: 'Expiring User',
          },
        }),
      })
      // Second call: visibilitychange — token has now expired
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      });

    vi.stubGlobal('fetch', mockFetch);

    const screen = render(
      <AuthProvider>
        <AuthDisplay />
      </AuthProvider>,
    );

    // Wait for the user to be logged in after the initial session check
    await expect.element(screen.getByTestId('logged-in')).toBeVisible();

    // Simulate tab becoming visible — triggers a second fetch that returns 401
    fireVisibilityChange('hidden');
    fireVisibilityChange('visible');

    // The AuthContext should clear the user, showing the logged-out state
    await expect.element(screen.getByTestId('logged-out')).toBeVisible();
  });
});
