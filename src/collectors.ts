import type { ConnectionData } from '../server/connection.ts';
import type { DeviceInfo, Facts, ReadingKey, ReportedNavigator } from './types.ts';

const clean = (value: unknown, limit = 200): string => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, limit) : '';

function bounded<T>(operation: (signal: AbortSignal) => Promise<T>, signal: AbortSignal, milliseconds = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const controller = new AbortController();
    const abort = () => controller.abort();
    const timer = setTimeout(abort, milliseconds);
    const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
    controller.signal.addEventListener('abort', () => { cleanup(); reject(new DOMException('Reading stopped', 'AbortError')); }, { once: true });
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) { abort(); return; }
    Promise.resolve().then(() => operation(controller.signal)).then(value => {
      if (!controller.signal.aborted) { cleanup(); resolve(value); }
    }, error => { cleanup(); reject(error); });
  });
}

function readDevice(): DeviceInfo {
  const nav = navigator as ReportedNavigator;
  const ua = nav.userAgent;
  const platform = clean(nav.userAgentData?.platform || (/Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS / iPadOS' : /Windows/i.test(ua) ? 'Windows' : /Macintosh/i.test(ua) ? 'macOS' : /Linux/i.test(ua) ? 'Linux' : ''));
  if (/iPhone|iPod/i.test(ua)) return { kind: 'phone', platform, label: 'an iPhone' };
  if (/iPad/i.test(ua) || (/Macintosh/i.test(ua) && nav.maxTouchPoints > 1)) return { kind: 'tablet', platform: 'iPadOS-compatible', label: 'an iPad' };
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? { kind: 'phone', platform, label: 'an Android phone' } : { kind: 'tablet', platform, label: 'an Android tablet' };
  if (nav.userAgentData?.mobile) return { kind: 'mobile', platform, label: 'a mobile device' };
  if (platform) return { kind: 'computer', platform, label: platform === 'macOS' ? 'a Mac' : `a ${platform} machine` };
  return { kind: 'unknown', platform: '', label: 'this device' };
}

async function adFilter(signal: AbortSignal): Promise<boolean | undefined> {
  if (signal.aborted || document.hidden) return;
  const holder = document.createElement('div');
  holder.className = 'filter-probe';
  holder.setAttribute('aria-hidden', 'true');
  holder.inert = true;
  const neutral = document.createElement('div');
  const bait = document.createElement('div');
  neutral.className = 'filter-sample';
  bait.className = 'filter-sample ad-banner adsbox adsbygoogle';
  holder.append(neutral, bait);
  document.body.append(holder);
  try {
    await bounded(childSignal => new Promise<void>((resolve, reject) => {
      const timer = setTimeout(done, 120);
      function done() { childSignal.removeEventListener('abort', abort); resolve(); }
      function abort() { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); }
      childSignal.addEventListener('abort', abort, { once: true });
      if (childSignal.aborted) abort();
    }), signal, 500);
    if (signal.aborted || document.hidden) return;
    const hidden = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || style.opacity === '0' || element.getBoundingClientRect().height === 0;
    };
    return !hidden(neutral) && hidden(bait);
  } finally { holder.remove(); }
}

export function createObservations(signal: AbortSignal, historyRestored: boolean) {
  const cache = new Map<ReadingKey, Promise<void>>();
  const facts: Partial<Facts> = {};

  async function collect(key: ReadingKey): Promise<Partial<Facts>> {
    const nav = navigator as ReportedNavigator;
    switch (key) {
      case 'reported': return { reported: {
        userAgent: clean(nav.userAgent, 512), platform: clean(nav.userAgentData?.platform || nav.platform),
        ...(Number.isInteger(nav.hardwareConcurrency) && nav.hardwareConcurrency > 0 ? { cores: nav.hardwareConcurrency } : {}),
        ...(Number.isFinite(nav.deviceMemory) && nav.deviceMemory! > 0 ? { memoryGB: nav.deviceMemory } : {}),
        screen: { width: screen.width, height: screen.height, pixelRatio: window.devicePixelRatio },
        touchPoints: nav.maxTouchPoints, doNotTrack: nav.doNotTrack ?? null,
        globalPrivacyControl: typeof nav.globalPrivacyControl === 'boolean' ? nav.globalPrivacyControl : null,
      } };
      case 'connection': return { connection: await collectConnection(signal) };
      case 'device': return { device: readDevice() };
      case 'gpu': {
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 16;
        const gl = canvas.getContext('webgl', { failIfMajorPerformanceCaveat: true, antialias: false });
        if (!gl) return {};
        try {
          const info = gl.getExtension('WEBGL_debug_renderer_info');
          const renderer = clean(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER), 300);
          const label = renderer.match(/Apple M\d+(?: Pro| Max| Ultra)?/i)?.[0] || renderer.match(/(?:NVIDIA GeForce|GeForce|AMD Radeon|Radeon|Intel(?:\(R\))? (?:Iris|UHD|HD))[^,()]{0,45}/i)?.[0]?.trim();
          return label ? { gpu: label } : {};
        } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); canvas.width = canvas.height = 0; }
      }
      case 'battery': {
        if (!nav.getBattery) return {};
        const value = await bounded(() => nav.getBattery!(), signal);
        if (!Number.isFinite(value.level) || value.level < 0 || value.level > 1 || typeof value.charging !== 'boolean') return {};
        // Fully charged/charging can be the API's fallback when no battery is known.
        return value.level === 1 && value.charging ? {} : { battery: { level: Math.round(value.level * 100), charging: value.charging } };
      }
      case 'clock': {
        const now = new Date();
        return { clock: { timestamp: now.getTime(), hour: now.getHours(), day: now.getDay(), time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), weekday: now.toLocaleDateString('en', { weekday: 'long' }), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone } };
      }
      case 'languages': {
        const names = new Intl.DisplayNames(['en'], { type: 'language' });
        const tags = nav.languages.slice(0, 8).map(value => clean(value, 40)).filter(Boolean);
        return { languages: { tags, names: tags.map(tag => { try { return names.of(tag) || tag; } catch { return tag; } }) } };
      }
      case 'window': {
        const width = screen.availWidth;
        const ratio = width > 0 ? window.outerWidth / width : 0;
        return { window: { widthPercent: readDevice().kind === 'computer' && Number.isFinite(ratio) && ratio >= .1 && ratio <= .65 ? Math.round(ratio * 100) : null, extended: (screen as Screen & { isExtended?: boolean }).isExtended === true } };
      }
      case 'network': {
        const type = nav.connection?.type;
        const speed = nav.connection?.downlink;
        return { network: { type: type === 'wifi' || type === 'cellular' || type === 'ethernet' ? type : null, downlink: typeof speed === 'number' && Number.isFinite(speed) && speed > 0 && speed < 1.5 ? speed : null } };
      }
      case 'preferences': return { preferences: { reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, highContrast: matchMedia('(prefers-contrast: more)').matches || matchMedia('(forced-colors: active)').matches } };
      case 'dark': return { dark: matchMedia('(prefers-color-scheme: dark)').matches };
      case 'adFilter': {
        const filtered = await adFilter(signal);
        return filtered === undefined ? {} : { adFilter: filtered };
      }
      case 'wallets': {
        const names = await bounded(childSignal => new Promise<string[]>(resolve => {
          const found = new Set<string>();
          const announce = (event: Event) => {
            try {
              const name = clean((event as CustomEvent).detail?.info?.name, 60);
              if (name && found.size < 5) found.add(name);
            } catch { /* Page announcements are untrusted. */ }
          };
          const finish = () => { clearTimeout(timer); window.removeEventListener('eip6963:announceProvider', announce); childSignal.removeEventListener('abort', finish); resolve([...found]); };
          const timer = setTimeout(finish, 400);
          window.addEventListener('eip6963:announceProvider', announce);
          childSignal.addEventListener('abort', finish, { once: true });
          if (childSignal.aborted) finish(); else window.dispatchEvent(new Event('eip6963:requestProvider'));
        }), signal);
        return { wallets: names };
      }
      case 'referrer': return { referrer: document.referrer ? new URL(document.referrer).hostname : null };
      case 'navigation': {
        const type = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type;
        return historyRestored || type === 'back_forward' ? { navigation: 'history' } : type === 'reload' ? { navigation: 'reload' } : {};
      }
      case 'campaign': return { campaign: [...new URLSearchParams(location.search)].filter(([key, value]) => /^utm_[a-z0-9_]{1,40}$/i.test(key) && value.trim()).slice(0, 4).map(([key, value]) => ({ name: key, value: clean(value, 80) })) };
      case 'redirects': {
        const count = (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.redirectCount;
        return count && Number.isSafeInteger(count) && count > 0 ? { redirects: count } : {};
      }
    }
  }

  return {
    async read(keys: readonly ReadingKey[]): Promise<Readonly<Partial<Facts>>> {
      if (signal.aborted) return {};
      await Promise.all(keys.map(key => {
        if (!cache.has(key)) cache.set(key, collect(key).then(value => { if (!signal.aborted) Object.assign(facts, value); }).catch(() => {}));
        return cache.get(key)!;
      }));
      return { ...facts };
    },
    fingerprint: () => ({ platform: facts.device?.platform, gpu: facts.gpu, timezone: facts.clock?.timezone, languages: facts.languages?.tags }),
    clear() { cache.clear(); for (const key of Object.keys(facts) as ReadingKey[]) delete facts[key]; },
  };
}

export async function collectConnection(signal: AbortSignal): Promise<ConnectionData> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal.aborted) controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  const timeout = setTimeout(abort, 10000);
  try {
    const response = await fetch('/api/connection', { signal: controller.signal, credentials: 'omit', cache: 'no-store' });
    if (!response.ok) throw new Error('Connection unavailable');
    const body = await response.text();
    if (body.length > 4096) throw new Error('Connection response too large');
    const data: unknown = JSON.parse(body);
    if (!data || typeof data !== 'object') throw new Error('Invalid connection response');
    const value = data as Record<string, unknown>;
    if (value.environment !== 'local' && value.environment !== 'vercel') throw new Error('Invalid environment');
    if (!value.location || typeof value.location !== 'object') throw new Error('Invalid location');
    const location = value.location as Record<string, unknown>;
    const nullable = (input: unknown) => input === null || (typeof input === 'string' && input.length <= 200 && !/[\u0000-\u001f\u007f]/.test(input));
    if (!nullable(value.ip) || !['city', 'region', 'country', 'postalCode', 'timezone'].every(key => nullable(location[key]))) throw new Error('Invalid connection readings');
    const safeText = (input: unknown, limit = 200): string | null => typeof input === 'string' && input.length <= limit && !/[\u0000-\u001f\u007f]/.test(input) ? input : null;
    const coordinate = (input: unknown, limit: number): number | null => typeof input === 'number' && Number.isFinite(input) && Math.abs(input) <= limit ? input : null;
    let network: ConnectionData['network'] = null;
    if (value.network && typeof value.network === 'object') {
      const n = value.network as Record<string, unknown>;
      if (n.source === 'ipwho.is') {
        const asn = typeof n.asn === 'number' && Number.isSafeInteger(n.asn) && n.asn > 0 && n.asn <= 4294967295 ? n.asn : null;
        const isp = safeText(n.isp);
        const organization = safeText(n.organization);
        if (asn !== null || isp || organization) network = { asn, isp, organization, source: 'ipwho.is' };
      }
    }
    let weather: ConnectionData['weather'] = null;
    if (value.weather && typeof value.weather === 'object') {
      const w = value.weather as Record<string, unknown>;
      if (typeof w.temperature === 'number' && Number.isFinite(w.temperature) && Math.abs(w.temperature) <= 70 && typeof w.code === 'number' && Number.isInteger(w.code) && w.code >= 0 && w.code <= 99 && typeof w.isDay === 'boolean' && typeof w.time === 'number' && Math.abs(Date.now() / 1000 - w.time) <= 7200) weather = { temperature: w.temperature, code: w.code, isDay: w.isDay, time: w.time };
    }
    return {
      weather,
      network,
      userAgent: safeText(value.userAgent, 1024),
      environment: value.environment,
      ip: value.ip as string | null,
      location: {
        source: location.source === 'vercel' || location.source === 'ipwho.is' ? location.source : null,
        city: location.city as string | null, region: location.region as string | null,
        regionName: safeText(location.regionName),
        latitude: coordinate(location.latitude, 90), longitude: coordinate(location.longitude, 180),
        timezone: location.timezone as string | null, country: location.country as string | null, postalCode: location.postalCode as string | null,
      },
    };
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}

