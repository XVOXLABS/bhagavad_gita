import fs from 'node:fs';
import path from 'node:path';

// Read API key from .env.local
const envPath = path.resolve(process.cwd(), '.env.local');
let apiKey = process.env.ELEVENLABS_API_KEY;

if (!apiKey && fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const match = envContent.match(/ELEVENLABS_API_KEY=([^\r\n]+)/);
  if (match) apiKey = match[1].trim();
}

if (!apiKey) {
  console.error('❌ Error: ELEVENLABS_API_KEY not found in environment or .env.local');
  process.exit(1);
}

const API = 'https://api.elevenlabs.io/v1';

async function purgeHistory() {
  console.log('🔍 Fetching generation history from ElevenLabs...');
  let totalDeleted = 0;

  try {
    const res = await fetch(`${API}/history?page_size=100`, {
      headers: { 'xi-api-key': apiKey },
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(`❌ ElevenLabs API error (${res.status}):`, err);
      process.exit(1);
    }

    const data = await res.json();
    const items = data.history || [];

    if (items.length === 0) {
      console.log('✅ ElevenLabs history is already completely empty! No items to delete.');
      return;
    }

    console.log(`🗑️ Found ${items.length} items in ElevenLabs history. Deleting each now...`);

    for (const item of items) {
      const id = item.history_item_id;
      const snippet = (item.text || '').slice(0, 35).replace(/\n/g, ' ');
      try {
        const delRes = await fetch(`${API}/history/${id}`, {
          method: 'DELETE',
          headers: { 'xi-api-key': apiKey },
        });
        if (delRes.ok) {
          totalDeleted += 1;
          console.log(`  ✓ Deleted [${id}]: "${snippet}..."`);
        } else {
          console.warn(`  ⚠️ Could not delete [${id}] (status ${delRes.status})`);
        }
      } catch (err) {
        console.warn(`  ⚠️ Failed to delete [${id}]:`, err.message);
      }
    }

    console.log(`\n🎉 Successfully deleted ${totalDeleted} / ${items.length} items from ElevenLabs.`);
    console.log('Your ElevenLabs dashboard history is now completely clean!');
  } catch (error) {
    console.error('❌ Network error connecting to ElevenLabs:', error.message);
  }
}

purgeHistory();
