import sharp from 'sharp';

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

// Pixel region for a fractional box, inset to drop the cell's border lines.
export function boxToRegion(box: Box, width: number, height: number, inset = 0.02) {
  const valid = [box.x0, box.y0, box.x1, box.y1].every((v) => v >= 0 && v <= 1) && box.x1 > box.x0 && box.y1 > box.y0;
  if (!valid) return null;
  const dx = (box.x1 - box.x0) * inset;
  const dy = (box.y1 - box.y0) * inset;
  const left = Math.ceil((box.x0 + dx) * width);
  const top = Math.ceil((box.y0 + dy) * height);
  const right = Math.floor((box.x1 - dx) * width);
  const bottom = Math.floor((box.y1 - dy) * height);
  if (right - left < 8 || bottom - top < 8) return null;
  return { left, top, width: right - left, height: bottom - top };
}

export async function cropPicture(pagePath: string, box: Box, outPath: string) {
  const meta = await sharp(pagePath).metadata();
  const region = boxToRegion(box, meta.width!, meta.height!);
  if (!region) {
    throw new Error(`invalid picture box ${JSON.stringify(box)}`);
  }
  // Separate pipelines: sharp would otherwise run trim before extract.
  const cell = await sharp(pagePath).extract(region).toBuffer();
  // Trim white margins; a small pad keeps the drawing off the edge.
  const trimmed = await sharp(cell).trim({ background: '#ffffff', threshold: 60 }).toBuffer();
  const info = await sharp(trimmed)
    .extend({ top: 4, bottom: 4, left: 4, right: 4, background: '#ffffff' })
    .png()
    .toFile(outPath);
  return { width: info.width, height: info.height };
}
