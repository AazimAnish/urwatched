const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
export const characters = (text: string): string[] => segmenter ? [...segmenter.segment(text)].map(part => part.segment) : Array.from(text);
