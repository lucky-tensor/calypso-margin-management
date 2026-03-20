import { sql } from 'db';
import type { Role, UserProperties } from 'core';
import { getCorsHeaders, requireRole } from './auth';

const VALID_ROLES: Role[] = ['sales_rep', 'inventory_manager', 'admin'];

export interface UserSummary {
  id: string;
  username: string;
  role: Role;
  display_name: string;
}

function rowToUserSummary(row: { id: string; properties: UserProperties }): UserSummary {
  return {
    id: row.id,
    username: row.properties.username,
    role: row.properties.role ?? 'sales_rep',
    display_name: row.properties.display_name ?? '',
  };
}

export async function handleUsersRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  if (!url.pathname.startsWith('/api/users')) return null;

  // GET /api/users — admin only
  if (req.method === 'GET' && url.pathname === '/api/users') {
    const guard = requireRole('admin');
    const authError = await guard(req);
    if (authError) return authError;

    try {
      const rows = await sql<{ id: string; properties: UserProperties }[]>`
        SELECT id, properties
        FROM entities
        WHERE type = 'user'
        ORDER BY properties->>'username' ASC
      `;
      const users: UserSummary[] = rows.map(rowToUserSummary);
      return new Response(JSON.stringify(users), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('GET /api/users ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // PATCH /api/users/:id — admin only
  const patchMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
  if (req.method === 'PATCH' && patchMatch) {
    const userId = patchMatch[1];

    const guard = requireRole('admin');
    const authError = await guard(req);
    if (authError) return authError;

    try {
      const body = await req.json();

      // Validate role if provided
      if (body.role !== undefined) {
        if (!VALID_ROLES.includes(body.role)) {
          return new Response(
            JSON.stringify({
              error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}`,
            }),
            {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            },
          );
        }
      }

      // Fetch the existing user
      const existing = await sql<{ id: string; properties: UserProperties }[]>`
        SELECT id, properties
        FROM entities
        WHERE id = ${userId} AND type = 'user'
      `;

      if (existing.length === 0) {
        return new Response(JSON.stringify({ error: 'User not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const currentProps = existing[0].properties;
      const updatedProps: UserProperties = {
        ...currentProps,
        ...(body.role !== undefined ? { role: body.role as Role } : {}),
        ...(body.display_name !== undefined ? { display_name: body.display_name } : {}),
      };

      const rows = await sql<{ id: string; properties: UserProperties }[]>`
        UPDATE entities
        SET properties = ${sql.json(JSON.parse(JSON.stringify(updatedProps)))},
            updated_at = CURRENT_TIMESTAMP,
            version = version + 1
        WHERE id = ${userId} AND type = 'user'
        RETURNING id, properties
      `;

      const user = rowToUserSummary(rows[0]);
      return new Response(JSON.stringify(user), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('PATCH /api/users/:id ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  return null;
}
