import { sql } from 'db';
import type { Role } from 'core';
import { signJwt, verifyJwt } from '../auth/jwt';

// Helper to parse cookies from headers
export function parseCookies(cookieHeader: string | null): Record<string, string> {
  const cookies: Record<string, string> = {};
  if (!cookieHeader) return cookies;

  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    if (parts.length >= 2) {
      cookies[parts[0].trim()] = parts.slice(1).join('=').trim();
    }
  });
  return cookies;
}

// Helper to get CORS headers dynamically
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') || 'http://localhost:5174';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

// Helper to verify auth from a Request object
export async function getAuthenticatedUser(
  req: Request,
): Promise<{ id: string; username: string; role: Role; display_name: string } | null> {
  const cookies = parseCookies(req.headers.get('Cookie'));
  const token = cookies['meshmargin_auth'];

  if (!token) return null;

  try {
    const payload = await verifyJwt<{
      id: string;
      username: string;
      role: Role;
      display_name: string;
    }>(token);
    return payload;
  } catch {
    return null;
  }
}

/**
 * Returns a middleware function that checks if the authenticated user has one
 * of the allowed roles. Returns a 403 Forbidden response if the user's role is
 * not in the allowed list, or 401 if unauthenticated.
 */
export function requireRole(...allowed: Role[]): (req: Request) => Promise<Response | null> {
  return async (req: Request): Promise<Response | null> => {
    const corsHeaders = getCorsHeaders(req);
    const user = await getAuthenticatedUser(req);

    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!allowed.includes(user.role)) {
      const required_role = allowed[0];
      return new Response(
        JSON.stringify({
          error: 'Forbidden',
          message: `This action requires the ${required_role} role.`,
          required_role,
          current_role: user.role,
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    return null;
  };
}

export async function handleAuthRequest(req: Request, url: URL): Promise<Response | null> {
  const corsHeaders = getCorsHeaders(req);

  // Preflight CORS
  if (req.method === 'OPTIONS' && url.pathname.startsWith('/api/auth')) {
    return new Response(null, { headers: corsHeaders });
  }

  // 1. POST /api/auth/register
  if (req.method === 'POST' && url.pathname === '/api/auth/register') {
    try {
      const { username, password, display_name: rawDisplayName } = await req.json();
      if (!username || !password || password.length < 6) {
        return new Response(JSON.stringify({ error: 'Invalid username or password' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Check if user exists (checking JSONB property 'username' where type is 'user')
      const existingUser = await sql`
                SELECT id FROM entities
                WHERE type = 'user' AND properties->>'username' = ${username}
            `;

      if (existingUser.length > 0) {
        return new Response(JSON.stringify({ error: 'Username already taken' }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const id = crypto.randomUUID();
      const hash = await Bun.password.hash(password);
      const role: Role = 'sales_rep';
      const display_name: string =
        typeof rawDisplayName === 'string' && rawDisplayName.trim() !== ''
          ? rawDisplayName.trim()
          : username;

      const properties = {
        username,
        password_hash: hash,
        role,
        display_name,
      };

      await sql`
                INSERT INTO entities (id, type, properties, tenant_id)
                VALUES (${id}, 'user', ${sql.json(properties)}, null)
            `;

      const token = await signJwt({ id, username, role, display_name });

      return new Response(JSON.stringify({ user: { id, username, role, display_name } }), {
        status: 201,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Set-Cookie': `meshmargin_auth=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
        },
      });
    } catch (err) {
      console.error('REGISTER ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }

  // 2. POST /api/auth/login
  if (req.method === 'POST' && url.pathname === '/api/auth/login') {
    try {
      const { username, password } = await req.json();

      // Retrieve User Entity
      const users = await sql`
                SELECT id, properties->>'username' as username, properties->>'password_hash' as password_hash, properties->>'role' as role, properties->>'display_name' as display_name
                FROM entities
                WHERE type = 'user' AND properties->>'username' = ${username}
            `;

      if (users.length === 0) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const user = users[0];

      const isMatch = await Bun.password.verify(password, user.password_hash);
      if (!isMatch) {
        return new Response(JSON.stringify({ error: 'Invalid credentials' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const role: Role = (user.role as Role) ?? 'sales_rep';
      const display_name: string =
        typeof user.display_name === 'string' && user.display_name.trim() !== ''
          ? user.display_name.trim()
          : user.username;
      const token = await signJwt({ id: user.id, username: user.username, role, display_name });

      return new Response(
        JSON.stringify({ user: { id: user.id, username: user.username, role, display_name } }),
        {
          status: 200,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Set-Cookie': `meshmargin_auth=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`,
          },
        },
      );
    } catch (err) {
      console.error('LOGIN ERROR:', err);
      return new Response(JSON.stringify({ error: 'Internal Server Error' }), {
        status: 500,
        headers: corsHeaders,
      });
    }
  }

  // 3. GET /api/auth/me
  // Validates the session cookie and returns user profile
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ user }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // 4. POST /api/auth/logout
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': 'meshmargin_auth=; HttpOnly; Path=/; Max-Age=0',
      },
    });
  }

  return null;
}
