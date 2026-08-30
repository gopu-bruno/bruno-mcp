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
        'Read the full definition of one request from a Bruno collection, as stored on disk. ' +
        'Returns its method, URL, headers, query and path params, body, auth, pre-request and post-response scripts, tests, assertions, variables, docs and settings. ' +
        'list_requests deliberately returns only enough to identify and address a request; call this when you need to know what a request actually does before running or changing it. ' +
        'This reads the file, it does not send anything; use execute_request to run it.',
      inputSchema: {
        collectionPath: collectionPathSchema(),
        requestPath: z
          .string()
          .describe('Relative path of the request inside the collection, as returned by list_requests (e.g. "users/get-user.bru").')
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
            error: `Request not found in collection "${collection.name}": ${requestPath}`,
            hint: 'Use the exact relativePath from list_requests.',
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
            hint: 'The file may be malformed or not a Bruno request.'
          },
          true
        );
      }
    }
  );
};
