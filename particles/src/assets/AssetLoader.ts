/**
 * Streamed model loading with true byte-level progress (LoadingManager
 * progress is unreliable behind content-encoding), then GLTFLoader.parse with
 * the meshopt decoder three already ships.
 */

import type { Object3D } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const HEAD_URL = '/models/head.glb';
const GLASSES_URL = '/models/glasses.glb';

// fallback weights when content-length is hidden by the server
const FALLBACK_BYTES: Record<string, number> = {
  [HEAD_URL]: 1_750_000,
  [GLASSES_URL]: 125_000,
};

async function fetchWithProgress(
  url: string,
  onBytes: (received: number, total: number) => void,
): Promise<ArrayBuffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`failed to fetch ${url}: ${res.status}`);
  const total = Number(res.headers.get('content-length')) || FALLBACK_BYTES[url] || 1_000_000;
  if (!res.body) {
    const buf = await res.arrayBuffer();
    onBytes(total, total);
    return buf;
  }
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.byteLength;
    onBytes(Math.min(received, total), total);
  }
  const out = new Uint8Array(received);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  onBytes(total, total);
  return out.buffer;
}

export interface LoadedModels {
  headRoot: Object3D;
  glassesRoot: Object3D;
}

export async function loadModels(onProgress: (frac: number) => void): Promise<LoadedModels> {
  const totals: Record<string, { received: number; total: number }> = {
    [HEAD_URL]: { received: 0, total: FALLBACK_BYTES[HEAD_URL] },
    [GLASSES_URL]: { received: 0, total: FALLBACK_BYTES[GLASSES_URL] },
  };
  const report = () => {
    let received = 0;
    let total = 0;
    for (const t of Object.values(totals)) {
      received += t.received;
      total += t.total;
    }
    onProgress(total > 0 ? received / total : 0);
  };
  const track = (url: string) => (received: number, total: number) => {
    totals[url] = { received, total };
    report();
  };

  const [headBuf, glassesBuf] = await Promise.all([
    fetchWithProgress(HEAD_URL, track(HEAD_URL)),
    fetchWithProgress(GLASSES_URL, track(GLASSES_URL)),
  ]);

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const [head, glasses] = await Promise.all([
    loader.parseAsync(headBuf, ''),
    loader.parseAsync(glassesBuf, ''),
  ]);

  return { headRoot: head.scene, glassesRoot: glasses.scene };
}
