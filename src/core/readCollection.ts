import path from 'node:path';
import fs from 'node:fs';
import { parseFolder, parseRequest } from '@usebruno/filestore';

type CollectionFormat = 'bru' | 'yml';

const FORMAT_FILES: Record<CollectionFormat, { ext: string; collectionFile: string; folderFile: string }> = {
  yml: { ext: '.yml', collectionFile: 'opencollection.yml', folderFile: 'folder.yml' },
  bru: { ext: '.bru', collectionFile: 'collection.bru', folderFile: 'folder.bru' }
};

const detectFormat = (collectionPath: string): CollectionFormat | null => {
  if (fs.existsSync(path.join(collectionPath, 'opencollection.yml'))) return 'yml';
  if (fs.existsSync(path.join(collectionPath, 'bruno.json'))) return 'bru';
  return null;
};

const readFolderSeq = (dir: string, format: CollectionFormat): number | undefined => {
  const folderPath = path.join(dir, FORMAT_FILES[format].folderFile);
  if (!fs.existsSync(folderPath)) return undefined;
  try {
    return parseFolder(fs.readFileSync(folderPath, 'utf8'), { format })?.meta?.seq;
  } catch (_) {
    return undefined;
  }
};

// folders first (by seq, then name), then requests by seq — mirrors how Bruno lists a collection
const bySeqThenName = (a: any, b: any): number => {
  const sa = typeof a.seq === 'number' ? a.seq : Infinity;
  const sb = typeof b.seq === 'number' ? b.seq : Infinity;
  return sa !== sb ? sa - sb : String(a.name).localeCompare(String(b.name));
};

/**
 * Walk a Bruno collection directory and return its parsed folder/request tree. Reuses
 * @usebruno/filestore's parsers so parsing stays identical to the rest of Bruno; the traversal
 * lives here because the MCP server only needs the tree, not Bruno's watcher/UUID machinery.
 * Throws if the path isn't a collection root; malformed request files are skipped.
 */
export const readCollectionItems = (collectionPath: string): any[] => {
  const format = detectFormat(collectionPath);
  if (!format) {
    throw new Error(`Not a Bruno collection: ${collectionPath}`);
  }

  const { ext, collectionFile, folderFile } = FORMAT_FILES[format];
  const environmentsPath = path.join(collectionPath, 'environments');

  const traverse = (currentPath: string): any[] => {
    const folders: any[] = [];
    const requests: any[] = [];

    for (const file of fs.readdirSync(currentPath)) {
      const filePath = path.join(currentPath, file);
      const stats = fs.lstatSync(filePath);

      if (stats.isDirectory()) {
        if (filePath === environmentsPath || file === '.git' || file === 'node_modules') continue;
        folders.push({
          name: file,
          pathname: filePath,
          type: 'folder',
          seq: readFolderSeq(filePath, format),
          items: traverse(filePath)
        });
      } else {
        if (file === collectionFile || file === folderFile || path.extname(filePath) !== ext) continue;
        try {
          const requestItem = parseRequest(fs.readFileSync(filePath, 'utf8'), { format });
          requests.push({ name: file, ...requestItem, pathname: filePath });
        } catch (_) {
          // skip files that don't parse — a client should stay robust to malformed collections
        }
      }
    }

    return [...folders.sort(bySeqThenName), ...requests.sort(bySeqThenName)];
  };

  return traverse(collectionPath);
};
