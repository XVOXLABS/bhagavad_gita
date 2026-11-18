import fs from 'node:fs';
import path from 'node:path';

// Generate a 28.8-second seamlessly looping ambient sanctuary track (4 tanpura cycles of 7.2s each)
const SAMPLE_RATE = 44100;
const DURATION = 28.8; // Exactly 4 cycles of 7.2s
const NUM_SAMPLES = Math.floor(SAMPLE_RATE * DURATION);
const NUM_CHANNELS = 2; // Stereo

// Float buffers for Left and Right channels
const left = new Float32Array(NUM_SAMPLES);
const right = new Float32Array(NUM_SAMPLES);

// Fundamental: C# (traditional Krishna / Flute tuning)
const SA_LOW = 69.296;    // C#2
const SA_MID = 138.591;   // C#3 (Kharaj)
const PA_MID = 207.652;   // G#3 (Pa)
const SA_HIGH = 277.183;  // C#4 (Sa)
const RE_HIGH = 311.127;  // D#4 (Re)
const GA_HIGH = 349.228;  // F4  (Ga)
const PA_HIGH = 415.305;  // G#4 (Pa)
const DHA_HIGH = 466.164; // A#4 (Dha)
const SA_TOP = 554.365;   // C#5 (High Sa)

console.log('Synthesizing sanctuary soundscape...');

// 1. Warm Resonant Om Drone (C#2 + G#2 with gentle harmonic pulsation)
for (let i = 0; i < NUM_SAMPLES; i++) {
  const t = i / SAMPLE_RATE;
  // Slow breath modulation (12 seconds per breath cycle)
  const breath = 0.8 + 0.2 * Math.sin(2 * Math.PI * 0.083 * t);
  const shimmer = 0.9 + 0.1 * Math.sin(2 * Math.PI * 0.2 * t + 0.5);

  // Deep C#2 fundamental
  const osc1 = Math.sin(2 * Math.PI * SA_LOW * t);
  const osc2 = 0.5 * Math.sin(2 * Math.PI * (SA_LOW * 2.002) * t);
  const osc3 = 0.3 * Math.sin(2 * Math.PI * (SA_LOW * 3.005) * t);
  const osc4 = 0.15 * Math.sin(2 * Math.PI * (SA_LOW * 4.01) * t);

  // Fifth harmonic (G#2)
  const fifth = 0.35 * Math.sin(2 * Math.PI * (SA_LOW * 1.5) * t + 0.3);

  const droneVal = (osc1 + osc2 + osc3 + osc4 + fifth) * 0.06 * breath * shimmer;

  left[i] += droneVal * 0.95;
  right[i] += droneVal * 1.05;
}

// 2. Sacred Indian Tanpura Plucks
// Pluck pattern: Pa (0s), Sa (1.8s), Sa (3.6s), Kharaj Sa (5.4s) -> Period = 7.2s
const tanpuraPlucks = [
  { timeOffset: 0.0, freq: PA_MID, pan: -0.35, gain: 0.14 },
  { timeOffset: 1.8, freq: SA_HIGH, pan: 0.25, gain: 0.13 },
  { timeOffset: 3.6, freq: SA_HIGH, pan: -0.15, gain: 0.13 },
  { timeOffset: 5.4, freq: SA_MID, pan: 0.40, gain: 0.16 },
];

const TANPURA_CYCLE = 7.2;
const numCycles = Math.ceil(DURATION / TANPURA_CYCLE) + 1;

for (let cycle = 0; cycle < numCycles; cycle++) {
  for (const pluck of tanpuraPlucks) {
    const pluckStart = cycle * TANPURA_CYCLE + pluck.timeOffset;
    const startIdx = Math.floor(pluckStart * SAMPLE_RATE);

    // Tanpura string decay ~ 6.0 seconds
    const decaySamples = Math.floor(6.0 * SAMPLE_RATE);

    for (let s = 0; s < decaySamples; s++) {
      const idx = (startIdx + s) % NUM_SAMPLES;
      const t = s / SAMPLE_RATE;

      // Jivari envelope: initial fast attack, medium pluck body, long shimmering sustain
      const env = Math.exp(-t * 0.65) * (1 - Math.exp(-t * 80));
      if (env <= 0.0001) continue;

      // Tanpura bridge jivari generates shimmering overtones:
      // 1x, 2x, 3x, 4x, 5x, 6x, 7x with slight natural detune
      const f = pluck.freq;
      const h1 = Math.sin(2 * Math.PI * f * t);
      const h2 = 0.65 * Math.sin(2 * Math.PI * (f * 2.003) * t + 0.2);
      const h3 = 0.45 * Math.sin(2 * Math.PI * (f * 3.008) * t + 0.4);
      const h4 = 0.30 * Math.sin(2 * Math.PI * (f * 4.015) * t + 0.6);
      const h5 = 0.20 * Math.sin(2 * Math.PI * (f * 5.025) * t + 0.8);
      const h6 = 0.12 * Math.sin(2 * Math.PI * (f * 6.04) * t + 1.0);

      const sample = (h1 + h2 + h3 + h4 + h5 + h6) * env * pluck.gain;

      const panL = 0.5 * (1 - pluck.pan);
      const panR = 0.5 * (1 + pluck.pan);

      left[idx] += sample * panL;
      right[idx] += sample * panR;
    }
  }
}

// 3. Ethereal Bansuri Flute Phrases (Raag Bhupali: Sa, Re, Ga, Pa, Dha)
// Sweet, tender flute whispers floating gently in the background
const fluteNotes = [
  // Phrase 1 (t = 2.0s to 7.0s)
  { start: 2.0, dur: 2.8, freq: SA_HIGH, endFreq: RE_HIGH, pan: -0.2, gain: 0.045 },
  { start: 5.0, dur: 2.5, freq: GA_HIGH, endFreq: GA_HIGH, pan: -0.1, gain: 0.04 },

  // Phrase 2 (t = 8.5s to 14.0s)
  { start: 8.5, dur: 3.0, freq: PA_HIGH, endFreq: DHA_HIGH, pan: 0.2, gain: 0.05 },
  { start: 12.0, dur: 2.8, freq: PA_HIGH, endFreq: GA_HIGH, pan: 0.15, gain: 0.045 },

  // Phrase 3 (t = 16.0s to 21.0s)
  { start: 16.0, dur: 3.2, freq: GA_HIGH, endFreq: RE_HIGH, pan: -0.25, gain: 0.042 },
  { start: 19.5, dur: 2.8, freq: SA_HIGH, endFreq: SA_HIGH, pan: -0.1, gain: 0.048 },

  // Phrase 4 (t = 23.0s to 28.0s)
  { start: 23.0, dur: 2.6, freq: PA_MID, endFreq: SA_HIGH, pan: 0.2, gain: 0.045 },
  { start: 25.8, dur: 2.5, freq: RE_HIGH, endFreq: SA_HIGH, pan: 0.0, gain: 0.04 },
];

for (const note of fluteNotes) {
  const startIdx = Math.floor(note.start * SAMPLE_RATE);
  const noteSamples = Math.floor(note.dur * SAMPLE_RATE);

  for (let s = 0; s < noteSamples; s++) {
    const idx = (startIdx + s) % NUM_SAMPLES;
    const t = s / SAMPLE_RATE;
    const progress = s / noteSamples;

    // Smooth bell-like envelope with slow attack and gentle fade
    let env = 1.0;
    if (progress < 0.25) {
      env = 0.5 * (1 - Math.cos((Math.PI * progress) / 0.25));
    } else if (progress > 0.65) {
      env = 0.5 * (1 + Math.cos((Math.PI * (progress - 0.65)) / 0.35));
    }

    // Pitch portamento (meend) and delicate vibrato (5.2 Hz)
    const currentBaseFreq = note.freq + (note.endFreq - note.freq) * (progress * progress);
    const vibrato = 1.0 + 0.007 * Math.sin(2 * Math.PI * 5.2 * t);
    const instantaneousFreq = currentBaseFreq * vibrato;

    // Bamboo flute harmonics (rich in odd harmonics, warm fundamental, breath air)
    const f = instantaneousFreq;
    const h1 = Math.sin(2 * Math.PI * f * t);
    const h2 = 0.35 * Math.sin(2 * Math.PI * 2 * f * t + 0.3);
    const h3 = 0.25 * Math.sin(2 * Math.PI * 3 * f * t + 0.7);
    const h4 = 0.10 * Math.sin(2 * Math.PI * 4 * f * t + 1.2);

    // Subtle breath noise component
    const breathNoise = (Math.random() * 2 - 1) * 0.04;

    const sample = (h1 + h2 + h3 + h4 + breathNoise) * env * note.gain;

    const panL = 0.5 * (1 - note.pan);
    const panR = 0.5 * (1 + note.pan);

    left[idx] += sample * panL;
    right[idx] += sample * panR;
  }
}

// 4. Meditative Singing Bowl / Temple Chime (t = 1.0s and t = 15.0s)
const bells = [
  { time: 1.0, freq: SA_TOP, pan: -0.4, gain: 0.06 },
  { time: 15.0, freq: PA_HIGH, pan: 0.4, gain: 0.05 },
];

for (const bell of bells) {
  const startIdx = Math.floor(bell.time * SAMPLE_RATE);
  const bellSamples = Math.floor(9.0 * SAMPLE_RATE); // 9 second ring

  for (let s = 0; s < bellSamples; s++) {
    const idx = (startIdx + s) % NUM_SAMPLES;
    const t = s / SAMPLE_RATE;

    const env = Math.exp(-t * 0.45);
    if (env <= 0.0001) continue;

    // Singing bowl harmonic partials
    const f = bell.freq;
    const p1 = Math.sin(2 * Math.PI * f * t);
    const p2 = 0.4 * Math.sin(2 * Math.PI * 2.76 * f * t);
    const p3 = 0.2 * Math.sin(2 * Math.PI * 5.40 * f * t);

    // Subtle binaural beat in the bowl
    const beat = 1.0 + 0.15 * Math.sin(2 * Math.PI * 2.2 * t);

    const sample = (p1 + p2 + p3) * env * bell.gain * beat;

    const panL = 0.5 * (1 - bell.pan);
    const panR = 0.5 * (1 + bell.pan);

    left[idx] += sample * panL;
    right[idx] += sample * panR;
  }
}

// 5. Seamless Crossfade at loop boundaries (1.5 second crossfade)
const crossfadeSamples = Math.floor(1.5 * SAMPLE_RATE);
for (let i = 0; i < crossfadeSamples; i++) {
  const weight = i / crossfadeSamples; // 0 -> 1
  const headIdx = i;
  const tailIdx = NUM_SAMPLES - crossfadeSamples + i;

  const blendL = left[tailIdx] * (1 - weight) + left[headIdx] * weight;
  const blendR = right[tailIdx] * (1 - weight) + right[headIdx] * weight;

  left[headIdx] = blendL;
  right[headIdx] = blendR;
  left[tailIdx] = blendL;
  right[tailIdx] = blendR;
}

// 6. Normalization & Soft Limiter
let maxPeak = 0;
for (let i = 0; i < NUM_SAMPLES; i++) {
  maxPeak = Math.max(maxPeak, Math.abs(left[i]), Math.abs(right[i]));
}

console.log(`Peak audio amplitude: ${maxPeak.toFixed(4)}`);
const targetPeak = 0.75; // Leave 2.5 dB headroom
const scale = targetPeak / Math.max(maxPeak, 0.01);

// Write WAV File (44.1 kHz, 16-bit Stereo PCM)
const blockAlign = NUM_CHANNELS * 2;
const byteRate = SAMPLE_RATE * blockAlign;
const dataSize = NUM_SAMPLES * blockAlign;
const buffer = Buffer.alloc(44 + dataSize);

// RIFF header
buffer.write('RIFF', 0);
buffer.writeUInt32LE(36 + dataSize, 4);
buffer.write('WAVE', 8);

// fmt subchunk
buffer.write('fmt ', 12);
buffer.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
buffer.writeUInt16LE(1, 20);  // AudioFormat (1 = PCM)
buffer.writeUInt16LE(NUM_CHANNELS, 22);
buffer.writeUInt32LE(SAMPLE_RATE, 24);
buffer.writeUInt32LE(byteRate, 28);
buffer.writeUInt16LE(blockAlign, 32);
buffer.writeUInt16LE(16, 34); // BitsPerSample

// data subchunk
buffer.write('data', 36);
buffer.writeUInt32LE(dataSize, 40);

let offset = 44;
for (let i = 0; i < NUM_SAMPLES; i++) {
  // Soft saturation limiter to prevent any clipping
  let sampleL = left[i] * scale;
  let sampleR = right[i] * scale;

  sampleL = Math.max(-0.99, Math.min(0.99, sampleL));
  sampleR = Math.max(-0.99, Math.min(0.99, sampleR));

  const intL = Math.floor(sampleL * 32767);
  const intR = Math.floor(sampleR * 32767);

  buffer.writeInt16LE(intL, offset);
  buffer.writeInt16LE(intR, offset + 2);
  offset += 4;
}

const outputPath = path.resolve('public/audio/sanctuary-ambient.wav');
fs.writeFileSync(outputPath, buffer);
console.log(`Successfully generated ambient sanctuary track: ${outputPath}`);
console.log(`Size: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB`);
