import { isIP } from 'node:net';

export interface Weather { temperature: number; code: number; isDay: boolean; time: number }

export interface ConnectionData {
  environment: 'vercel' | 'local';
  ip: string | null;
  userAgent: string | null;
  network: { isp: string | null; asn: number | null; organization: string | null; source: 'ipwho.is' } | null;
  weather: Weather | null;
  location: { city: string | null; region: string | null; regionName: string | null; country: string | null; postalCode: string | null; timezone: string | null; latitude: number | null; longitude: number | null };
}

function boundedHeader(value: string | null, maxLength = 200): string | null {
  if (!value) return null;
  const clean = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
  return clean || null;
}

function decodedCity(value: string | null) {
  if (!value) return null;
  try { return boundedHeader(decodeURIComponent(value), 120); } catch { return null; }
}

function coordinate(headers: Headers, name: string, limit: number): number | null {
  const raw = headers.get(name);
  if (!raw?.trim()) return null;
  const value = Number(raw);
  return Number.isFinite(value) && Math.abs(value) <= limit ? value : null;
}

function readConnection(headers: Headers, hosted: boolean): ConnectionData {
  const ip = hosted ? boundedHeader(headers.get('x-real-ip'), 64) : null;
  const country = hosted ? boundedHeader(headers.get('x-vercel-ip-country'), 16) : null;
  return {
    environment: hosted ? 'vercel' : 'local',
    weather: null,
    network: null,
    userAgent: boundedHeader(headers.get('user-agent'), 1024),
    ip: ip && isIP(ip) ? ip : null,
    location: {
      city: hosted ? decodedCity(headers.get('x-vercel-ip-city')) : null,
      regionName: null,
      latitude: hosted ? coordinate(headers, 'x-vercel-ip-latitude', 90) : null,
      longitude: hosted ? coordinate(headers, 'x-vercel-ip-longitude', 180) : null,
      region: hosted ? boundedHeader(headers.get('x-vercel-ip-country-region'), 16) : null,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      timezone: hosted ? boundedHeader(headers.get('x-vercel-ip-timezone'), 100) : null,
      postalCode: hosted ? boundedHeader(headers.get('x-vercel-ip-postal-code'), 32) : null,
    },
  };
}

const weatherCache = new Map<string, { expires: number; weather: Weather }>();

async function readWeather(headers: Headers): Promise<Weather | null> {
  const lat = coordinate(headers, 'x-vercel-ip-latitude', 90);
  const lon = coordinate(headers, 'x-vercel-ip-longitude', 180);
  const latitude = lat === null ? null : Math.round(lat * 10) / 10;
  const longitude = lon === null ? null : Math.round(lon * 10) / 10;
  if (latitude === null || longitude === null) return null;
  const key = `${latitude},${longitude}`;
  const cached = weatherCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.weather;
  weatherCache.delete(key);
  try {
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.search = new URLSearchParams({ latitude: String(latitude), longitude: String(longitude), current: 'temperature_2m,weather_code,is_day', timeformat: 'unixtime', forecast_days: '1' }).toString();
    const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const body = await response.text();
    if (body.length > 16000) return null;
    const current = JSON.parse(body)?.current;
    if (!current || ![current.temperature_2m, current.weather_code, current.time].every(Number.isFinite) || Math.abs(current.temperature_2m) > 70 || !Number.isInteger(current.weather_code) || current.weather_code < 0 || current.weather_code > 99 || ![0, 1].includes(current.is_day) || Math.abs(Date.now() / 1000 - current.time) > 7200) return null;
    const weather: Weather = { temperature: current.temperature_2m, code: current.weather_code, isDay: current.is_day === 1, time: current.time };
    if (weatherCache.size >= 128) weatherCache.delete(weatherCache.keys().next().value!);
    weatherCache.set(key, { expires: Date.now() + 15 * 60_000, weather });
    return weather;
  } catch { return null; }
}

let networkRetryAt = 0;

async function readNetwork(data: ConnectionData): Promise<void> {
  if (!data.ip || Date.now() < networkRetryAt) return;
  try {
    const url = new URL(`https://ipwho.is/${encodeURIComponent(data.ip)}`);
    url.searchParams.set('fields', 'ip,success,country_code,region,region_code,connection.asn,connection.isp,connection.org');
    const response = await fetch(url, { signal: AbortSignal.timeout(2500), redirect: 'error', headers: { Accept: 'application/json' } });
    if (response.status === 429) {
      const retry = Number(response.headers.get('retry-after'));
      networkRetryAt = Date.now() + (Number.isFinite(retry) && retry > 0 ? Math.min(retry, 86400) : 60) * 1000;
      return;
    }
    if (!response.ok) return;
    const body = await response.text();
    if (body.length > 4096) return;
    const result = JSON.parse(body);
    // IPv6 may be serialized with a different, equivalent compression.
    const canonical = (ip: string) => isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname : ip;
    if (!result || result.success !== true || typeof result.ip !== 'string' || !isIP(result.ip) || canonical(result.ip) !== canonical(data.ip)) return;
    const text = (value: unknown) => typeof value === 'string' ? boundedHeader(value) : null;
    const network = result.connection;
    if (network && typeof network === 'object') {
      const asn = Number.isSafeInteger(network.asn) && network.asn > 0 && network.asn <= 4294967295 ? network.asn : null;
      const isp = text(network.isp);
      const organization = text(network.org);
      if (asn !== null || isp || organization) data.network = { asn, isp, organization, source: 'ipwho.is' };
    }
    // Use the region name only when both providers agree on the country and region code.
    if (data.location.country && data.location.region && result.country_code === data.location.country && typeof result.region_code === 'string' && result.region_code === data.location.region) data.location.regionName = text(result.region);
  } catch { /* Lookup failures never hide Vercel connection readings. */ }
}

export async function connectionResponse(request: Request, hosted: boolean) {
  const headers = {
    'Cache-Control': 'private, no-store, max-age=0',
    'CDN-Cache-Control': 'no-store',
    'Vercel-CDN-Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
  if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: { ...headers, Allow: 'GET' } });
  const data = readConnection(request.headers, hosted);
  if (hosted) await Promise.all([readWeather(request.headers).then(weather => { data.weather = weather; }), readNetwork(data)]);
  return Response.json(data, { headers });
}
