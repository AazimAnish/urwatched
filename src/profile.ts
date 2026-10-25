import type { Facts, StoryContext, TextPart } from './types.ts';

export interface Interactions {
  pointer: 'mouse/trackpad' | 'touch' | 'pen' | null;
  hoverSamples: number;
  hoverTotalMs: number;
}

export function profile(facts: Readonly<Partial<Facts>>, context: StoryContext, interactions: Interactions): TextPart[] {
  const snapshot = {
    purpose: 'Local educational example. Not an auction or advertiser profile. Never uploaded.',
    observed: {
      connection: facts.connection ? { ip: facts.connection.ip, environment: facts.connection.environment, requestUserAgent: facts.connection.userAgent } : null,
      browserReported: facts.reported ?? null,
      graphics: facts.gpu ?? null,
      battery: facts.battery ?? null,
      preferences: { languages: facts.languages?.tags ?? null, darkMode: facts.dark ?? null, accessibility: facts.preferences ?? null, timezone: facts.clock?.timezone ?? null },
      navigation: { referrerHost: facts.referrer ?? null, type: facts.navigation ?? null, tags: facts.campaign ?? [], exposedRedirects: facts.redirects ?? null },
      window: facts.window ?? null,
      announcedWalletNames: facts.wallets ?? [],
      interactions: { pointerFamily: interactions.pointer, hoverSamples: interactions.hoverSamples, meanHoverBeforePressMs: interactions.hoverSamples ? Math.round(interactions.hoverTotalMs / interactions.hoverSamples) : null, keyboardAdvances: context.behavior.advances, timesPageHidden: context.behavior.hidden, typing: context.tasks.typing ?? null },
      localVisitCount: context.visits,
    },
    estimates: { ipNetwork: facts.connection?.network ?? null, device: facts.device ?? null, approximateLocation: facts.connection?.location ?? null, weather: facts.connection?.weather ?? null, network: facts.network ?? null, possibleAdFilter: facts.adFilter ?? null },
    unavailable: { privateWindow: 'unknown', identity: 'unknown', interests: 'unknown', income: 'unknown', preciseCoordinates: 'not retained' },
    note: 'Browser reports can be reduced or altered. Null means no reading. The server sends the public connection IP to ipwho.is for ISP/ASN; that provider receives it. Advertising systems may use similar fields; this is not an OpenRTB bid request.',
  };
  // Tokenize JSON rather than injecting HTML; only values receive the data color.
  return (JSON.stringify(snapshot, null, 2).match(/"(?:\\.|[^"\\])*"|\b(?:true|false|null|\d+(?:\.\d+)?)\b|[^"\w]+|\w+/g) ?? []).map((text, index, tokens) => ({
    text, data: /^(?:"|true$|false$|null$|\d)/.test(text) && !(text.startsWith('"') && /^\s*:/.test(tokens[index + 1] ?? '')),
  }));
}
