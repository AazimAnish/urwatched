import { characters } from './typewriter.ts';
import type { Sentences, TaskResults, TextPart } from './types.ts';

export const datum = (value: string | number): TextPart => ({ text: String(value), data: true });
export const segments = (...values: (string | TextPart)[]): TextPart[] => values.map(value => typeof value === 'string' ? { text: value } : value);
export const plainText = (parts: TextPart[]): string => parts.map(part => part.text).join('');
export function sliceSegments(parts: TextPart[], start: number, length = Infinity): TextPart[] {
  const visible: TextPart[] = [];
  for (const part of parts) {
    const letters = characters(part.text);
    if (start >= letters.length) { start -= letters.length; continue; }
    const shown = letters.slice(start, start + length);
    if (shown.length) visible.push({ ...part, text: shown.join('') });
    length -= shown.length; start = 0;
    if (length <= 0) break;
  }
  return visible;
}
export const joinSentences = (sentences: Sentences, separator = ' '): TextPart[] => sentences.flatMap((sentence, index) => index ? [...segments(separator), ...sentence] : sentence);

export function typingSentences(result: TaskResults['typing']): Sentences {
  if (!result) return [segments('You skipped it.'), segments('Fine.'), segments('I have the other details.')];
  if (result.input === 'assisted' || result.wpm === undefined) return [segments('No reliable rhythm reading from that attempt.')];
  const lines: Sentences = [segments('About ', datum(result.wpm), ' words a minute.')];
  if (result.watchedGapMs !== undefined) lines.push(segments('A ', datum(result.watchedGapMs), ' ms gap before “watched”.'), segments('Your hands paused. Your thoughts? I can only guess.'));
  return lines;
}
