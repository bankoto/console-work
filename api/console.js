import { createHandler } from '../server/handler.mjs';
const handler = createHandler();
export default async function consoleApi(req, res) {
  // Vercel's file-based dynamic functions match one segment. Rewrite all Console
  // API paths here, preserving the original path for Better Auth's Node adapter.
  const url = new URL(req.url, 'https://www.bankoto.biz');
  const route = req.query?.route || url.searchParams.get('route');
  if (typeof route === 'string') {
    url.searchParams.delete('route');
    const query = url.searchParams.toString();
    req.url = `/api/console/${route}${query ? `?${query}` : ''}`;
  }
  return handler(req, res);
}
