import { datum, segments, typingSentences } from './text.ts';
import type { Facts, ReadingKey, Sentences, StoryContext, TextPart } from './types.ts';

export interface Scene {
  lines?: string[];
  reads?: ReadingKey[];
  render?: (facts: Readonly<Partial<Facts>>, context: StoryContext) => Sentences;
  how: string;
  pending?: string;
  interaction?: 'location' | 'typing' | 'choice' | 'receipt';
  special?: 'profile' | 'memory' | 'snapshot' | 'receipt';
}
const say = (...lines: string[]): Sentences => lines.map(line => segments(line));
const privacy = 'No cookies or analytics. One visit count and first/latest dates are saved automatically in localStorage. Forget me and the red pill delete this record and stop the session. Browser readings stay in page memory. The server sends the public connection IP to IPWhois (ipwho.is) for ISP/ASN and a matching region name. That provider receives the IP. The host receives ordinary requests and may retain security logs. The narrator’s taunts do not establish identity, feelings or an external watcher.';
const connection = 'Vercel estimates location from the connection IP. VPNs, proxies and mobile networks can move it. The result is not proof of residence. Region values may be administrative codes; an IPWhois region name is used only when its country and region codes match Vercel. Latitude/longitude and postal code are approximate IP-database results, not GPS or a street address. Local previews have no connection location or ISP lookup.';
const weatherHow = `${connection} A same-origin request retrieves Open-Meteo weather with IP coordinates rounded to 0.1 degrees. The provider receives the server request and coarse coordinates, not the visitor IP or permission-granted coordinates. Modelled conditions can differ from weather at your window. Rain-specific WMO codes select the umbrella line; heat means above 33°C and clear means code 0. No indoor activity or umbrella use is observed. Weather data: Open-Meteo, CC BY 4.0.`;
const machine = 'Device and GPU labels are browser reports and may be altered. Memory is a coarse estimate. These readings do not establish ownership, purchase price or a specific laptop. Apple-silicon labels only suggest a machine from 2020 or later. Missing battery readings prove nothing. Screen count and another screen’s contents are not available; isExtended only reports more than one screen.';
const arrival = 'Only the supplied referrer hostname is used. Missing referrers do not establish a typed URL or private message. A referrer does not reveal the time spent on that site. The Navigation Timing API can identify a reload. The builder remark is a guess from a developer-hosting referrer plus repeat visits; it does not identify anyone.';
const closing = ['You didn’t lose your privacy all at once.', 'You handed it over one click at a time.', 'Hand it over slower.'];

function countryName(code: string | null): string | null {
  if (!code) return null;
  try { return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) || code; }
  catch { return code; }
}

function minutesToMidnight(timestamp: number): number {
  const now = new Date(timestamp);
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1, Math.round((next.getTime() - now.getTime()) / 60_000));
}

function weather(facts: Readonly<Partial<Facts>>): Sentences {
  const current = facts.connection?.weather;
  const city = facts.connection?.location.city;
  if (!current || !city) return [];
  const temperature = datum(Math.round(current.temperature));
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(current.code)) {
    return [segments('Near ', datum(city), '. About ', temperature, '°C, with rain reported.'), ...say('No umbrella?', 'Of course not.')];
  }
  if (current.temperature > 33) return [segments('Near ', datum(city), '. About ', temperature, '°C outside.'), ...say('You’re indoors with a fan and me.', 'Smart.')];
  if (current.code === 0) return [segments('Near ', datum(city), '. About ', temperature, '°C and clear.'), ...say('Nice sky.', 'You chose a screen.')];
  return [];
}

function memory(context: StoryContext): Sentences {
  if (context.visits === null) return say('Your browser wouldn’t save this visit.', 'Refusing to be remembered is still a pattern.');
  const lines = context.visits === 1 ? say('First visit.', 'Saved.', 'I didn’t ask.', 'Nobody ever does.')
    : context.visits === 2 ? say('Back already.', 'I expected that.')
    : [segments('Visit ', datum(context.visits), '.'), ...say('Every time, you hope for a different answer.', 'I’m the same every time.')];
  if (context.previousVisit !== null && context.startedAt - context.previousVisit >= 86_400_000 && new Date(context.startedAt).getHours() === new Date(context.previousVisit).getHours()) {
    lines.push(segments(datum(new Date(context.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), ' again, the same hour as last time.'), ...say('You’re predictable.', 'It’s the easiest thing about you.'));
  }
  return lines;
}

export function blueEnding(saved: boolean): Sentences {
  return say('Blue pill.', 'Close the tab.', saved ? 'Nothing changes, and I kept your record.' : 'Nothing changes. No record was saved.', ...closing);
}

export function redEnding(erased: boolean, pill = true): Sentences {
  if (!erased) return say('The session has stopped.', 'The saved record could not be fully erased.', 'Clear this site’s data in your browser settings.');
  if (!pill) return say('Done.', 'I forgot this page’s record.', 'Everyone else didn’t.');
  return say('Red pill.', 'Run.', 'Phone off.', 'Cash only.', 'A farm, no signal.', 'The last tower may still have your last position.', 'A drone could see the field.', 'Your face may be in a database you never joined.', ...closing);
}

export const story: Scene[] = [
  // 1. Opening
  { lines: ['“Reject all.” Cute.', 'No cookies, and I’m still here.', 'Sit.', 'This won’t take me long.'], how: privacy },

  // 2. Where you are
  { reads: ['connection'], render: facts => facts.connection?.ip ? [segments('Your connection arrived from ', datum(facts.connection.ip), '.'), ...say('That’s the number every site you visit receives.', 'You carried it in yourself.')] : [], how: 'The same-origin /api/connection Vercel Function reads Vercel’s x-real-ip request header and validates it as IPv4 or IPv6. This is the connection address seen by the host, which may belong to a VPN, proxy or shared network. It is not a device identity, private LAN address or proof of where you live. The IP itself needs no permission or WebRTC probe. The same request also sends this public IP from the server to IPWhois (ipwho.is) for ISP/ASN. The lookup provider receives the IP, but no typing, wallet or permission-granted location data. Responses are private and no-store; the app does not persist this address. Missing IP readings are omitted, including in local previews.', pending: 'Give me a second.' },
  { reads: ['connection', 'clock'], render: weather, how: weatherHow, pending: 'Give me a second.' },
  { render: facts => {
    const location = facts.connection?.location;
    const place = location ? [location.city, location.regionName || location.region, countryName(location.country)].filter(Boolean).join(', ') : '';
    if (place) return [segments('Your connection points to ', datum(place), '.'), ...say('Still think I’m bluffing?')];
    return facts.clock ? [segments('Your connection gave me nothing this time. Your clock still says ', datum(facts.clock.timezone), '.'), ...say('That narrows the map already.')] : [];
  }, how: connection },
  { render: facts => {
    const location = facts.connection?.location;
    if (!location) return [];
    const lines: Sentences = [];
    if (location.postalCode) lines.push(segments('The lookup puts you around postal code ', datum(location.postalCode), '.'));
    if (location.latitude !== null && location.longitude !== null) lines.push(segments('Its map estimate is ', datum(location.latitude.toFixed(2)), ', ', datum(location.longitude.toFixed(2)), '.'), ...say('An area, not your front door.', 'Close enough to send you an ad.'));
    if (location.timezone) lines.push(segments('That address maps to ', datum(location.timezone), '.'));
    return lines;
  }, how: `${connection} Coordinate text is rounded to two decimals for display; that does not imply kilometre-level accuracy. IP-inferred timezone is separate from the browser’s clock setting.` },
  { render: facts => {
    const network = facts.connection?.network;
    if (!network) return [];
    const lines: Sentences = [];
    if (network.isp) lines.push(segments(datum(network.isp), ' carries you.'), ...say('You didn’t introduce them.', 'They introduced you.'));
    else if (network.organization) lines.push(segments('Your network is registered to ', datum(network.organization), '.'));
    if (network.asn !== null) lines.push(segments('Its number is ', datum(`AS${network.asn}`), '.'));
    return lines;
  }, how: 'The Vercel Function sends only its validated connection IP to IPWhois (https://ipwhois.io/documentation), over HTTPS at ipwho.is. ISP and ASN are database mappings, not proof of a personal subscription; VPNs, hosts and upstream operators may appear. ASN identifies a routing network, not a person. The lookup has a 2.5-second deadline; errors, invalid results and quota limits leave these fields unavailable. The provider receives the IP and may keep records under its own policies. This app does not cache or persist the IP/network lookup.' },
  { render: facts => {
    const zone = facts.connection?.location.timezone;
    const clock = facts.clock;
    if (!zone || !clock) return [];
    try {
      const offset = (timeZone: string) => new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(clock.timestamp)).find(part => part.type === 'timeZoneName')?.value;
      if (offset(zone) === offset(clock.timezone)) return [];
      return [segments('Your address says ', datum(zone), '. Your clock says ', datum(clock.timezone), '.'), ...say('Pick one.', 'I have both.')];
    } catch { return []; }
  }, how: 'Different UTC offsets at the same instant are compared. Equal-offset timezone aliases are not mismatches. A difference does not prove a VPN, deception or a country mismatch; timezones do not uniquely identify countries.' },

  // 3. How you got here and your history
  { reads: ['referrer'], render: (facts, context) => {
    const referrer = facts.referrer;
    if (!referrer) return say('No link brought you.', 'You typed it in, or someone sent it privately.', 'Both are ways of being careful.');
    if (/(^|\.)(vercel\.com|github\.com)$|^localhost$/.test(referrer) && (context.visits ?? 0) >= 3) {
      return [segments('You came from ', datum(referrer), '.'), ...say('That’s where this page lives.', 'You’re either the one who built me, or someone checking the builder’s work.'), segments('Visit ', datum(context.visits!), ', so my money is on the builder.')];
    }
    return [segments('You came from ', datum(referrer), '.'), ...say('I know where you were a second ago.')];
  }, how: arrival },
  { reads: ['navigation'], render: facts => facts.navigation === 'reload' ? say('You refreshed.', 'Same page.', 'Same me.') : [], how: arrival },
  { special: 'memory', render: (_, context) => memory(context), how: `${privacy} Counts describe this browser’s saved record, not a person or machine identity. Same-hour comparisons require at least a day between visits and do not establish a routine. Clearing storage starts fresh.` },

  // 4. Your machine
  { reads: ['reported'], render: facts => {
    const agent = facts.connection?.userAgent || facts.reported?.userAgent;
    if (!agent) return [];
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : null;
    const system = /Macintosh/.test(agent) ? 'a Mac' : /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'an iPhone or iPad' : /Linux/.test(agent) ? 'Linux' : null;
    if (!browser || !system) return [];
    return [segments(datum(browser), ' on ', datum(system), '.'), ...say('Your browser introduced itself.', 'I didn’t have to ask twice.')];
  }, how: 'The request User-Agent is read from the request header by the Vercel Function, with navigator.userAgent as a browser-side fallback. Only the browser family and operating-system family are shown. It can be reduced, altered or spoofed and does not guarantee exact browser or OS versions. No User-Agent is forwarded to the ISP or weather provider.' },
  { reads: ['device', 'gpu', 'reported'], render: facts => {
    const lines: Sentences = [];
    if (facts.device && facts.device.kind !== 'unknown') lines.push(segments('Looks like ', datum(facts.device.label), '.'));
    if (facts.gpu) {
      lines.push(segments('Reporting ', datum(facts.gpu), ' graphics.'));
      if (/Apple M\d/i.test(facts.gpu)) lines.push(...say('Apple silicon means a recent machine.', 'Someone who buys what they want, when they want it.'));
    }
    if (facts.reported?.memoryGB) lines.push(segments('About ', datum(facts.reported.memoryGB), ' GB of memory.'));
    if (lines.length) lines.push(...say('I found all of that without asking.'));
    return lines;
  }, how: machine },
  { reads: ['window'], render: facts => {
    const window = facts.window;
    const lines: Sentences = [];
    if (window?.widthPercent !== null && window?.widthPercent !== undefined) lines.push(segments('Your window uses about ', datum(window.widthPercent), '% of the screen.'), ...say('Something else is open next to me.', 'Keep your secrets.'));
    if (window?.extended) lines.push(...say('More than one screen.', 'I’m on one.', 'The real work is on the other.'));
    return lines;
  }, how: `${machine} Outer window width is compared with available screen width on computer-like devices. A small window does not reveal another application.` },
  { reads: ['battery'], render: facts => {
    const battery = facts.battery;
    if (!battery || battery.charging || battery.level >= 60) return [];
    if (battery.level < 20) return [segments(datum(battery.level), '%.'), ...say('Plug it in.', 'Or don’t.', 'I stay either way.')];
    return [segments(datum(battery.level), '% left and no cord.'), ...say('You’ll let it fall to twenty before you care.', 'People always do.')];
  }, how: 'Battery percentage is reported where supported. These lines require a reported non-charging battery below 60%; below 20% takes priority. Charging state does not establish cable position or future behavior.' },
  { reads: ['network'], render: facts => facts.network?.downlink ? [segments('Your line crawls at about ', datum(facts.network.downlink), ' Mb/s.'), ...say('Not a quiet home line.', 'Somewhere you’re borrowing.')] : [], how: 'Only a finite downlink estimate below 1.5 Mb/s is used. A slow connection does not identify home, public Wi-Fi or a borrowed hotspot.' },

  // 5. The clock and your settings
  { reads: ['languages', 'dark', 'preferences', 'clock'], render: facts => {
    const lines: Sentences = [];
    const language = facts.languages?.names[0];
    const clock = facts.clock;
    if (clock) {
      lines.push(segments('It’s ', datum(clock.time), ' on a ', datum(clock.weekday), '.'));
      if (clock.weekday === 'Sunday') lines.push(segments('Monday starts in about ', datum(minutesToMidnight(clock.timestamp)), ' minutes, and you’re here reading about surveillance.'), ...say('That’s calm, or avoidance.', 'They look the same from here.'));
      else lines.push(...say('And you’re reading about surveillance.', 'Bold.'));
    }
    if (language && clock && /American/.test(language) && !clock.timezone.startsWith('America/')) {
      lines.push(segments('An ', datum(language), ' setting on a ', datum(clock.timezone), ' clock.'), ...say('Imported habits.', 'Or a laptop bought somewhere else.'));
    }
    if (facts.dark && facts.connection?.weather?.isDay === false) lines.push(...say('Dark mode after dark.', 'You don’t sleep early.'));
    const preferences = facts.preferences;
    const visible = [preferences?.reducedMotion ? 'reduced motion' : '', preferences?.highContrast ? 'higher contrast' : ''].filter(Boolean);
    if (visible.length) lines.push(segments('You set ', datum(visible.join(' and ')), '.'), ...say('You didn’t mention that.', 'I noticed.'));
    return lines;
  }, how: 'Language, timezone, local time and media-query preferences are exposed by the browser. Preferences do not establish spoken language, nationality, profession, eyesight or health. The imported-habits remark is a guess from a US-English setting on a non-American clock. Night uses weather-model day/night at the approximate IP location. Sleep and activity are unknown. Inspector-open and language/timezone life-story claims are omitted because they cannot be reliably established.' },

  // 6. Wallets and filters
  { reads: ['wallets'], render: facts => facts.wallets?.length ? [segments(datum(facts.wallets.join(', ')), '.'), ...say(facts.wallets.length > 1 ? 'More than one wallet.' : 'A wallet.', 'It announced itself the second I asked.', 'An advertiser files that under crypto users.', 'A scammer files it under reachable.', 'You’re on both lists now.')] : [], how: 'A bounded EIP-6963 event reads up to five untrusted wallet-software names. It does not request accounts, balances or addresses, prove ownership of money, or add anyone to a list. The software name tells nothing about where your money sits. There is no reliable installed-extension count, and no announcements do not mean no extensions.' },
  { reads: ['adFilter'], render: facts => facts.adFilter ? say('Something blocked my fake ad.', 'Probably a filter.', 'I noticed.', 'Other sites can check too.') : [], how: 'A temporary ad-named element is compared with a neutral control. Hiding suggests a filter or another page modification; no ad request is made. This does not identify an extension. A negative check establishes nothing.' },

  // 7. How you click
  { render: (_, { behavior }) => {
    const lines: Sentences = [];
    if (behavior.advances) lines.push(segments(datum(behavior.advances), behavior.advances === 1 ? ' press to hurry me along.' : ' presses to hurry me along.'), ...say('Impatient.', 'That one’s easy to predict.'));
    if (behavior.meanHoverMs !== null) lines.push(segments('You waited about ', datum(behavior.meanHoverMs), ' ms over a control before pressing.'), ...(behavior.meanHoverMs < 250 ? say('Quick hands.', 'Faster than your doubts.') : say('Not fast, not slow.', 'Predictable.')));
    if (behavior.pointer === 'mouse/trackpad') lines.push(...say('Mouse or trackpad.', 'Your browser reports them the same way.'));
    return lines;
  }, how: 'Measurements describe this page only. Hover measures pointer entry to pointer press on controls, excluding touch/keyboard and intervals over one minute; at most 100 samples are aggregated. Duration does not establish hesitation or decision style. Pointer events do not reliably distinguish mouse and trackpad. Hidden-page events interrupt on return and do not reveal the destination or reason.' },

  // 8. Camera and microphone: dialogue only, capture stays disabled.
  { lines: ['Looking for the camera light?', 'It stayed off.', 'I haven’t touched your lens or your microphone.', 'I didn’t need them.', 'Your search, your click and your place can be enough.', 'That’s how an ad can follow a chat.', 'The mute button hides your voice, not your habits.'], how: 'Camera and microphone are disabled by this site’s Permissions-Policy. No stream, preview, recording or permission request is made. The narrator cannot see camera indicators, faces or another app’s mute state. Advertising examples describe possible mechanisms; this page cannot determine why any particular ad appeared.' },

  // 9. Location
  { lines: ['Want me more precise?', 'Your browser needs permission.'], interaction: 'location', how: 'This passage automatically calls geolocation once after the explanation; browser authorization is required. No separate Allow button is used. Accuracy is an estimate, not a guarantee or street address. A denied request is not bypassed. The browser may use an external location provider. Coordinates are transient; the review retains only the outcome. A 15-second deadline prevents a stalled story, and late callbacks are ignored.' },

  // 10. Typing
  { lines: ['Type: I am being watched.', 'I want your rhythm, not the words.'], interaction: 'typing', how: 'Only this exercise is measured. Enter or Read my typing submits after 12 characters; Skip this discards the attempt. Speed uses five-character words from first to last edit, excluding paused/hidden time and the submit delay. Assisted input suppresses timing. A pre-watched gap requires an ordinary completed exact-prefix keyboard attempt. Neither timing nor corrections identify a mental state.' },
  { render: (_, context) => typingSentences(context.tasks.typing), how: 'Results come only from this attempt. No speed or pause is invented for missing or assisted input. Timing describes the measured keys, not a thought, personality or stable identity.' },

  // 11. The narrowing
  { special: 'profile', reads: ['campaign', 'redirects'], render: (facts, context) => {
    const steps: TextPart[][] = [];
    if (facts.clock) steps.push(segments('Your clock, ', datum(facts.clock.timezone), ', cuts it to one region.'));
    if (facts.device && facts.device.kind !== 'unknown') steps.push(segments(datum(facts.device.label), ' cuts it again.'));
    if (facts.wallets?.length) steps.push(segments(datum(facts.wallets.join(', ')), ' cuts it again.'));
    if (facts.languages?.names[0]) steps.push(segments(datum(facts.languages.names[0]), ' on that clock narrows it more.'));
    if (context.visits !== null && context.visits > 1) steps.push(segments('Visit ', datum(context.visits), ' from the same browser.'));
    if (context.tasks.typing?.wpm !== undefined) steps.push(segments('Typing at about ', datum(context.tasks.typing.wpm), ' words a minute goes in too.'));
    const lines: Sentences = steps.length ? [...say('Let’s count what you gave me.', 'Start with everyone.'), ...steps] : [];
    return [...lines, ...say('I never asked your name.', 'I didn’t need it.', 'Add a few guesses and a buyer has a profile.', 'A wrong guess still sells.', 'This one stays in this page.', 'Other sites may send theirs on.')];
  }, how: 'The narrowing illustrates how separate readings combine; no population counts or rarity numbers are computed. The paragraph combines observed reports with qualified estimates. It does not establish residence, device ownership, wake time, spoken language, habitual visit intervals or wealth. The expandable JSON is a local educational example, not an auction or broker profile. The profile and browser behavior are not uploaded. The server sends the connection IP to IPWhois for ISP/ASN; ordinary page requests and the coarse weather lookup still occur. Standard OpenRTB device fields include IP, user-agent, screen and language, but this JSON is not a complete OpenRTB request.' },

  // 12. Private window
  { lines: ['Private window?', 'It makes you forget.', 'It doesn’t make me.'], how: 'Private-window status is unknown. Private modes isolate sessions, clear session data and may add tracking protections; downloads and bookmarks may remain. They do not guarantee an identical fingerprint or hide the connection IP. During a visit many of the readings above remain visible. No private-mode detection runs.' },

  // 13. Code
  { special: 'snapshot', how: 'A local SHA-256 snapshot combines completed platform, graphics, timezone, language and typing reports. Only its first six hexadecimal characters are shown. It excludes IP, weather, coordinates, history and entered text. It is not a stable identity, unique match or rarity estimate. It is never saved or uploaded.' },

  // 14. Exit
  { lines: ['I can erase this page’s record.', 'Go ahead.', 'Your device won’t forget.', 'The next site reads the same details.'], interaction: 'choice', how: `${privacy} Forget me and the red pill remove the record and clear this session. Blue keeps the record and opens the review. Clearing this record prevents this site from using it for a later return greeting; no recovery is attempted. The farm, tower, drone and database lines are hypothetical examples, not findings about this visitor.` },
  { special: 'receipt', render: (_, context) => blueEnding(context.visits !== null), interaction: 'receipt', how: privacy },
];