import { isIP } from 'node:net';

export interface Weather { temperature: number; code: number; isDay: boolean; time: number }

export interface ConnectionData {
  environment: 'vercel' | 'local';
  ip: string | null;
  weather: Weather | null;
  location: { city: string | null; region: string | null; country: string | null; postalCode: string | null; timezone: string | null };
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

function readConnection(headers: Headers, hosted: boolean): ConnectionData {
  const ip = hosted ? boundedHeader(headers.get('x-real-ip'), 64) : null;
  const country = hosted ? boundedHeader(headers.get('x-vercel-ip-country'), 16) : null;
  return {
    environment: hosted ? 'vercel' : 'local',
    weather: null,
    ip: ip && isIP(ip) ? ip : null,
    location: {
      city: hosted ? decodedCity(headers.get('x-vercel-ip-city')) : null,
      region: hosted ? boundedHeader(headers.get('x-vercel-ip-country-region'), 16) : null,
      country: country && /^[A-Z]{2}$/.test(country) ? country : null,
      timezone: hosted ? boundedHeader(headers.get('x-vercel-ip-timezone'), 100) : null,
      postalCode: hosted ? boundedHeader(headers.get('x-vercel-ip-postal-code'), 32) : null,
    },
  };
}

const weatherCache = new Map<string, { expires: number; weather: Weather }>();

async function readWeather(headers: Headers): Promise<Weather | null> {
  const coordinate = (name: string, limit: number) => {
    const raw = headers.get(name);
    if (!raw?.trim()) return null;
    const value = Number(raw);
    return Number.isFinite(value) && Math.abs(value) <= limit ? Math.round(value * 10) / 10 : null;
  };
  const latitude = coordinate('x-vercel-ip-latitude', 90);
  const longitude = coordinate('x-vercel-ip-longitude', 180);
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
  if (hosted) data.weather = await readWeather(request.headers);
  return Response.json(data, { headers });
}
