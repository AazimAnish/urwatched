import type { ConnectionData } from '../server/connection.ts';

export interface TaskResults {
  typing?: { input: 'ordinary' | 'assisted'; completed: boolean; wpm?: number; medianGapMs?: number; watchedGapMs?: number; deletions: number };
}
export interface DeviceInfo {
  kind: 'phone' | 'tablet' | 'mobile' | 'computer' | 'unknown';
  platform: string;
  label: string;
}
export interface Facts {
  reported: { userAgent: string; platform: string; cores?: number; memoryGB?: number; screen: { width: number; height: number; pixelRatio: number }; touchPoints: number; doNotTrack: string | null; globalPrivacyControl: boolean | null };
  connection: ConnectionData;
  device: DeviceInfo;
  gpu: string;
  battery: { level: number; charging: boolean };
  clock: { timestamp: number; hour: number; day: number; time: string; weekday: string; timezone: string };
  languages: { names: string[]; tags: string[] };
  window: { widthPercent: number | null; extended: boolean };
  network: { type: 'wifi' | 'cellular' | 'ethernet' | null; downlink: number | null };
  dark: boolean;
  preferences: { reducedMotion: boolean; highContrast: boolean };
  wallets: string[];
  adFilter: boolean;
  referrer: string | null;
  navigation: 'reload' | 'history';
  campaign: { name: string; value: string }[];
  redirects: number;
}
export type ReadingKey = keyof Facts;
export interface StoryContext {
  visits: number | null;
  previousVisit: number | null;
  startedAt: number;
  behavior: { advances: number; hidden: number; meanHoverMs: number | null; pointer: 'mouse/trackpad' | 'touch' | 'pen' | null };
  tasks: TaskResults;
  blueChosen: boolean;
}
export interface ReportedNavigator extends Navigator {
  deviceMemory?: number;
  globalPrivacyControl?: boolean;
  getBattery?: () => Promise<{ level: number; charging: boolean }>;
  userAgentData?: { platform?: string; mobile?: boolean };
  connection?: { type?: string; downlink?: number };
}
export interface TextPart { text: string; data?: boolean }
export type Sentences = TextPart[][];
export interface TranscriptEntry { sceneId: number; parts: TextPart[]; sentences: Sentences; how: TextPart[]; status: 'ready' | 'unavailable' }
