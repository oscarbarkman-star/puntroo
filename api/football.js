// Vercel Edge Function — proxies API-Football so the key stays server-side.
// Place at: /api/football.js
// Add env var in Vercel: API_FOOTBALL_KEY = your key from api-football.com (api-sports.io)

export const config = { runtime: 'edge' };

const ALLOWED = new Set(['fixtures', 'live', 'standings']);

export default async function handler(req) {
  const key = process.env.API_FOOTBALL_KEY;
  if (!key) {
    return json({ error: 'API key not configured' }, 500);
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type') || 'live';

  if (!ALLOWED.has(type)) {
    return json({ error: 'Invalid type' }, 400);
  }

  // Build the upstream API-Football request based on type
  let apiUrl;
  const tz = 'Europe/Stockholm';

  if (type === 'live') {
    // All matches currently in play
    apiUrl = 'https://v3.football.api-sports.io/fixtures?live=all';
  } else if (type === 'fixtures') {
    // Fixtures for a given date (default today), optional league filter.
    // API-Football requires `season` whenever `league` is set.
    const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
    const league = url.searchParams.get('league'); // e.g. 1 = World Cup
    const season = url.searchParams.get('season') || date.slice(0, 4); // year from date
    apiUrl = `https://v3.football.api-sports.io/fixtures?date=${date}&timezone=${tz}`;
    if (league) apiUrl += `&league=${encodeURIComponent(league)}&season=${encodeURIComponent(season)}`;
  } else if (type === 'standings') {
    const league = url.searchParams.get('league') || '1';
    const season = url.searchParams.get('season') || new Date().getFullYear();
    apiUrl = `https://v3.football.api-sports.io/standings?league=${league}&season=${season}`;
  }

  try {
    const upstream = await fetch(apiUrl, {
      headers: { 'x-apisports-key': key },
    });
    const data = await upstream.json();
    return new Response(JSON.stringify(data), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache at the edge for 30s so we don't burn the API quota on every visitor
        'Cache-Control': 's-maxage=30, stale-while-revalidate=60',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e) {
    return json({ error: 'Upstream fetch failed' }, 502);
  }
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
