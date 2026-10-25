const segmenter = typeof Intl.Segmenter === 'function' ? new Intl.Segmenter(undefined, { granularity: 'grapheme' }) : undefined;
export const characters = (text: string): string[] => segmenter ? [...segmenter.segment(text)].map(part => part.segment) : Array.from(text);

// Measure with the real font and wrapping rules; long readings remain readable at zoom.
export function paginate(text: string, probe: HTMLElement, height: number): string[] {
  const letters = characters(text);
  if (!letters.length) return [''];
  const pages: string[] = [];
  let start = 0;
  while (start < letters.length) {
    let low = 1, high = letters.length - start, fit = 1;
    while (low <= high) {
      const count = Math.floor((low + high) / 2);
      probe.textContent = letters.slice(start, start + count).join('');
      if (probe.getBoundingClientRect().height <= Math.max(24, height)) { fit = count; low = count + 1; }
      else high = count - 1;
    }
    if (start + fit < letters.length) {
      let boundary = fit - 1;
      while (boundary >= 0 && !/\s/.test(letters[start + boundary])) boundary--;
      if (boundary > fit / 2) fit = boundary + 1;
    }
    pages.push(letters.slice(start, start + fit).join(''));
    start += fit;
  }
  probe.textContent = '';
  return pages;
}
