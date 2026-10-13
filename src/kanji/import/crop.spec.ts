import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import sharp from 'sharp';

import { boxToRegion, cropPicture } from './crop';

describe('boxToRegion', () => {
  it('converts fractions to an inset pixel region', () => {
    expect(boxToRegion({ x0: 0.25, y0: 0.5, x1: 0.75, y1: 1 }, 400, 200)).toEqual({ left: 104, top: 102, width: 192, height: 96 });
  });

  it('rejects boxes outside the page or too small', () => {
    expect(boxToRegion({ x0: -0.1, y0: 0, x1: 0.5, y1: 0.5 }, 100, 100)).toBeNull();
    expect(boxToRegion({ x0: 0.5, y0: 0, x1: 0.4, y1: 0.5 }, 100, 100)).toBeNull();
  });
});

describe('cropPicture', () => {
  it('drops the cell border and trims white margins around the drawing', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'crop-'));
    const page = path.join(dir, 'page.png');
    // 400x200 white page: a 3px black cell border, and a 40x40 black square in the middle.
    const svg = `<svg width="400" height="200" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="200" fill="white"/>
      <rect x="1.5" y="1.5" width="397" height="197" fill="none" stroke="black" stroke-width="3"/>
      <rect x="180" y="80" width="40" height="40" fill="black"/>
    </svg>`;
    await sharp(Buffer.from(svg)).png().toFile(page);

    const out = path.join(dir, 'out.png');
    const size = await cropPicture(page, { x0: 0, y0: 0, x1: 1, y1: 1 }, out);

    expect(size.width).toBeLessThanOrEqual(48);
    expect(size.height).toBeLessThanOrEqual(48);
    expect(size.width).toBeGreaterThanOrEqual(40);
  });
});
