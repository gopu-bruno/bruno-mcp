import path from 'node:path';
import fs from 'node:fs';
import { parseFolder, parseRequest, redactLargeBruTextBlocks } from '@usebruno/filestore';

import type { RequestInfo } from '../types.js';
import * as log from '../log.js';

export type CollectionFormat = 'bru' | 'yml';

export const FORMAT_FILES: Record<CollectionFormat, { ext: string; collectionFile: string; folderFile: string }> = {
  yml: { ext: '.yml', collectionFile: 'opencollection.yml', folderFile: 'folder.yml' },
  bru: { ext: '.bru', collectionFile: 'collection.bru', folderFile: 'folder.bru' }
};

export const detectFormat = (collectionPath: string): CollectionFormat | null => {
  if (fs.existsSync(path.join(collectionPath, 'opencollection.yml'))) return 'yml';
  if (fs.existsSync(path.join(collectionPath, 'bruno.json'))) return 'bru';
  return null;
};

export const isRequestFile = (collectionPath: string, filePath: string, format: CollectionFormat): boolean => {
  const { ext, collectionFile, folderFile } = FORMAT_FILES[format];
  if (path.extname(filePath) !== ext) return false;

  const base = path.basename(filePath);
  if (base === collectionFile || base === folderFile) return false;

  // Root `environments` only, a nested folder of that name holds ordinary requests.
  const segments = path.relative(collectionPath, filePath).split(path.sep);
  return segments[0] !== 'environments';
};

export const parseRequestFile = (filePath: string, format: CollectionFormat): any =>
  parseRequest(fs.readFileSync(filePath, 'utf8'), { format });

const readFolderSeq = (dir: string, format: CollectionFormat): number | undefined => {
  const folderPath = path.join(dir, FORMAT_FILES[format].folderFile);
  if (!fs.existsSync(folderPath)) return undefined;
  try {
    const parsed = parseFolder(fs.readFileSync(folderPath, 'utf8'), { format });
    // The .bru parser returns a rejected promise on malformed files instead of throwing.
    if (typeof parsed?.then === 'function') {
      parsed.catch(() => {});
      return undefined;
    }
    return parsed?.meta?.seq;
  } catch (_) {
    return undefined;
  }
};

// folders first (by seq, then name), then requests by seq: mirrors how Bruno lists a collection
const bySeqThenName = (a: any, b: any): number => {
  const sa = typeof a.seq === 'number' ? a.seq : Infinity;
  const sb = typeof b.seq === 'number' ? b.seq : Infinity;
  return sa !== sb ? sa - sb : String(a.name).localeCompare(String(b.name));
};

interface ScannedRequest {
  name: string;
  type: string | null;
  seq: number | undefined;
  method: string | null;
  url: string | null;
}

type IndexedRequest = ScannedRequest & { pathname: string };
interface IndexedFolder {
  name: string;
  pathname: string;
  seq: number | undefined;
}

const REQUEST_TYPES: Record<string, string> = {
  http: 'http-request',
  graphql: 'graphql-request',
  grpc: 'grpc-request',
  ws: 'ws-request'
};

const META_BLOCK = /^meta[ \t]*\{([\s\S]*?)^\}/m;
const VERB_BLOCK = /^(get|post|put|delete|patch|head|options|trace|connect)[ \t]*\{([\s\S]*?)^\}/m;
const HTTP_BLOCK = /^http[ \t]*\{([\s\S]*?)^\}/m;
const GRPC_BLOCK = /^grpc[ \t]*\{([\s\S]*?)^\}/m;
const WS_BLOCK = /^ws[ \t]*\{([\s\S]*?)^\}/m;

const FIELD = {
  name: /^[ \t]*name:[ \t]*(.*)$/m,
  type: /^[ \t]*type:[ \t]*(.*)$/m,
  seq: /^[ \t]*seq:[ \t]*(\d+)[ \t]*$/m,
  url: /^[ \t]*url:[ \t]*(.*)$/m,
  method: /^[ \t]*method:[ \t]*(.*)$/m
};

const field = (block: string, pattern: RegExp): string | null => {
  const match = block.match(pattern);
  const value = match ? match[1].trim() : '';
  return value.length > 0 ? value : null;
};

const BLOCK_OPEN = /^[A-Za-z][\w:.-]*[ \t]*\{[ \t]*$/gm;
const BLOCK_CLOSE = /^\}[ \t]*$/gm;

// Mismatched counts mean a file which the grammar would reject.
const bracesBalanced = (skeleton: string): boolean =>
  (skeleton.match(BLOCK_OPEN) || []).length === (skeleton.match(BLOCK_CLOSE) || []).length;

interface ScannedProtocol {
  method: string | null;
  url: string | null;
}

const protocolOf = (skeleton: string): ScannedProtocol | null => {
  const verb = skeleton.match(VERB_BLOCK);
  if (verb) return { method: verb[1].toUpperCase(), url: field(verb[2], FIELD.url) };

  const http = skeleton.match(HTTP_BLOCK);
  if (http) return { method: field(http[1], FIELD.method)?.toUpperCase() ?? null, url: field(http[1], FIELD.url) };

  // gRPC method paths are case-sensitive, so they are reported exactly as written.
  const grpc = skeleton.match(GRPC_BLOCK);
  if (grpc) return { method: field(grpc[1], FIELD.method), url: field(grpc[1], FIELD.url) };

  const ws = skeleton.match(WS_BLOCK);
  if (ws) return { method: null, url: field(ws[1], FIELD.url) };

  return null;
};

const scanBruSkeleton = (content: string, filePath: string): ScannedRequest | null => {
  const { skeleton } = redactLargeBruTextBlocks(content);
  if (!bracesBalanced(skeleton)) return null;

  const protocol = protocolOf(skeleton);
  if (!protocol) return null;

  const meta = skeleton.match(META_BLOCK);
  const metaBlock = meta ? meta[1] : '';
  const seq = field(metaBlock, FIELD.seq);

  return {
    name: field(metaBlock, FIELD.name) || path.basename(filePath, '.bru'),
    type: REQUEST_TYPES[field(metaBlock, FIELD.type) || ''] || 'http-request',
    seq: seq !== null ? Number(seq) : meta ? 1 : undefined,
    method: protocol.method,
    url: protocol.url
  };
};

const normalizeMethod = (method: unknown, type: unknown): string | null => {
  if (typeof method !== 'string' || method.length === 0) return null;
  return type === 'grpc-request' ? method : method.toUpperCase();
};

const scanViaParse = (content: string, filePath: string, format: CollectionFormat): ScannedRequest | null => {
  try {
    const parsed =
      format === 'bru'
        ? parseRequest(redactLargeBruTextBlocks(content).skeleton, { format })
        : parseRequest(content, { format });
    return {
      name: parsed.name || path.basename(filePath, FORMAT_FILES[format].ext),
      type: parsed.type || 'http-request',
      seq: Number.isFinite(parsed.seq) ? parsed.seq : undefined,
      method: normalizeMethod(parsed.request?.method, parsed.type),
      url: parsed.request?.url || null
    };
  } catch (err: any) {
    log.warn(`skipping ${filePath}: ${err && err.message ? err.message : err}`);
    return null;
  }
};

const scanRequest = (filePath: string, format: CollectionFormat): ScannedRequest | null => {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err: any) {
    log.warn(`skipping ${filePath}: ${err && err.message ? err.message : err}`);
    return null;
  }

  if (format === 'bru') {
    const scanned = scanBruSkeleton(content, filePath);
    if (scanned) return scanned;
  }
  return scanViaParse(content, filePath, format);
};

const toPosixPath = (relativePath: string): string =>
  path.sep === '/' ? relativePath : relativePath.split(path.sep).join('/');

export const readCollectionIndex = (collectionPath: string): RequestInfo[] => {
  const format = detectFormat(collectionPath);
  if (!format) {
    throw new Error(`Not a Bruno collection: ${collectionPath}`);
  }

  const environmentsPath = path.join(collectionPath, 'environments');
  const index: RequestInfo[] = [];

  const traverse = (currentPath: string): void => {
    const folders: IndexedFolder[] = [];
    const requests: IndexedRequest[] = [];

    for (const file of fs.readdirSync(currentPath)) {
      const filePath = path.join(currentPath, file);
      const stats = fs.lstatSync(filePath);

      if (stats.isDirectory()) {
        if (filePath === environmentsPath || file === '.git' || file === 'node_modules') continue;
        folders.push({ name: file, pathname: filePath, seq: readFolderSeq(filePath, format) });
      } else {
        if (!isRequestFile(collectionPath, filePath, format)) continue;
        const scanned = scanRequest(filePath, format);
        if (scanned) requests.push({ ...scanned, pathname: filePath });
      }
    }

    for (const folder of folders.sort(bySeqThenName)) traverse(folder.pathname);
    for (const request of requests.sort(bySeqThenName)) {
      index.push({
        name: request.name,
        pathname: request.pathname,
        relativePath: toPosixPath(path.relative(collectionPath, request.pathname)),
        type: request.type,
        method: request.method,
        url: request.url
      });
    }
  };

  traverse(collectionPath);
  return index;
};
