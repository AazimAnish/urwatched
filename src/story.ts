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
const privacy = 'No cookies or analytics. One visit count and first/latest dates are saved automatically in localStorage. Forget me and the red pill delete this record and stop the session. Other readings stay in page memory. The host receives ordinary requests and may retain security logs. The narrator’s taunts do not establish identity, feelings or an external watcher.';
const connection = 'Vercel estimates location from the connection IP. VPNs, proxies and mobile networks can move it. The result is not proof of residence. Region values may be administrative codes. Local previews have no connection location; no ISP lookup runs.';
const weatherHow = `${connection} A same-origin request retrieves Open-Meteo weather with IP coordinates rounded to 0.1 degrees. The provider receives the server request and coarse coordinates, not the visitor IP or permission-granted coordinates. Modelled conditions can differ from weather at your window. Rain-specific WMO codes select the umbrella line; heat means above 33°C and clear means code 0. No indoor activity or umbrella use is observed. Weather data: Open-Meteo, CC BY 4.0.`;
const machine = 'Device and GPU labels are browser reports and may be altered. Memory is a coarse estimate. These readings do not establish ownership, purchase price or a specific laptop. Missing battery readings prove nothing. Screen count and another screen’s contents are not available; isExtended only reports more than one screen.';
const arrival = 'Only the supplied referrer hostname is used. Missing referrers do not establish a typed URL or private message. A referrer does not reveal the time spent on that site. The Navigation Timing API can identify a reload.';
const closing = ['Privacy isn’t only taken from you.', 'You hand it over one click at a time.', 'Hand it over slower.'];

function weather(facts: Readonly<Partial<Facts>>): Sentences {
  const current = facts.connection?.weather;
  const city = facts.connection?.location.city;
  if (!current || !city) return [];
  const temperature = datum(Math.round(current.temperature));
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(current.code)) {
    return [segments('Near ', datum(city), '. About ', temperature, '°C, with rain reported.'), ...say('Umbrella?', 'No?', 'I’m not surprised.')];
  }
  if (current.temperature > 33) return [segments('Near ', datum(city), '. About ', temperature, '°C outside.'), ...say('Indoors with a fan and me?', 'Smart.')];
  if (current.code === 0) return [segments('Near ', datum(city), '. About ', temperature, '°C and clear.'), ...say('And you’re looking at me.', 'Sweet.')];
  return [];
}

function memory(context: StoryContext): Sentences {
  if (context.visits === null) return say('The browser wouldn’t save this visit.');
  const lines = context.visits === 1 ? say('First saved visit.', 'I saved it.', 'I didn’t ask.')
    : context.visits === 2 ? say('Back again?', 'Same browser record, same answers.')
    : [segments('Visit ', datum(context.visits), '.'), ...say('You keep checking if the answer changed.', 'It hasn’t.')];
  if (context.previousVisit !== null && context.startedAt - context.previousVisit >= 86_400_000 && new Date(context.startedAt).getHours() === new Date(context.previousVisit).getHours()) {
    lines.push(segments('Back around ', datum(new Date(context.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), ', the same hour as last time.'), ...say('Routine?', 'Routine is the easiest thing to predict.'));
  }
  return lines;
}

export function blueEnding(saved: boolean): Sentences {
  return say('Blue pill.', 'Close the tab.', saved ? 'The saved record stays.' : 'No visit record was saved.', ...closing);
}

export function redEnding(erased: boolean, pill = true): Sentences {
  if (!erased) return say('The session has stopped.', 'The saved record could not be fully erased.', 'Clear this site’s data in your browser settings.');
  if (!pill) return say('Done.', 'I forgot this page’s record.', 'Other sites keep their own.');
  return say('Red pill.', 'Run.', 'Phone off.', 'Cash only.', 'A farm, no signal.', 'The last tower may still have your last connection.', 'A drone could see the field.', 'Your face may be in a database you never joined.', ...closing);
}

export const story: Scene[] = [
  // 1. Opening
  { lines: ['“Reject all.” Nice try.', 'I set no cookies, and I still get these details.', 'Sit down.', 'This is going to be quick for me.'], how: privacy },

  // 2. Place and weather
  { reads: ['connection', 'clock'], render: weather, how: weatherHow, pending: 'Give me a second.' },
  { render: facts => {
    const location = facts.connection?.location;
    if (location?.city) return [segments('Your connection points near ', datum([location.city, location.region].filter(Boolean).join(', ')), '.'), ...say('Still think I’m bluffing?')];
    return facts.clock ? [segments('No location result. Your clock still says ', datum(facts.clock.timezone), '.'), ...say('I’ll wait.')] : [];
  }, how: connection },
  { render: facts => {
    const zone = facts.connection?.location.timezone;
    const clock = facts.clock;
    if (!zone || !clock) return [];
    try {
      const offset = (timeZone: string) => new Intl.DateTimeFormat('en', { timeZone, timeZoneName: 'longOffset' }).formatToParts(new Date(clock.timestamp)).find(part => part.type === 'timeZoneName')?.value;
      if (offset(zone) === offset(clock.timezone)) return [];
      return [segments('Your connection suggests ', datum(zone), '. Your clock says ', datum(clock.timezone), '.'), ...say('Pick a story.', 'I can read both.')];
    } catch { return []; }
  }, how: 'Different UTC offsets at the same instant are compared. Equal-offset timezone aliases are not mismatches. A difference does not prove a VPN, deception or a country mismatch; timezones do not uniquely identify countries.' },

  // 3. Return visits
  { special: 'memory', render: (_, context) => memory(context), how: `${privacy} Counts describe this browser’s saved record, not a person or machine identity. Same-hour comparisons require at least a day between visits and do not establish a routine. Clearing storage starts fresh.` },
  { reads: ['navigation'], render: facts => facts.navigation === 'reload' ? say('You refreshed.', 'Did you think I’d answer differently?') : [], how: arrival },
  { reads: ['referrer'], render: facts => facts.referrer ? [segments('Your referring link came from ', datum(facts.referrer), '.'), ...say('You brought that detail with you.')] : say('No referring link was reported.', 'Typed this in?', 'Or someone sent it privately?'), how: arrival },

  // 4. The machine
  { reads: ['device', 'gpu', 'reported'], render: facts => {
    const lines: Sentences = [];
    if (facts.device && facts.device.kind !== 'unknown') lines.push(segments('Looks like ', datum(facts.device.label), '.'));
    if (facts.gpu) lines.push(segments('Reporting ', datum(facts.gpu), ' graphics.'));
    if (facts.reported?.memoryGB) lines.push(segments('About ', datum(facts.reported.memoryGB), ' GB of memory.'));
    if (lines.length) lines.push(...say('And I found that without asking.'));
    return lines;
  }, how: machine },
  { reads: ['window'], render: facts => {
    const window = facts.window;
    const lines: Sentences = [];
    if (window?.widthPercent !== null && window?.widthPercent !== undefined) lines.push(segments('A window using about ', datum(window.widthPercent), '% of your available screen width.'), ...say('Something else open next to me?', 'I’ll leave you your secrets.'));
    if (window?.extended) lines.push(...say('More than one screen.', 'I’m on one.', 'Is the real work on the other?'));
    return lines;
  }, how: `${machine} Outer window width is compared with available screen width on computer-like devices. A small window does not reveal another application.` },
  { reads: ['battery'], render: facts => {
    const battery = facts.battery;
    if (!battery || battery.charging || battery.level >= 60) return [];
    if (battery.level < 20) return [segments(datum(battery.level), '%.'), ...say('Plug it in, or watch it die.', 'I’m fine either way.')];
    return [segments(datum(battery.level), '% left.'), ...say('You can spare a minute.', 'You can also plug in.', 'Will you?')];
  }, how: 'Battery percentage is reported where supported. These lines require a reported non-charging battery below 60%; below 20% takes priority. Charging state does not establish cable position or future behavior.' },
  { reads: ['network'], render: facts => facts.network?.downlink ? [segments('Your line reports about ', datum(facts.network.downlink), ' Mb/s.'), ...say('Borrowing a connection?', 'Or just a slow day?')] : [], how: 'Only a finite downlink estimate below 1.5 Mb/s is used. A slow connection does not identify home, public Wi-Fi or a borrowed hotspot.' },

  // 5. Settings
  { reads: ['languages', 'dark', 'preferences'], render: facts => {
    const lines: Sentences = [];
    const language = facts.languages?.names[0];
    const clock = facts.clock;
    if (language && clock) lines.push(segments('Your language setting is ', datum(language), ', your clock is ', datum(clock.timezone), '.'));
    if (clock) lines.push(segments('It’s ', datum(clock.time), ' on a ', datum(clock.weekday), ', and you’re reading about surveillance.'), ...say('Relaxing, I hope.'));
    if (facts.dark && facts.connection?.weather?.isDay === false) lines.push(...say('Dark mode after dark.', 'Not sleeping yet?'));
    const preferences = facts.preferences;
    const visible = [preferences?.reducedMotion ? 'reduced motion' : '', preferences?.highContrast ? 'higher contrast' : ''].filter(Boolean);
    if (visible.length) lines.push(segments('You set ', datum(visible.join(' and ')), '.'), ...say('A preference you didn’t mention.', 'I noticed.'));
    return lines;
  }, how: 'Language, timezone, local time and media-query preferences are exposed by the browser. Preferences do not establish spoken language, nationality, profession, eyesight or health. Night uses weather-model day/night at the approximate IP location. Sleep and activity are unknown. Inspector-open and language/timezone life-story claims are omitted because they cannot be reliably established.' },

  // 6. Extensions and wallets
  { reads: ['wallets'], render: facts => facts.wallets?.length ? [segments(datum(facts.wallets.join(', ')), '.'), ...say('Your wallet software announced itself when I asked.', 'That tells me the software, not where your money sits.', 'A useful clue for an advertiser.', 'Or a scammer.')] : [], how: 'A bounded EIP-6963 event reads up to five untrusted wallet-software names. It does not request accounts, balances or addresses, prove ownership of money, or add anyone to a list. There is no reliable installed-extension count, and no announcements do not mean no extensions.' },
  { reads: ['adFilter'], render: facts => facts.adFilter ? say('Something blocked my fake ad.', 'Probably a filter.', 'I noticed.', 'Other sites can check too.') : [], how: 'A temporary ad-named element is compared with a neutral control. Hiding suggests a filter or another page modification; no ad request is made. This does not identify an extension. A negative check establishes nothing.' },

  // 7. Habits; page returns still interrupt immediately rather than waiting here.
  { render: (_, { behavior }) => {
    const lines: Sentences = [];
    if (behavior.advances) lines.push(segments('You pressed Enter or Space ', datum(behavior.advances), behavior.advances === 1 ? ' time to rush me.' : ' times to rush me.'), ...say('I count that.'));
    if (behavior.meanHoverMs !== null) lines.push(segments('You waited an average of ', datum(behavior.meanHoverMs), ' ms over a control before pressing.'), ...say('Quick hands, slow decisions?'));
    if (behavior.pointer === 'mouse/trackpad') lines.push(...say('Mouse or trackpad.', 'Your browser reports them the same way.'));
    return lines;
  }, how: 'Measurements describe this page only. Hover measures pointer entry to pointer press on controls, excluding touch/keyboard and intervals over one minute; at most 100 samples are aggregated. Duration does not establish hesitation or decision style. Pointer events do not reliably distinguish mouse and trackpad. Hidden-page events interrupt on return and do not reveal the destination or reason.' },

  // 8. Camera and microphone: dialogue only, capture stays disabled.
  { lines: ['Looking for the camera light?', 'I haven’t touched your lens or microphone.', 'You didn’t need a light for any of this.', 'I didn’t need your voice.', 'An ad follows you after a chat, and you blame the microphone.', 'Your search, your click, and your place can be enough.', 'The mute button hides your voice, not your browsing.'], how: 'Camera and microphone are disabled by this site’s Permissions-Policy. No stream, preview, recording or permission request is made. The narrator cannot see camera indicators, faces or another app’s mute state. Advertising examples describe possible mechanisms; this page cannot determine why any particular ad appeared.' },

  // 9. Location
  { lines: ['Want me more precise?', 'Your browser needs permission.'], interaction: 'location', how: 'This passage automatically calls geolocation once after the explanation; browser authorization is required. No separate Allow button is used. Accuracy is an estimate, not a guarantee or street address. A denied request is not bypassed. The browser may use an external location provider. Coordinates are transient; the review retains only the outcome. A 15-second deadline prevents a stalled story, and late callbacks are ignored.' },

  // 10. Typing
  { lines: ['Type: I am being watched.', 'I want your rhythm, not the words.'], interaction: 'typing', how: 'Only this exercise is measured. Enter or Read my typing submits after 12 characters; Skip this discards the attempt. Speed uses five-character words from first to last edit, excluding paused/hidden time and the submit delay. Assisted input suppresses timing. A pre-watched gap requires an ordinary completed exact-prefix keyboard attempt. Neither timing nor corrections identify a mental state.' },
  { render: (_, context) => typingSentences(context.tasks.typing), how: 'Results come only from this attempt. No speed or pause is invented for missing or assisted input. Timing describes the measured keys, not a thought, personality or stable identity.' },

  // 11. Profile
  { special: 'profile', reads: ['campaign', 'redirects'], render: (facts, context) => {
    const details: TextPart[][] = [];
    if (facts.connection?.location.city) details.push(segments('connection near ', datum(facts.connection.location.city)));
    if (facts.device && facts.device.kind !== 'unknown') details.push(segments('apparently using ', datum(facts.device.label)));
    if (facts.clock) details.push(segments('a clock reading ', datum(facts.clock.time)));
    if (facts.languages?.names[0]) details.push(segments('language set to ', datum(facts.languages.names[0])));
    if (context.previousVisit !== null) {
      const hours = Math.floor((context.startedAt - context.previousVisit) / 3_600_000);
      details.push(hours ? segments('last saved visit ', datum(hours), hours === 1 ? ' hour ago' : ' hours ago') : segments('last saved visit less than an hour ago'));
    }
    if (facts.wallets?.length) details.push(segments('wallet software announcing ', datum(facts.wallets.join(', '))));
    if (context.tasks.typing?.wpm !== undefined) details.push(segments('typing at about ', datum(context.tasks.typing.wpm), ' words a minute'));
    const paragraph: TextPart[] = segments('Here’s what you gave me: ');
    details.forEach((detail, index) => paragraph.push(...(index ? segments(', ') : []), ...detail));
    paragraph.push(...segments('.'));
    return [...(details.length ? [paragraph] : []), ...say('Add a few guesses and it’s a profile.', 'Even when a guess is wrong, a buyer might use it anyway.', 'These readings stay in this page.', 'Other sites may send theirs on.')];
  }, how: 'This paragraph combines observed reports with qualified estimates. It does not establish residence, device ownership, wake time, spoken language, habitual visit intervals or wealth. The expandable JSON is a local educational example, not an auction or broker profile. No readings are uploaded. Ordinary page requests and the coarse weather lookup still occur. Standard OpenRTB device fields include IP, user-agent, screen and language, but this JSON is not a complete OpenRTB request.' },

  // 12. Private window
  { lines: ['Private window?', 'It clears session data after you close it.', 'During the visit, many of these details are still visible.', 'Private doesn’t mean a hidden person.'], how: 'Private-window status is unknown. Private modes isolate sessions, clear session data and may add tracking protections; downloads and bookmarks may remain. They do not guarantee an identical fingerprint or hide the connection IP. No private-mode detection runs.' },

  // 13. Code
  { special: 'snapshot', how: 'A local SHA-256 snapshot combines completed platform, graphics, timezone, language and typing reports. Only its first six hexadecimal characters are shown. It excludes IP, weather, coordinates, history and entered text. It is not a stable identity, unique match or rarity estimate. It is never saved or uploaded.' },

  // 14. Exit
  { lines: ['I can erase this page’s record.', 'Go ahead.', 'Other sites can read your device’s exposed details again.'], interaction: 'choice', how: `${privacy} Forget me and the red pill remove the record and clear this session. Blue keeps the record and opens the review. Clearing this record prevents this site from using it for a later return greeting; no recovery is attempted. The farm, tower, drone and database lines are hypothetical examples, not findings about this visitor.` },
  { special: 'receipt', render: (_, context) => blueEnding(context.visits !== null), interaction: 'receipt', how: privacy },
];
