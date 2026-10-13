export interface RubySegment {
  text: string;
  reading?: string;
}

export const KANJI = /[㐀-鿿々]/;

// Greedy longest match of the reading keys; the frontend renders with the same rule.
export function toRubySegments(text: string, readings: Record<string, string>): RubySegment[] {
  const keys = Object.keys(readings).sort((a, b) => b.length - a.length);
  const segments: RubySegment[] = [];
  let plain = '';
  let i = 0;
  while (i < text.length) {
    const key = keys.find((k) => text.startsWith(k, i));
    if (key) {
      if (plain) {
        segments.push({ text: plain });
        plain = '';
      }
      segments.push({ text: key, reading: readings[key] });
      i += key.length;
    } else {
      plain += text[i];
      i++;
    }
  }
  if (plain) {
    segments.push({ text: plain });
  }
  return segments;
}
