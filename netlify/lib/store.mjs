// Netlify Blobs, one set of stores for the live site and another for previews.
// Tests swap in an in-memory store with useTestStores().
import { getStore } from '@netlify/blobs';
import { scope } from './core.mjs';

let testStores = null;
export function useTestStores(map) { testStores = map; }

export function store(name, context) {
  const full = `${scope(context)}-${name}`;
  if (testStores) return (testStores[full] ||= memoryStore());
  return getStore({ name: full, consistency: 'strong' });
}

export function memoryStore() {
  const m = new Map();
  return {
    async get(k, o = {}) {
      if (!m.has(k)) return null;
      const { v } = m.get(k);
      if (o.type === 'json') return JSON.parse(typeof v === 'string' ? v : new TextDecoder().decode(v));
      if (o.type === 'arrayBuffer') return typeof v === 'string' ? new TextEncoder().encode(v).buffer : v;
      return typeof v === 'string' ? v : new TextDecoder().decode(v);
    },
    async getWithMetadata(k, o = {}) {
      if (!m.has(k)) return null;
      return { data: await this.get(k, o), metadata: m.get(k).meta || {} };
    },
    async set(k, v, o = {}) { m.set(k, { v: v instanceof ArrayBuffer ? v : (ArrayBuffer.isView(v) ? v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) : v), meta: o.metadata }); },
    async setJSON(k, v, o = {}) { m.set(k, { v: JSON.stringify(v), meta: o.metadata }); },
    async delete(k) { m.delete(k); },
    async list(o = {}) { return { blobs: [...m.keys()].filter((k) => !o.prefix || k.startsWith(o.prefix)).map((key) => ({ key })) }; },
  };
}
