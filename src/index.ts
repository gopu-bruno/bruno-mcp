#!/usr/bin/env node
import { hideBin } from 'yargs/helpers';

import { parseArgs, validateConfig } from './config.js';
import { startStdioServer } from './transports/stdio.js';
import { discoverCollections } from './core/discover.js';

const log = (msg: string): void => {
  process.stderr.write(`[bruno-mcp] ${msg}\n`);
};

const { config, verbose } = parseArgs(hideBin(process.argv));

const errors = validateConfig(config);
if (errors.length > 0) {
  for (const msg of errors) process.stderr.write(`bruno-mcp: ${msg}\n`);
  process.exit(1);
}

const { collections, source, diagnostics } = discoverCollections(config);

if (verbose) {
  for (const d of diagnostics) log(d);
  log(`resolved ${collections.length} collection${collections.length === 1 ? '' : 's'} from source: ${source ?? 'none'}`);
}

if (collections.length === 0) {
  log(
    'no collections registered. Pass --collection <path> / --workspace <path>, or launch from inside a Bruno project. Auto-discovery of Bruno desktop collections is on but found nothing (open a collection in the Bruno app, or pass --no-auto-discovery to silence this fallback).'
  );
}

startStdioServer({ config, verbose }).catch((err) => {
  process.stderr.write(`bruno-mcp: fatal error: ${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
