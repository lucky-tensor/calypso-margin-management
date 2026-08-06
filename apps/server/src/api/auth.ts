import { sql } from 'db';
import type { Role } from 'core';
import { signJwt, verifyJwt } from '../auth/jwt';

/**
 * Explicit CORS origin allowlist driven by CORS_ALLOWED_ORIGINS env variable.
 * Format: comma-separated list of origins, e.g. "http://localhost:5174,https://app.example.com"
 * Falls back to localhost dev origin when the variable is not set (development only).
 *
 * Requests from origins not in the allowlist do not receive the
 * Access-Control-Allow-Origin header (issue #129 — unbounded CORS reflection fix).
 */
const CORS_ALLOWLIST: Set<string> = new Set(
  process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
    : ['http://localhost:5174', 'http://localhost:5173'],
);

/**
 * Whether to set the Secure attribute on session cookies.
 * Gated on NODE_ENV=production so integration tests running over HTTP are not broken.
 */
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

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

/**
 * Returns CORS headers for a request.
 * Only reflects the origin back when it appears in CORS_ALLOWLIST.
 * Unlisted origins receive no ACAO header.
 */
export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  if (!origin || !CORS_ALLOWLIST.has(origin)) {
    return {
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

/**
 * Builds the Set-Cookie value for a session token.
 * Adds the Secure attribute when NODE_ENV=production.
 */
function buildSessionCookie(token: string): string {
  const base = `meshmargin_auth=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=604800`;
  return IS_PRODUCTION ? `${base}; Secure` : base;
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
          'Set-Cookie': buildSessionCookie(token),
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
            'Set-Cookie': buildSessionCookie(token),
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
  // Validates the session cookie, re-fetches the role from the database, and
  // returns the current user profile. If the role stored in the DB differs
  // from the JWT payload, a fresh token is re-issued via Set-Cookie so the
  // next request carries the updated role without requiring a logout.
  if (req.method === 'GET' && url.pathname === '/api/auth/me') {
    const cookies = parseCookies(req.headers.get('Cookie'));
    if (!cookies['meshmargin_auth']) {
      // No session cookie — not an error, just no active session
      return new Response(JSON.stringify({ user: null }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwtUser = await getAuthenticatedUser(req);
    if (!jwtUser) {
      // Cookie present but token is invalid or expired
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Re-fetch role and display_name from the database so that admin role
    // changes are reflected immediately without requiring a logout.
    try {
      const rows = await sql`
        SELECT properties->>'role' as role, properties->>'display_name' as display_name
        FROM entities
        WHERE id = ${jwtUser.id} AND type = 'user'
      `;

      if (rows.length === 0) {
        // User has been deleted — treat as unauthorised
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const dbRole: Role = (rows[0].role as Role) ?? jwtUser.role;
      const dbDisplayName: string = rows[0].display_name ?? jwtUser.display_name;
      const currentUser = {
        id: jwtUser.id,
        username: jwtUser.username,
        role: dbRole,
        display_name: dbDisplayName,
      };

      const roleChanged = dbRole !== jwtUser.role || dbDisplayName !== jwtUser.display_name;
      const responseHeaders: Record<string, string> = {
        ...corsHeaders,
        'Content-Type': 'application/json',
      };

      if (roleChanged) {
        // Re-issue the session cookie with the current DB values
        const freshToken = await signJwt(currentUser);
        responseHeaders['Set-Cookie'] = buildSessionCookie(freshToken);
      }

      return new Response(JSON.stringify({ user: currentUser }), {
        status: 200,
        headers: responseHeaders,
      });
    } catch (err) {
      console.error('GET /api/auth/me DB ERROR:', err);
      // Fall back to JWT payload on DB error to avoid disrupting active sessions
      return new Response(JSON.stringify({ user: jwtUser }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  // 4. POST /api/auth/logout
  if (req.method === 'POST' && url.pathname === '/api/auth/logout') {
    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Set-Cookie': 'meshmargin_auth=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0',
      },
    });
  }

  return null;
}
