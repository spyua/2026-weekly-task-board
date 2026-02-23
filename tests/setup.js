// Test helper — loads global-script source files into a sandboxed context
import { readFileSync } from 'fs';
import { createContext, runInContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const FILES = ['js/data.js', 'js/render.js', 'js/actions.js'];

/**
 * Build a fresh sandbox with all globals loaded.
 * Options:
 *   - currentMonth: override getCurrentMonth() return value
 */
export function createTestContext(opts = {}) {
  const sandbox = {
    // Minimal browser stubs
    Math,
    Date,
    Number,
    String,
    Array,
    Object,
    Set,
    JSON,
    parseInt,
    parseFloat,
    isNaN,
    console,
    confirm: () => true,
    alert: () => {},
    setTimeout: () => {},
    requestAnimationFrame: () => {},
    document: {
      getElementById: () => null,
      addEventListener: () => {},
      activeElement: null,
      body: {},
      querySelectorAll: () => [],
      createElement: () => ({ click() {}, style: {} }),
    },
    localStorage: {
      _store: {},
      getItem(k) { return this._store[k] ?? null; },
      setItem(k, v) { this._store[k] = v; },
      removeItem(k) { delete this._store[k]; },
    },
    URL: { createObjectURL: () => '', revokeObjectURL: () => {} },
    Blob: class {},
    FileReader: class {},
  };

  const ctx = createContext(sandbox);

  // Load source files in order
  for (const file of FILES) {
    const code = readFileSync(resolve(root, file), 'utf-8');
    runInContext(code, ctx, { filename: file });
  }

  // Override getCurrentMonth if requested
  if (opts.currentMonth) {
    runInContext(
      `getCurrentMonth = function(){ return ${JSON.stringify(opts.currentMonth)}; };`,
      ctx,
    );
  }

  // Mock render and saveLocal to no-op (prevent DOM access)
  runInContext('render = function(){};', ctx);
  runInContext('saveLocal = function(){};', ctx);

  return ctx;
}

/**
 * Evaluate an expression inside the sandbox and return its value.
 */
export function evalIn(ctx, code) {
  return runInContext(code, ctx);
}
