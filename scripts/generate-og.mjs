import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const svgPath = resolve(root, 'public/og-image.svg');
const pngPath = resolve(root, 'public/og-image.png');

const svg = await readFile(svgPath);

await mkdir(dirname(pngPath), { recursive: true });

await sharp(svg)
  .resize(1200, 630, { fit: 'fill' })
  .png({ compressionLevel: 9, palette: false })
  .toFile(pngPath);

console.log(`og-image.png gerado (1200x630) em ${pngPath}`);
