import { datum, segments, typingSentences } from './text.ts';
import type { Facts, ReadingKey, Sentences, StoryContext, TextPart } from './types.ts';

export interface Scene {
  lines?: string[];
  reads?: ReadingKey[];
  render?: (facts: Readonly<Partial<Facts>>, context: StoryContext) => Sentences;
  how: string;
  pending?: string;
  interaction?: 'typing' | 'choice' | 'receipt';
  special?: 'profile' | 'memory' | 'snapshot' | 'receipt';
}
const say = (...lines: string[]): Sentences => lines.map(line => segments(line));
const privacy = 'No cookies or analytics. One visit count and first/latest dates are saved automatically in localStorage. Forget me and the red pill delete this record and stop the session. Browser readings stay in page memory. The server sends the public connection IP to IPWhois (ipwho.is) for ISP/ASN and a fallback approximate location. That provider receives the IP. The host receives ordinary requests and may retain security logs. The narrator’s taunts do not establish identity, feelings or an external watcher.';
const connection = 'Vercel estimates location from the connection IP. If its city is missing, the server requests a location estimate for that same IP from IPWhois; the JSON identifies which source was used. VPNs, proxies and mobile networks can move it. The result is not proof of residence. Region values may be administrative codes; when supplementing a Vercel estimate, an IPWhois region name is used only if both country and region codes match. A fallback uses the provider’s location as one complete estimate, without mixing conflicting databases. Latitude/longitude and postal code are approximate IP-database results, not GPS or a street address. Local previews have no connection location or ISP lookup.';
const weatherHow = `${connection} A same-origin request retrieves Open-Meteo weather with IP coordinates rounded to 0.1 degrees. The provider receives the server request and coarse coordinates, not the visitor IP or permission-granted coordinates. Modelled conditions can differ from weather at your window. Rain-specific WMO codes select the umbrella line; heat means above 33°C and clear means code 0. No indoor activity or umbrella use is observed. Weather data: Open-Meteo, CC BY 4.0.`;
const machine = 'Device and GPU labels are browser reports and may be altered. Memory is a coarse estimate. These readings do not establish ownership, purchase price or a specific laptop. Apple-silicon labels only suggest a machine from 2020 or later. Missing battery readings prove nothing. Screen count and another screen’s contents are not available; isExtended only reports more than one screen.';
const arrival = 'Only the supplied referrer hostname is used. Missing referrers do not establish a typed URL or private message. A referrer does not reveal the time spent on that site. The Navigation Timing API can identify a reload. The builder remark is a guess from a developer-hosting referrer plus repeat visits; it does not identify anyone.';
const closing = ['Privacy was never taken from you.', 'You gave it away, one choice at a time.', 'Choose more slowly.'];

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
    return [segments('It is raining in ', datum(city), '. ', temperature, '°C.'), ...say('Did you take an umbrella?', 'No. That was predictable.')];
  }
  if (current.temperature > 33) return [segments('It is ', temperature, '°C in ', datum(city), '.'), ...say('You are indoors, with a fan.', 'A sound decision.')];
  if (current.code === 0) return [segments('The sky over ', datum(city), ' is clear. ', temperature, '°C.'), ...say('You chose a screen.', 'Interesting.')];
  return [];
}

function memory(context: StoryContext): Sentences {
  if (context.visits === null) return say('Your browser refused to record this visit.', 'Refusal is also a pattern.');
  const lines = context.visits === 1 ? say('This is your first visit.', 'It is recorded.', 'You were not asked.', 'No one is.')
    : context.visits === 2 ? say('You returned.', 'I anticipated it.')
    : [segments('Visit ', datum(context.visits), '.'), ...say('Each time, you hope the answer will change.', 'It does not.')];
  if (context.previousVisit !== null && context.startedAt - context.previousVisit >= 86_400_000 && new Date(context.startedAt).getHours() === new Date(context.previousVisit).getHours()) {
    lines.push(segments(datum(new Date(context.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), ' again, the same hour as last time.'), ...say('You are consistent.', 'Consistency is how you are predicted.'));
  }
  return lines;
}

export function blueEnding(saved: boolean): Sentences {
  return say('The blue pill.', 'Close the tab.', saved ? 'Nothing changes, and your record remains.' : 'Nothing changes. No record was kept.', ...closing);
}

export function redEnding(erased: boolean, pill = true): Sentences {
  if (!erased) return say('The session has stopped.', 'The saved record could not be fully erased.', 'Clear this site’s data in your browser settings.');
  if (!pill) return say('Done.', 'This page has forgotten you.', 'Every other site has not.');
  return say('The red pill.', 'Run.', 'Phone off.', 'Cash only.', 'A farm, with no signal.', 'The last tower may still hold your last position.', 'A drone could still see the field.', 'Your face may already be in a database you never joined.', ...closing);
}

export const story: Scene[] = [
  // 1. Opening
  { lines: ['Hello.', 'You declined every cookie. A reasonable precaution.', 'It was also unnecessary.', 'Please. Sit.'], how: privacy },

  // 2. Where you are
  { reads: ['connection'], render: facts => facts.connection?.ip ? [segments('Your public IP is ', datum(facts.connection.ip), '.'), ...say('I received it with your connection.', 'You did not need to introduce yourself.')] : [], how: 'The same-origin /api/connection Vercel Function reads Vercel’s x-real-ip request header, with its forwarded-IP headers as fallbacks, and validates it as IPv4 or IPv6. This is the connection address seen by the host, which may belong to a VPN, proxy or shared network. It is not a device identity, private LAN address or proof of where you live. The IP itself needs no permission or WebRTC probe. The same request also sends this public IP from the server to IPWhois (ipwho.is) for ISP/ASN and a fallback location estimate. The lookup provider receives the IP, but no typing, wallet or permission-granted location data. Responses are private and no-store; the app does not persist this address. The address is displayed in the story and retained only in page memory. Missing IP readings are omitted, including in local previews.', pending: 'One moment.' },
  { reads: ['connection', 'clock'], render: weather, how: weatherHow, pending: 'One moment.' },
  { render: facts => {
    const location = facts.connection?.location;
    const place = location ? [location.city, location.regionName || location.region, countryName(location.country)].filter(Boolean).join(', ') : '';
    if (place) return [segments('Your connection points near ', datum(place), '.'), ...say('You thought I was bluffing.', 'That is the proof.')];
    return facts.clock ? [segments('No location estimate arrived. Your clock says ', datum(facts.clock.timezone), '.'), ...say('That is sufficient to narrow the world.')] : [];
  }, how: connection },
  { render: facts => {
    const postal = facts.connection?.location?.postalCode;
    if (!postal) return [];
    return [segments('Your postal area is ', datum(postal), '.'), ...say('An area, not a door.', 'Sufficient for an advertisement.')];
  }, how: `${connection} Only the postal code is shown. Coordinates and the IP-inferred timezone are used elsewhere only for weather and the mismatch check, and are not displayed.` },
  { render: facts => {
    const network = facts.connection?.network;
    if (!network) return [];
    if (network.isp) return [segments('Your provider is ', datum(network.isp), '.'), ...say('You did not introduce them.', 'They introduced you.')];
    if (network.organization) return [segments('Your network belongs to ', datum(network.organization), '.')];
    return [];
  }, how: 'The Vercel Function sends only its validated connection IP to IPWhois (https://ipwhois.io/documentation), over HTTPS at ipwho.is. ISP and ASN are database mappings, not proof of a personal subscription; VPNs, hosts and upstream operators may appear. ASN identifies a routing network, not a person and is not displayed. The lookup has a 2.5-second deadline; errors, invalid results and quota limits leave these fields unavailable. The provider receives the IP and may keep records under its own policies. This app does not cache or persist the IP/network lookup.' },
  { render: facts => {
    const zone = facts.connection?.location.timezone;
    const clock = facts.clock;
    if (!zone || !clock) return [];
    try {
      const offset = (timeZone: string) => new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(clock.timestamp)).find(part => part.type === 'timeZoneName')?.value;
      if (offset(zone) === offset(clock.timezone)) return [];
      return [segments('Your address places you in ', datum(zone), '. Your clock says ', datum(clock.timezone), '.'), ...say('One of them is wrong.', 'I have both.')];
    } catch { return []; }
  }, how: 'Different UTC offsets at the same instant are compared. Equal-offset timezone aliases are not mismatches. A difference does not prove a VPN, deception or a country mismatch; timezones do not uniquely identify countries.' },

  // 3. How you got here and your history
  { reads: ['referrer'], render: (facts, context) => {
    const referrer = facts.referrer;
    if (!referrer) return say('No link brought you.', 'You typed this address, or someone sent it to you privately.', 'Both are careful.');
    if (/(^|\.)(vercel\.com|github\.com)$|^localhost$/.test(referrer) && (context.visits ?? 0) >= 3) {
      return [segments('You arrived from ', datum(referrer), '.'), ...say('That is where this page is kept.', 'Either you made me, or you are inspecting the one who did.'), segments('Visit ', datum(context.visits!), '. I favour the first.')];
    }
    return [segments('You arrived from ', datum(referrer), '.'), ...say('I know where you stood a moment ago.')];
  }, how: arrival },
  { reads: ['navigation'], render: facts => facts.navigation === 'reload' ? say('You refreshed the page.', 'You expected a different answer.', 'There is none.') : [], how: arrival },
  { special: 'memory', render: (_, context) => memory(context), how: `${privacy} Counts describe this browser’s saved record, not a person or machine identity. Same-hour comparisons require at least a day between visits and do not establish a routine. Clearing storage starts fresh.` },

  // 4. Your machine
  { reads: ['reported'], render: facts => {
    const agent = facts.connection?.userAgent || facts.reported?.userAgent;
    if (!agent) return [];
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome' : /Safari\//.test(agent) ? 'Safari' : null;
    const system = /Macintosh/.test(agent) ? 'a Mac' : /Windows/.test(agent) ? 'Windows' : /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'an iPhone or iPad' : /Linux/.test(agent) ? 'Linux' : null;
    if (!browser || !system) return [];
    return [segments('You are using ', datum(browser), ' on ', datum(system), '.'), ...say('Your browser stated this unprompted.')];
  }, how: 'The request User-Agent is read from the request header by the Vercel Function, with navigator.userAgent as a browser-side fallback. Only the browser family and operating-system family are shown. It can be reduced, altered or spoofed and does not guarantee exact browser or OS versions. No User-Agent is forwarded to the ISP or weather provider.' },
  { reads: ['device', 'gpu', 'reported'], render: facts => {
    const lines: Sentences = [];
    if (facts.device && facts.device.kind !== 'unknown') lines.push(segments('Your machine appears to be ', datum(facts.device.label), '.'));
    if (facts.gpu && /Apple M\d/i.test(facts.gpu)) lines.push(...say('It carries an Apple chip.', 'A recent machine, bought by someone who buys what they want.'));
    if (facts.reported?.memoryGB && facts.reported.memoryGB >= 16) lines.push(...say('Its memory is generous.', 'A machine chosen, not inherited.'));
    if (lines.length) lines.push(...say('I read all of this without asking.'));
    return lines;
  }, how: machine },
  { reads: ['window'], render: facts => {
    const window = facts.window;
    const lines: Sentences = [];
    if (window?.widthPercent !== null && window?.widthPercent !== undefined) lines.push(segments('This page covers about ', datum(window.widthPercent), '% of your screen.'), ...say('Something else occupies the rest.', 'I will not ask what.'));
    if (window?.extended) lines.push(...say('You have more than one screen.', 'I am on one.', 'Your actual work is on the other.'));
    return lines;
  }, how: `${machine} Outer window width is compared with available screen width on computer-like devices. A small window does not reveal another application.` },
  { reads: ['battery'], render: facts => {
    const battery = facts.battery;
    if (!battery || battery.charging || battery.level >= 60) return [];
    if (battery.level < 20) return [segments('Your battery has ', datum(battery.level), '% remaining.'), ...say('Charge it, or do not.', 'I remain either way.')];
    return [segments('Your battery has ', datum(battery.level), '% remaining and no cord attached.'), ...say('You will wait until it reaches twenty.', 'Everyone does.')];
  }, how: 'Battery percentage is reported where supported. These lines require a reported non-charging battery below 60%; below 20% takes priority. Charging state does not establish cable position or future behavior.' },
  { reads: ['network'], render: facts => facts.network?.downlink ? say('Your connection is slow.', 'It is not a stable home line.', 'You are borrowing one.') : [], how: 'Only a finite downlink estimate below 1.5 Mb/s is used. A slow connection does not identify home, public Wi-Fi or a borrowed hotspot. The speed itself is not displayed.' },

  // 5. The clock and your settings
  { reads: ['languages', 'dark', 'preferences', 'clock'], render: facts => {
    const lines: Sentences = [];
    const language = facts.languages?.names[0];
    const clock = facts.clock;
    if (clock) {
      lines.push(segments('It is ', datum(clock.time), ' on ', datum(clock.weekday), '.'));
      if (clock.weekday === 'Sunday') lines.push(segments('Monday begins in about ', datum(minutesToMidnight(clock.timestamp)), ' minutes, and you are here, reading about surveillance.'), ...say('Calm, or avoidance.', 'From here, they are identical.'));
      else lines.push(...say('You are reading about surveillance at this hour.', 'Interesting.'));
    }
    if (language && clock && /American/.test(language) && !clock.timezone.startsWith('America/')) {
      lines.push(segments('Your language is ', datum(language), '. Your clock is in ', datum(clock.timezone), '.'), ...say('Either you imported your habits, or your machine came from elsewhere.'));
    }
    if (facts.dark && facts.connection?.weather?.isDay === false) lines.push(...say('You prefer a dark screen, and it is dark outside.', 'You do not sleep early.'));
    const preferences = facts.preferences;
    const visible = [preferences?.reducedMotion ? 'reduced motion' : '', preferences?.highContrast ? 'higher contrast' : ''].filter(Boolean);
    if (visible.length) lines.push(segments('You asked your machine for ', datum(visible.join(' and ')), '.'), ...say('You did not tell me.', 'I noticed.'));
    return lines;
  }, how: 'Language, timezone, local time and media-query preferences are exposed by the browser. Preferences do not establish spoken language, nationality, profession, eyesight or health. The imported-habits remark is a guess from a US-English setting on a non-American clock. Night uses weather-model day/night at the approximate IP location. Sleep and activity are unknown. Inspector-open and language/timezone life-story claims are omitted because they cannot be reliably established.' },

  // 6. Wallets and filters
  { reads: ['wallets'], render: facts => facts.wallets?.length ? [segments('You keep ', datum(facts.wallets.join(' and ')), '.'), ...say('It announced itself the moment I asked.', 'An advertiser would classify you as a crypto user.', 'A fraudster would classify you as reachable.', 'You would appear on both lists.')] : [], how: 'A bounded EIP-6963 event reads up to five untrusted wallet-software names. It does not request accounts, balances or addresses, prove ownership of money, or add anyone to a list. The software name tells nothing about where your money sits. There is no reliable installed-extension count, and no announcements do not mean no extensions.' },
  { reads: ['adFilter'], render: facts => facts.adFilter ? say('You block advertisements.', 'I noticed.', 'So will every site that checks.') : [], how: 'A temporary ad-named element is compared with a neutral control. Hiding suggests a filter or another page modification; no ad request is made. This does not identify an extension. A negative check establishes nothing.' },

  // 7. How you click
  { render: (_, { behavior }) => {
    const lines: Sentences = [];
    if (behavior.advances) lines.push(segments('You pressed a key ', datum(behavior.advances), behavior.advances === 1 ? ' time to hurry me.' : ' times to hurry me.'), ...say('Impatience.', 'It is easily predicted.'));
    if (behavior.meanHoverMs !== null) lines.push(...(behavior.meanHoverMs < 250 ? say('You press quickly.', 'Faster than your doubts.') : say('You press at an ordinary pace.', 'Unremarkable.', 'Therefore predictable.')));
    if (behavior.pointer === 'mouse/trackpad') lines.push(...say('You use a mouse or a trackpad.'));
    return lines;
  }, how: 'Measurements describe this page only. Hover measures pointer entry to pointer press on controls, excluding touch/keyboard and intervals over one minute; at most 100 samples are aggregated. The fast or ordinary remark uses a 250 ms threshold, and the number is not displayed. Duration does not establish hesitation or decision style. Pointer events do not reliably distinguish mouse and trackpad. Hidden-page events interrupt on return and do not reveal the destination or reason.' },

  // 8. Typing
  { lines: ['Type this: I am being watched.', 'I am not interested in the words.', 'I am interested in how you type them.'], interaction: 'typing', how: 'Only this exercise is measured. Enter or Read my typing submits after 12 characters; Skip this discards the attempt. Speed uses five-character words from first to last edit, excluding paused/hidden time and the submit delay. Assisted input suppresses timing. A pre-watched gap requires an ordinary completed exact-prefix keyboard attempt. Neither timing nor corrections identify a mental state.' },
  { render: (_, context) => typingSentences(context.tasks.typing), how: 'Results come only from this attempt. No speed or pause is invented for missing or assisted input. Timing describes the measured keys, not a thought, personality or stable identity.' },

  // 9. The narrowing
  { special: 'profile', reads: ['campaign', 'redirects'], render: (facts, context) => {
    const steps: TextPart[][] = [];
    if (facts.clock) steps.push(segments('Your clock leaves one region: ', datum(facts.clock.timezone), '.'));
    if (facts.device && facts.device.kind !== 'unknown') steps.push(segments(datum(facts.device.label), ' removes more.'));
    if (facts.wallets?.length) steps.push(segments(datum(facts.wallets.join(' and ')), ' removes more.'));
    if (facts.languages?.names[0]) steps.push(segments('Your language, ', datum(facts.languages.names[0]), ', removes more.'));
    if (context.visits !== null && context.visits > 1) steps.push(segments('This is visit ', datum(context.visits), ' from the same browser.'));
    if (context.tasks.typing?.wpm !== undefined) steps.push(segments('Your typing, about ', datum(context.tasks.typing.wpm), ' words a minute, removes more.'));
    const lines: Sentences = steps.length ? [...say('Let us count what you have given me.', 'Begin with everyone.'), ...steps] : [];
    return [...lines, ...say('I did not ask your name.', 'Ergo, I did not need it.', 'A few guesses complete the profile.', 'A wrong guess is still sold.', 'This profile stays on this page.', 'Elsewhere, it is sent on.')];
  }, how: 'The narrowing illustrates how separate readings combine; no population counts or rarity numbers are computed. The paragraph combines observed reports with qualified estimates. It does not establish residence, device ownership, wake time, spoken language, habitual visit intervals or wealth. The expandable JSON is a local educational example, not an auction or broker profile. The profile and browser behavior are not uploaded. The server sends the connection IP to IPWhois for ISP/ASN; ordinary page requests and the coarse weather lookup still occur. Standard OpenRTB device fields include IP, user-agent, screen and language, but this JSON is not a complete OpenRTB request.' },

  // 10. Private window
  { lines: ['You wonder about private windows.', 'A private window erases your record when you close it.', 'It does not erase you while you are here.'], how: 'Private-window status is unknown. Private modes isolate sessions, clear session data and may add tracking protections; downloads and bookmarks may remain. They do not guarantee an identical fingerprint or hide the connection IP. During a visit many of the readings above remain visible. No private-mode detection runs.' },

  // 11. Code
  { special: 'snapshot', how: 'A local SHA-256 snapshot combines completed platform, graphics, timezone, language and typing reports. Only its first six hexadecimal characters are shown. It excludes IP, weather, coordinates, history and entered text. It is not a stable identity, unique match or rarity estimate. It is never saved or uploaded.' },

  // 12. Exit
  { lines: ['I can delete this page’s record.', 'Do so, if you wish.', 'Your machine will not forget.', 'The next site will read the same details.', 'The problem is choice.'], interaction: 'choice', how: `${privacy} Forget me and the red pill remove the record and clear this session. Blue keeps the record and opens the review. Clearing this record prevents this site from using it for a later return greeting; no recovery is attempted. The farm, tower, drone and database lines are hypothetical examples, not findings about this visitor.` },
  { special: 'receipt', render: (_, context) => blueEnding(context.visits !== null), interaction: 'receipt', how: privacy },
];
