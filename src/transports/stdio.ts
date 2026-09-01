import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from '../server.js';
import * as log from '../log.js';
import type { DiscoveryConfig } from '../types.js';

// Redirect console.log to stderr so stdout remains reserved for JSON-RPC
export const redirectConsoleLogToStderr = (): void => {
  console.log = console.error;
};

interface StartStdioServerArgs {
  config: DiscoveryConfig;
}

export const startStdioServer = async ({ config }: StartStdioServerArgs): Promise<void> => {
  const server = createServer({ config });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.debug('stdio server ready');
};
