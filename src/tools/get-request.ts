import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { parseRequestFile } from '../core/readCollection.js';
import { collectionPathSchema, textResult, unknownCollectionMessage, type ToolContext } from './helpers.js';

export const registerGetRequestTool = (server: McpServer, { registry }: ToolContext): void => {
  server.registerTool(
    'get_request',
    {
      title: 'Read a Bruno request definition',
      description:
        'Gets the full details of an API request without executing it. ' +
        'Returns the HTTP method, URL, headers, body, authentication, scripts, and tests. ' +
        'Use this to inspect what a request does before running it or to understand its configuration.',
      inputSchema: {
        collectionPath: collectionPathSchema(),
        requestPath: z
          .string()
          .describe('Relative path of the request inside the collection, as returned by list_requests (e.g. "users/get-user.bru").'),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ collectionPath, requestPath }) => {
      registry.refresh();
      const collection = registry.resolve(collectionPath);
      if (!collection) {
        return textResult(unknownCollectionMessage(registry, collectionPath), true);
      }

      const resolved = registry.resolveRequestPath(collectionPath, requestPath);
      if (!resolved) {
        return textResult(
          {
            error: `Request not found: "${requestPath}" in collection "${collection.name}"`,
            hint: 'Use the exact relative path from list_requests.',
            availableRequests: (registry.listRequests(collectionPath) || []).map((r) => r.relativePath)
          },
          true
        );
      }

      try {
        return textResult({
          relativePath: requestPath,
          request: parseRequestFile(resolved.path, resolved.format)
        });
      } catch (err: any) {
        return textResult(
          {
            error: `Could not parse request "${requestPath}": ${err && err.message ? err.message : String(err)}`,
            hint: 'The file may be corrupted or invalid.'
          },
          true
        );
      }
    }
  );
};
