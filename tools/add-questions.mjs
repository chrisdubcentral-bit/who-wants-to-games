// Adds a batch of questions written as plain text to an edition's Pending list.
//
//   node tools/add-questions.mjs <edition> <batch.txt> [--dry]
//
// One question per line, fields separated by " | ":
//   difficulty | category | question | correct answer | wrong | wrong | wrong | tag; tag
// Lines starting with # and blank lines are ignored. The answers are shuffled, the stage is chosen from the
// difficulty (the emptiest stage whose range fits) and every question goes through the same checks as the
// review page. Questions already in the edition (same wording) are skipped.
// Writes data/imports/<batch name>.json (the batch as first written) and appends to pending-questions.json.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [edition, batchFile, flag] = process.argv.slice(2);
if (!edition || !batchFile) { console.error('Usage: node tools/add-questions.mjs <edition> <batch.txt> [--dry]'); process.exit(1); }
const dry = flag === '--dry';

const load = (p) => import(pathToFileURL(path.join(ROOT, p)));
const { buildMeta } = await load('engine/js/core/config.js');
const { validateQuestion } = await load('engine/js/core/validation.js');
const { normalise, similarity } = await load('engine/js/core/utils.js');

const dir = path.join(ROOT, 'editions', edition, 'data');
const read = (p) => JSON.parse(fs.readFileSync(path.join(dir, p), 'utf8'));
const meta = buildMeta(read('meta/stages.json').stages, read('meta/categories.json').categories);
const files = Object.fromEntries(['pending', 'approved', 'rejected'].map((c) => [c, read(`questions/${c}-questions.json`)]));
const existing = Object.values(files).flatMap((f) => f.questions);

// A small seeded generator, so re-running a batch shuffles the answers the same way.
let seed = [...path.basename(batchFile)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };

const perStage = Object.fromEntries(meta.stages.map((s) => [s.key, existing.filter((q) => q.stage === s.key).length]));
const stageFor = (d) => {
  const fits = meta.stages.filter((s) => d >= s.difficulty[0] && d <= s.difficulty[1]);
  const pick = fits.sort((a, b) => perStage[a.key] - perStage[b.key])[0];
  perStage[pick.key]++;
  return pick.key;
};

const seen = new Map(existing.map((q) => [normalise(q.question), q]));
const lines = fs.readFileSync(batchFile, 'utf8').split(/\r?\n/);
const added = []; const problems = []; let skipped = 0; let near = 0;

lines.forEach((line, n) => {
  if (!line.trim() || line.trim().startsWith('#')) return;
  const f = line.split('|').map((s) => s.trim());
  const where = `line ${n + 1}`;
  if (f.length < 7 || f.length > 8) { problems.push(`${where}: expected 7 or 8 fields, found ${f.length}: ${line.slice(0, 80)}`); return; }
  const [d, category, question, correct, w1, w2, w3, tags = ''] = f;
  const key = normalise(question);
  if (seen.has(key)) { skipped++; return; }
  const difficulty = Number(d);
  if (!Number.isInteger(difficulty) || difficulty < 1 || difficulty > 5) { problems.push(`${where}: difficulty "${d}"`); return; }
  const order = [correct, w1, w2, w3].map((o, i) => ({ o, i, r: rand() })).sort((a, b) => a.r - b.r);
  const q = {
    schemaVersion: 1, club: meta.categoryByKey[category]?.club ?? edition, stage: stageFor(difficulty), category, difficulty,
    question, options: order.map((x) => x.o), correctAnswer: order.findIndex((x) => x.i === 0),
    tags: tags.split(';').map((t) => t.trim()).filter(Boolean), source: 'manual',
  };
  const result = validateQuestion(q, { meta, approved: [] });
  const warn = result.warnings.filter((w) => w.field !== 'difficulty');
  if (!result.valid || warn.length) {
    perStage[q.stage]--;
    problems.push(`${where}: ${[...result.errors, ...warn].map((e) => e.message).join(' ')} :: ${question}`);
    return;
  }
  for (const [text, other] of seen) {
    if (similarity(question, other.question) >= 0.8 && normalise(other.options[other.correctAnswer]) === normalise(correct)) {
      near++; console.log(`  similar (${where}): ${question}  <->  ${other.question}`); break;
    }
    void text;
  }
  seen.set(key, q);
  added.push(q);
});

if (problems.length) { console.error(problems.join('\n')); console.error(`\n${problems.length} problem line(s). Nothing written.`); process.exit(1); }

const byDifficulty = {}; added.forEach((q) => { byDifficulty[q.difficulty] = (byDifficulty[q.difficulty] ?? 0) + 1; });
console.log(`${added.length} new, ${skipped} already there, ${near} similar to another with the same answer (kept; listed above)`);
console.log('by difficulty', byDifficulty, '| by answer position', [0, 1, 2, 3].map((i) => added.filter((q) => q.correctAnswer === i).length));
if (dry) { console.log('Dry run: nothing written.'); process.exit(0); }

const now = new Date().toISOString();
let next = Math.max(0, ...existing.map((q) => parseInt(String(q.id).replace(/\D/g, ''), 10) || 0));
const write = (p, data) => fs.writeFileSync(path.join(dir, p), JSON.stringify(data, null, 2) + '\n');
write(`imports/${path.basename(batchFile).replace(/\.[^.]+$/, '')}.json`, added);
files.pending.questions.push(...added.map((q) => ({
  id: 'q_' + String(++next).padStart(6, '0'), ...q, status: 'pending', createdAt: now, updatedAt: now,
  review: { reviewedAt: null, rejectionReason: null, rejectionNote: null },
})));
files.pending.updatedAt = now;
write('questions/pending-questions.json', files.pending);
console.log(`Pending now holds ${files.pending.questions.length}. Per stage:`, perStage);
