import path from 'node:path';

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { filterCollections } from '../core/collections.js';
import { textResult, type ToolContext } from './helpers.js';

export const registerListCollectionsTool = (server: McpServer, { registry }: ToolContext): void => {
  server.registerTool(
    'list_collections',
    {
      title: 'List Bruno collections',
      description:
        'List Bruno collections: by default the ones this server was configured or discovered to expose, ' +
        'or the ones registered in a particular workspace when "workspacePath" is given. ' +
        'Returns the name, filesystem path, and available environments for each. ' +
        'A collection is addressed by its path: pass the returned "path" as collectionPath to the other tools. ' +
        'Optionally filter by a search term (matched against name, path, and workspace name).',
      inputSchema: {
        workspacePath: z
          .string()
          .optional()
          .describe(
            'Absolute path to a Bruno workspace directory, the one containing workspace.yml. ' +
              'Lists the collections registered in that workspace instead of this server\'s own scope. ' +
              'Any workspace on this machine works, so a path the user names in conversation can be passed straight through.'
          ),
        search: z
          .string()
          .optional()
          .describe('Case-insensitive substring filter matched against collection name, path, and workspace name.')
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: false
      }
    },
    async ({ workspacePath, search }) => {
      registry.refresh();

      let workspace: { name: string; path: string } | null = null;
      let all;
      if (workspacePath) {
        const listed = registry.listWorkspace(workspacePath);
        if (!listed) {
          return textResult(
            {
              error: `Not a Bruno workspace: ${workspacePath}`,
              hint: 'workspacePath must be the directory containing workspace.yml. Omit it to list the collections this server was configured or discovered to expose.'
            },
            true
          );
        }
        workspace = { name: listed.name, path: path.resolve(workspacePath) };
        all = listed.collections;
      } else {
        all = registry.list();
      }

      const collections = filterCollections(all, { search });
      const noMatch = search && collections.length === 0 && all.length > 0;
      return textResult({
        ...(workspace ? { workspace } : {}),
        total: all.length,
        count: collections.length,
        filter: { search: search || null },
        ...(noMatch
          ? { hint: `No collections matched "${search}". Call list_collections without "search" to see all ${all.length}.` }
          : {}),
        ...(workspace && all.length === 0
          ? { hint: 'This workspace lists no collections.' }
          : {}),
        collections
      });
    }
  );
};
