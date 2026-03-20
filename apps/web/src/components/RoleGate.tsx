import React, { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import type { Role } from '../context/AuthContext';

/**
 * Role hierarchy — roles that satisfy a given required role.
 * e.g. requiring 'inventory_manager' is satisfied by 'inventory_manager' or 'admin'.
 */
const ROLE_HIERARCHY: Record<Role, Role[]> = {
  sales_rep: ['sales_rep', 'inventory_manager', 'admin'],
  inventory_manager: ['inventory_manager', 'admin'],
  admin: ['admin'],
};

interface RoleGateProps {
  /** The minimum role required to see the children. */
  role: Role;
  children: ReactNode;
}

/**
 * Renders children only if the current user's role satisfies the required role.
 * - role="inventory_manager" renders for inventory_manager and admin.
 * - role="admin" renders only for admin.
 */
export function RoleGate({ role, children }: RoleGateProps) {
  const { user } = useAuth();

  if (!user) return null;

  const allowed = ROLE_HIERARCHY[role];
  if (!allowed.includes(user.role)) return null;

  return <>{children}</>;
}
