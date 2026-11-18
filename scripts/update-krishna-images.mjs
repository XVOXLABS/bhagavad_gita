import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const sourceJpg = 'C:/Users/Jothi Mani/.gemini/antigravity/brain/ce4dbbaa-c102-4a85-bd15-398b97e6341d/krishna_cinematic_portrait_1794971024361.jpg';
const destJpg = path.resolve('public/krishna/lord_krishna_avatar_hd.jpg');

console.log('Copying master JPG...');
fs.copyFileSync(sourceJpg, destJpg);

async function generateWebP() {
  console.log('Generating high-definition WebP assets...');

  // 1200x1200 portrait (94% quality)
  await sharp(destJpg)
    .resize(1200, 1200, { fit: 'cover', position: 'center' })
    .webp({ quality: 94 })
    .toFile(path.resolve('public/krishna/portrait-1200.webp'));
  console.log('✓ Created public/krishna/portrait-1200.webp');

  // 512x512 avatar
  await sharp(destJpg)
    .resize(512, 512, { fit: 'cover', position: 'center' })
    .webp({ quality: 92 })
    .toFile(path.resolve('public/krishna/avatar-512.webp'));
  console.log('✓ Created public/krishna/avatar-512.webp');

  // 192x192 avatar
  await sharp(destJpg)
    .resize(192, 192, { fit: 'cover', position: 'center' })
    .webp({ quality: 90 })
    .toFile(path.resolve('public/krishna/avatar-192.webp'));
  console.log('✓ Created public/krishna/avatar-192.webp');

  console.log('All image assets updated successfully!');
}

generateWebP().catch(console.error);
