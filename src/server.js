import { config, assertConfig } from './config.js';
import { createApp } from './app.js';
import { startBackupSchedule } from './db.js';

assertConfig();

startBackupSchedule();

createApp().listen(config.port, () => {
  console.log(
    `Exhibition Hub läuft auf Port ${config.port}` +
      `${config.mock ? ' (MOCK-Modus, ohne API-Key)' : ''}`
  );
});
