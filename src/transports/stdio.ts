import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

import { createServer } from '../server.js';
import type { DiscoveryConfig } from '../types.js';

interface StartStdioServerArgs {
  config: DiscoveryConfig;
  verbose?: boolean;
}

export const startStdioServer = async ({ config, verbose = false }: StartStdioServerArgs): Promise<void> => {
  const server = createServer({ config, verbose });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  if (verbose) {
    process.stderr.write('[bruno-mcp] stdio server ready\n');
  }
};
