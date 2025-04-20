// src/utils/fileCache.ts
import * as fs from 'fs/promises'; // Keep async for the async version
import * as fsSync from 'fs'; // Add synchronous fs methods
import * as path from 'path';
import * as crypto from 'crypto';

// --- Configuration ---
const CACHE_BASE_DIR = path.join(process.cwd(), 'app-cache'); // Changed: Simplified base directory

// --- Helper Functions (shared) ---
function sanitizeFilename(filename: string): string {
  // This might still be useful if subDir names have weird chars, but not for the main key anymore
  return filename.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
}

// New helper to generate filename from a hash of the key
function generateCacheFilename(key: string): string {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return `${hash}.json`; // Use the hash as the filename
}

export interface CacheOptions {
  subDir?: string;
  // ttl?: number; // Not implemented
}

// --- Async Caching Function (from previous example) ---
export async function withFileCache<T>(
  cacheKey: string,
  fetcherFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  // ... (implementation from previous response remains unchanged) ...

  if (!cacheKey) {
    console.warn("[Cache] Attempted to use async cache with an empty cacheKey. Skipping cache.");
    return fetcherFn();
  }

  const cacheDir = options.subDir ? path.join(CACHE_BASE_DIR, sanitizeFilename(options.subDir)) : CACHE_BASE_DIR; // Sanitize subDir if provided
  const filename = generateCacheFilename(cacheKey); // Changed: Use hash for filename
  const cacheFilePath = path.join(cacheDir, filename);

  // 1. Check Cache (Async)
  try {
    await fs.access(cacheFilePath, fs.constants.R_OK);
    console.log(`[Cache] Async Hit for key hash: ${filename.split('.')[0]} in ${options.subDir || 'base'}`); // Log hash part
    const cachedData = await fs.readFile(cacheFilePath, 'utf-8');
    return JSON.parse(cachedData) as T;
  } catch (error: unknown) {
    if (error instanceof Error && 'code' in error && error.code !== 'ENOENT') {
      console.error(`[Cache] Error reading async cache file ${cacheFilePath} for key hash ${filename.split('.')[0]}. Error: ${error}. Proceeding to fetch.`);
    } else {
      console.log(`[Cache] Async Miss for key hash: ${filename.split('.')[0]} in ${options.subDir || 'base'}. File not found.`); // Log hash part
    }
  }

  // 2. Fetch Data (Async)
  console.log(`[Cache] Fetching async data for key hash: ${filename.split('.')[0]}`); // Log hash part
  const result = await fetcherFn();

  // 3. Write to Cache (Async, fire-and-forget style)
  (async () => {
    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cacheFilePath, JSON.stringify(result, null, 2), 'utf-8');
      console.log(`[Cache] Stored async result for key hash: ${filename.split('.')[0]} in ${cacheFilePath}`); // Log hash part
    } catch (error) {
      console.error(`[Cache] Failed to write async cache file ${cacheFilePath} for key hash ${filename.split('.')[0]}. Error: ${error}`); // Log hash part
    }
  })();

  // 4. Return Fetched Result (Async)
  return result;
}


// --- NEW: Synchronous Caching Function ---
/**
 * Executes a synchronous function, caching its result to a file based on a hash of its key.
 * Subsequent calls with the same key will return the cached result if available.
 * Uses SYNCHRONOUS file operations for reading and writing.
 *
 * @param cacheKey A unique string identifier for this specific execution.
 * @param fetcherFn A synchronous function (taking no arguments) that produces the data.
 * @param options Optional configuration for the cache.
 * @returns The result of the fetcherFn, either fetched or from the cache.
 * @template T The expected type of the result (must be JSON serializable).
 */
export function withFileSyncCache<T>(
  cacheKey: string,
  fetcherFn: () => T, // Takes a sync function
  options: CacheOptions = {}
): T { // Returns T directly

  if (!cacheKey) {
    console.warn("[Cache] Attempted to use sync cache with an empty cacheKey. Skipping cache.");
    return fetcherFn();
  }

  const cacheDir = options.subDir ? path.join(CACHE_BASE_DIR, sanitizeFilename(options.subDir)) : CACHE_BASE_DIR; // Sanitize subDir if provided
  const filename = generateCacheFilename(cacheKey); // Changed: Use hash for filename
  const cacheFilePath = path.join(cacheDir, filename);

  // 1. Check Cache (Sync)
  if (fsSync.existsSync(cacheFilePath)) {
    console.log(`[Cache] Sync Hit for key hash: ${filename.split('.')[0]} in ${options.subDir || 'base'}`); // Log hash part
    try {
      const cachedData = fsSync.readFileSync(cacheFilePath, 'utf-8');
      return JSON.parse(cachedData) as T;
    } catch (error) {
      console.error(`[Cache] Error reading or parsing sync cache file ${cacheFilePath} for key hash ${filename.split('.')[0]}. Error: ${error}. Proceeding to execute function.`); // Log hash part
      // Fall through to execute the function if cache is corrupt
    }
  } else {
    console.log(`[Cache] Sync Miss for key hash: ${filename.split('.')[0]} in ${options.subDir || 'base'}. File not found.`); // Log hash part
  }

  // 2. Execute Function (Sync - Cache Miss or Read Error)
  console.log(`[Cache] Executing sync function for key hash: ${filename.split('.')[0]}`); // Log hash part
  const result = fetcherFn(); // Call the synchronous function

  // 3. Write to Cache (Sync)
  try {
    fsSync.mkdirSync(cacheDir, { recursive: true });
    fsSync.writeFileSync(cacheFilePath, JSON.stringify(result, null, 2), 'utf-8');
    console.log(`[Cache] Stored sync result for key hash: ${filename.split('.')[0]} in ${cacheFilePath}`); // Log hash part
  } catch (error) {
    // Log error, but the result has already been generated, so we still return it.
    console.error(`[Cache] Failed to write sync cache file ${cacheFilePath} for key hash ${filename.split('.')[0]}. Error: ${error}`); // Log hash part
  }

  // 4. Return Fetched Result (Sync)
  return result;
}