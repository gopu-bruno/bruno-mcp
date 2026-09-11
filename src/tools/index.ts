import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import type { ToolContext } from './helpers.js';
import { registerListCollectionsTool } from './list-collections.js';
import { registerListRequestsTool } from './list-requests.js';
import { registerGetRequestTool } from './get-request.js';
import { registerExecuteRequestTool } from './execute-request.js';

export const registerTools = (server: McpServer, ctx: ToolContext): void => {
  registerListCollectionsTool(server, ctx);
  registerListRequestsTool(server, ctx);
  registerGetRequestTool(server, ctx);
  registerExecuteRequestTool(server, ctx);
};

export type { ToolContext } from './helpers.js';
