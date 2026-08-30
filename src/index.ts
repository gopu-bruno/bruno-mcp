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
  log(`Found ${collections.length} collection${collections.length === 1 ? '' : 's'} (source: ${source ?? 'none'})`);
}

if (collections.length === 0) {
  log(
    'No collections found. Available options:\n' +
    '  --collection <path>   Pass a collection path\n' +
    '  --workspace <path>    Pass a workspace path\n' +
    '  Or run from inside a Bruno project folder.\n' +
    'Auto-discovery checked recent collections but found none. ' +
    'Use --no-auto-discovery to skip this check.'
  );
}

startStdioServer({ config, verbose }).catch((err) => {
  process.stderr.write(`bruno-mcp: Something went wrong while starting the server:\n${err && err.stack ? err.stack : err}\n`);
  process.exit(1);
});

process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
