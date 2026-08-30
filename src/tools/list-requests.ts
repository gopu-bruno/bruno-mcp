import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { filterRequests } from '../core/collections.js';
import { collectionPathSchema, textResult, unknownCollectionMessage, type ToolContext } from './helpers.js';

export const registerListRequestsTool = (server: McpServer, { registry }: ToolContext): void => {
  server.registerTool(
    'list_requests',
    {
      title: 'List requests in a Bruno collection',
      description:
        'List every request in the given collection, flattened across folders. ' +
        'Returns just enough to identify and address each one: the relative path used to invoke get_request and execute_request, the type (http-request, graphql-request, grpc-request, ws-request), plus method and URL when statically known. ' +
        'Call get_request for a single request\'s headers, body, auth, scripts and tests; those are deliberately not listed here, so this stays fast on large collections. ' +
        'Optionally filter by a search term (matched against name, path, and URL) and/or HTTP method.',
      inputSchema: {
        collectionPath: collectionPathSchema(),
        search: z
          .string()
          .optional()
          .describe('Case-insensitive substring filter matched against request name, relative path, and URL.'),
        method: z.string().optional().describe('Filter by HTTP method, e.g. "GET" or "post" (case-insensitive).')
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ collectionPath, search, method }) => {
      registry.refresh();
      const collection = registry.resolve(collectionPath);
      if (!collection) {
        return textResult(unknownCollectionMessage(registry, collectionPath), true);
      }
      const all = registry.listRequests(collectionPath) || [];
      const requests = filterRequests(all, { search, method });
      const noMatch = (search || method) && requests.length === 0 && all.length > 0;
      return textResult({
        total: all.length,
        count: requests.length,
        filter: { search: search || null, method: method || null },
        ...(noMatch
          ? { hint: `No requests matched the filter. Call list_requests without "search"/"method" to see all ${all.length}.` }
          : {}),
        requests
      });
    }
  );
};
