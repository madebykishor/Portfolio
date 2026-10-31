import { getPortfolio } from '../lib/behance.mjs';

export default async function handler(request, response) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.setHeader('Allow', 'GET, HEAD');
    response.statusCode = 405;
    return response.end(JSON.stringify({ error:'Read-only endpoint.' }));
  }
  // No query-supplied URLs, usernames, tokens, or cache-bypass parameters.
  try {
    const data = await getPortfolio();
    const ok = data.status !== 'unavailable';
    response.statusCode = ok ? 200 : 503;
    response.setHeader('Cache-Control', ok ? 'public, max-age=0, s-maxage=900, stale-while-revalidate=60' : 'public, max-age=0, s-maxage=60');
    if (!ok) response.setHeader('Retry-After', '180');
    return response.end(request.method === 'HEAD' ? '' : JSON.stringify(data));
  } catch (error) {
    response.statusCode = 503;
    response.setHeader('Cache-Control', 'no-store');
    return response.end(JSON.stringify({ status:'unavailable', error:'The sync service is unavailable. The saved portfolio remains visible.' }));
  }
}
