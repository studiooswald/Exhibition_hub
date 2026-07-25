// Gesund ist der Bot, wenn sein Lebenszeichen frisch ist. Ein aufgehängtes
// Polling fällt damit auf, statt still als "läuft" durchzugehen.
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.env.DATA_DIR || './data', 'heartbeat');
const MAX_AGE_MS = 5 * 60 * 1000;

try {
  const beat = Number(fs.readFileSync(file, 'utf8'));
  process.exit(Date.now() - beat < MAX_AGE_MS ? 0 : 1);
} catch {
  process.exit(1);
}
