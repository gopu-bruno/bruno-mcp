import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

import type { RunOptions, VariableOverrides } from '../types.js';

const require = createRequire(import.meta.url);
const BRU_BIN: string = require.resolve('@usebruno/cli/bin/bru.js');

const DEFAULT_TIMEOUT_MS = 120 * 1000;

let sessionTmpDir: string | null = null;

const getSessionTmpDir = (): string => {
  if (sessionTmpDir && fs.existsSync(sessionTmpDir)) return sessionTmpDir;
  sessionTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bruno-mcp-'));
  return sessionTmpDir;
};

const cleanupSessionTmpDir = (): void => {
  if (sessionTmpDir) {
    try {
      fs.rmSync(sessionTmpDir, { recursive: true, force: true });
    } catch (_) { }
    sessionTmpDir = null;
  }
};

let cleanupRegistered = false;
const registerCleanup = (): void => {
  if (cleanupRegistered) return;
  cleanupRegistered = true;
  process.once('exit', cleanupSessionTmpDir);
};

// Build the `bru run` argv from the run options.
const buildRunArgs = (
  paths: string[],
  { environment, variables }: RunOptions = {},
  reportPath: string
): string[] => {
  const args = ['run', ...paths, '--reporter-json', reportPath];

  if (environment) args.push('--env', String(environment));

  if (variables && typeof variables === 'object') {
    for (const [name, value] of Object.entries(variables)) {
      // Name should not contain '=' as it will be split on the first '='
      if (String(name).includes('=')) {
        throw new Error(`variable name must not contain '=': ${name}`);
      }
      args.push('--env-var', `${name}=${value}`);
    }
  }

  return args;
};

const formatBody = (body: unknown): string | null => {
  if (body == null) return null;
  return typeof body === 'string' ? body : JSON.stringify(body);
};

const formatResponse = (response: any) => {
  if (!response) return null;
  return {
    status: response.status,
    statusText: response.statusText,
    responseTimeMs: response.responseTime,
    headers: response.headers || null,
    body: formatBody(response.data)
  };
};

const formatResultEntry = (entry: any) => {
  const rawRequest = entry && entry.request ? entry.request : null;
  const request = rawRequest
    ? { method: rawRequest.method, url: rawRequest.url ?? null, headers: rawRequest.headers || null }
    : null;
  const response = formatResponse(entry && entry.response ? entry.response : null);
  const responseOk = response && typeof response.status === 'number' && response.status > 0;
  return {
    path: (entry && entry.path) || null,
    ok: Boolean(responseOk),
    request,
    response,
    assertionResults: entry ? entry.assertionResults : null,
    testResults: entry ? entry.testResults : null,
    error: entry && entry.error ? entry.error : null
  };
};

const diagnosticsOf = (stderr: string, stdout: string, reportParseError: string | null) => {
  return {
    reportParseError: reportParseError || null,
    stderr: stderr && stderr.trim() ? stderr.trim() : null,
    stdoutTail: stdout && stdout.trim() ? stdout.trim().split('\n').slice(-20).join('\n') : null
  };
};

interface RawRunResult {
  exitCode: number | null;
  report: any;
  stderr: string;
  stdout: string;
  reportParseError: string | null;
}

const normalizeReport = (report: any): { entries: any[]; summary: any } => {
  const iterations = Array.isArray(report) ? report : [];
  const entries = iterations.flatMap((iteration) =>
    iteration && Array.isArray(iteration.results) ? iteration.results : []
  );
  const first = iterations[0];
  const summary = first && first.summary != null ? first.summary : null;
  return { entries, summary };
};

export const formatResult = ({ exitCode, report, stderr, stdout, reportParseError }: RawRunResult) => {
  const { entries, summary } = normalizeReport(report);
  const entry = formatResultEntry(entries.length > 0 ? entries[0] : null);
  const diagnostics = diagnosticsOf(stderr, stdout, reportParseError);
  const error = entry.error ?? (entries.length === 0 && exitCode !== 0 ? diagnostics.stderr : null);
  return {
    exitCode,
    ok: Boolean(exitCode === 0 && entry.ok),
    request: entry.request,
    response: entry.response,
    assertionResults: entry.assertionResults,
    testResults: entry.testResults,
    error,
    summary,
    diagnostics
  };
};

interface RunBruArgs {
  collectionPath: string;
  paths: string[];
  options?: RunOptions;
  verbose?: boolean;
  timeoutMs?: number;
}

// Spawn `bru run` for the given paths + options.
const runBru = async ({
  collectionPath,
  paths,
  options = {},
  verbose = false,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: RunBruArgs): Promise<RawRunResult> => {
  const dir = getSessionTmpDir();
  registerCleanup();
  const reportPath = path.join(dir, `report-${crypto.randomBytes(8).toString('hex')}.json`);
  const args = buildRunArgs(paths, options, reportPath);

  if (verbose) process.stderr.write(`[bruno-mcp] spawn: node ${BRU_BIN} ${args.join(' ')} (cwd=${collectionPath})\n`);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];
  const child = spawn(process.execPath, [BRU_BIN, ...args], { cwd: collectionPath });

  child.stdout.on('data', (chunk) => stdoutChunks.push(chunk));
  child.stderr.on('data', (chunk) => stderrChunks.push(chunk));

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    // Kill the spawned bru process if it becomes unresponsive
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`Request execution timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.on('exit', (code) => { clearTimeout(timer); resolve(code); });
  });

  const stdout = Buffer.concat(stdoutChunks).toString('utf8');
  const stderr = Buffer.concat(stderrChunks).toString('utf8');

  let report: any = null;
  let reportParseError: string | null = null;
  if (fs.existsSync(reportPath)) {
    try {
      report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    } catch (err: any) {
      reportParseError = err.message;
    } finally {
      try { fs.unlinkSync(reportPath); } catch (_) { }
    }
  }

  return { exitCode, report, stderr, stdout, reportParseError };
};

interface ExecuteRequestArgs {
  collectionPath: string;
  requestPath: string;
  environment?: string;
  variables?: VariableOverrides;
  verbose?: boolean;
  timeoutMs?: number;
}

// Execute a single request with the given paths and options.
export const executeRequest = async ({
  collectionPath,
  requestPath,
  environment,
  variables,
  verbose = false,
  timeoutMs = DEFAULT_TIMEOUT_MS
}: ExecuteRequestArgs) => {
  const raw = await runBru({ collectionPath, paths: [requestPath], options: { environment, variables }, verbose, timeoutMs });
  return formatResult(raw);
};
