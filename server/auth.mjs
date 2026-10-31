import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import pg from 'pg';

let services;
export function createServices(pool, overrides = {}) {
  const auth = betterAuth({
    appName: 'Bankoto Console',
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3100',
    basePath: '/api/console/auth',
    secret: process.env.BETTER_AUTH_SECRET,
    database: pool,
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 8, updateAge: 60 * 60, cookieCache: { enabled: false } },
    advanced: { cookiePrefix: 'bankoto-console', defaultCookieAttributes: { sameSite: 'lax', httpOnly: true } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 60,
      customRules: { '/sign-in/email': { window: 300, max: 10 } } },
    plugins: [admin()],
    ...overrides,
  });
  return { pool, auth };
}
export function getServices() {
  if (!services) {
    if (!process.env.DATABASE_URL || !process.env.BETTER_AUTH_SECRET) throw new Error('Console database is not configured');
    const connection = new URL(process.env.DATABASE_URL);
    if (connection.searchParams.get('sslmode') === 'require') connection.searchParams.set('sslmode','verify-full');
    services = createServices(new pg.Pool({ connectionString: connection.toString(), max: 3, connectionTimeoutMillis: 10000 }));
  }
  return services;
}
