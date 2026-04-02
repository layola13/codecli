import type { LogOption } from '../types/logs.js';

export function parseCcshareId(_input: string): string | null {
  return null;
}

export async function loadCcshare(_ccshareId: string): Promise<LogOption> {
  throw new Error(
    'ccshare resume is enabled in this build, but its internal implementation is not available in this repository.'
  );
}
