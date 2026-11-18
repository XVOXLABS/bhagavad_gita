import fs from 'node:fs';
import path from 'node:path';

// Read API key from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = process.env.ANAM_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/ANAM_API_KEY=([^\r\n]+)/);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error('❌ Error: ANAM_API_KEY not found in environment or .env.local');
  process.exit(1);
}

const imageArg = process.argv[2] || 'public/krishna/portrait-1200.webp';
const imagePath = path.resolve(process.cwd(), imageArg);

if (!fs.existsSync(imagePath)) {
  console.error(`❌ Error: Image file not found at ${imagePath}`);
  console.log('Usage: node scripts/create-anam-avatar.mjs <path-to-image.png|jpg|webp>');
  process.exit(1);
}

console.log(`📤 Uploading high-definition avatar image to Anam.ai...`);
console.log(`   File: ${imagePath}`);

async function createAvatar() {
  try {
    const fileBytes = fs.readFileSync(imagePath);
    const ext = path.extname(imagePath).toLowerCase();
    const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const blob = new Blob([fileBytes], { type: mimeType });

    const formData = new FormData();
    formData.append('imageFile', blob, path.basename(imagePath));
    formData.append('displayName', 'Lord Krishna HD');

    const response = await fetch('https://api.anam.ai/v1/avatars', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`❌ Anam API Error (${response.status}):`, errText);
      process.exit(1);
    }

    const data = await response.json();
    console.log('\n✨ New High-Definition Avatar Created Successfully!');
    console.log(`   Avatar ID: ${data.id}`);
    if (data.displayName) console.log(`   Name: ${data.displayName}`);

    console.log('\n👉 Update your .env.local with:');
    console.log(`   ANAM_AVATAR_ID=${data.id}`);
    console.log(`   ANAM_AVATAR_MODEL=cara-4.1-express`);
  } catch (err) {
    console.error('❌ Network error connecting to Anam.ai:', err.message);
  }
}

createAvatar();
