import { readFileSync } from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += char;
    } else if (char === '"') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const EXPECTED = {
  1: 47, 2: 72, 3: 43, 4: 42, 5: 29, 6: 47, 7: 30, 8: 28, 9: 34,
  10: 42, 11: 55, 12: 20, 13: 35, 14: 27, 15: 20, 16: 24, 17: 28, 18: 78,
};

const rows = parseCsv(readFileSync('Bhagwad_Gita.csv', 'utf8')).filter((row) => row.some((cell) => cell.trim()));
const header = rows[0];
const records = rows.slice(1).map((row) => Object.fromEntries(header.map((name, index) => [name, row[index] ?? ''])));
const badWidth = records.filter((record) => Object.keys(record).length !== header.length || header.some((name) => record[name] === undefined));
const keys = new Map();
let dupes = 0;
for (const record of records) {
  const key = `${Number(record.Chapter)}.${Number(record.Verse)}`;
  if (keys.has(key)) dupes += 1;
  keys.set(key, record);
}
const missing = [];
for (const [chapter, count] of Object.entries(EXPECTED)) {
  for (let verse = 1; verse <= count; verse += 1) {
    if (!keys.has(`${chapter}.${verse}`)) missing.push(`${chapter}.${verse}`);
  }
}
const extra = [...keys.keys()].filter((key) => {
  const [chapter, verse] = key.split('.').map(Number);
  return !EXPECTED[chapter] || verse < 1 || verse > EXPECTED[chapter];
});
const empty = { EngMeaning: 0, HinMeaning: 0, WordMeaning: 0, Shloka: 0 };
let engChars = 0;
let hinChars = 0;
let wordChars = 0;
let commentary = 0;
for (const record of keys.values()) {
  if (!record.EngMeaning.trim()) empty.EngMeaning += 1;
  if (!record.HinMeaning.trim()) empty.HinMeaning += 1;
  if (!record.WordMeaning.trim()) empty.WordMeaning += 1;
  if (!record.Shloka.trim()) empty.Shloka += 1;
  engChars += record.EngMeaning.length;
  hinChars += record.HinMeaning.length;
  wordChars += record.WordMeaning.length;
  if (/commentary/i.test(record.WordMeaning) && !/No Commentary/i.test(record.WordMeaning)) commentary += 1;
}
console.log(JSON.stringify({
  header,
  dataRows: records.length,
  unique: keys.size,
  dupes,
  missing: missing.slice(0, 20),
  missingCount: missing.length,
  extra: extra.slice(0, 10),
  empty,
  avgEng: Math.round(engChars / keys.size),
  avgHin: Math.round(hinChars / keys.size),
  avgWord: Math.round(wordChars / keys.size),
  withCommentary: commentary,
}, null, 2));
