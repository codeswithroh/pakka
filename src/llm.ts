// Gemma 4 E2B, running on the baker's own device.
// MediaPipe LLM Inference on WebGPU, weights streamed from Hugging Face once and kept in the
// Cache API, so the second visit works with no signal and chats never leave the phone.
import { FilesetResolver, LlmInference } from '@mediapipe/tasks-genai';

const MODEL_URL =
  import.meta.env.VITE_GEMMA_MODEL_URL ??
  'https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/gemma-4-E2B-it-web.litertlm';
const WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-genai@0.10.29/wasm';
const CACHE = 'pakka-models';

export type Progress = (msg: string, fraction?: number) => void;

let llm: LlmInference | null = null;
let loading: Promise<void> | null = null;

export async function hasWebGpu(): Promise<boolean> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<unknown> } }).gpu;
    return !!(gpu && (await gpu.requestAdapter()));
  } catch {
    return false;
  }
}

export async function modelIsCached(): Promise<boolean> {
  try {
    return !!(await (await caches.open(CACHE)).match(MODEL_URL));
  } catch {
    return false;
  }
}

async function modelStream(onProgress: Progress): Promise<ReadableStreamDefaultReader> {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(MODEL_URL);
  if (hit?.body) {
    onProgress('Waking Gemma up on this device…');
    return hit.body.getReader();
  }
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`Couldn't download Gemma (${res.status}).`);
  const total = Number(res.headers.get('content-length')) || 0;
  let loaded = 0;
  const counted = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, ctrl) {
        loaded += chunk.byteLength;
        if (total) onProgress(`Downloading Gemma, one time only · ${(loaded / 1e9).toFixed(2)} of ${(total / 1e9).toFixed(1)} GB`, loaded / total);
        ctrl.enqueue(chunk);
      },
    }),
  );
  await navigator.storage?.persist?.().catch(() => false);
  const { quota = 0, usage = 0 } = (await navigator.storage?.estimate?.()) ?? {};
  if (total && quota - usage < total * 1.1) return counted.getReader();
  const [toCache, toModel] = counted.tee();
  cache.put(MODEL_URL, new Response(toCache, { headers: res.headers })).catch(console.warn);
  return toModel.getReader();
}

export function loadGemma(onProgress: Progress): Promise<void> {
  loading ??= (async () => {
    const genai = await FilesetResolver.forGenAiTasks(WASM_URL);
    llm = await LlmInference.createFromOptions(genai, {
      baseOptions: { modelAssetBuffer: await modelStream(onProgress) },
      maxTokens: 4096,
      topK: 1, // greedy: the same chat gives the same sheet every time
      temperature: 0,
      randomSeed: 1,
    });
  })().catch((e) => {
    loading = null;
    throw e;
  });
  return loading;
}

export async function generate(prompt: string): Promise<string> {
  if (!llm) throw new Error('Gemma is not loaded');
  // MediaPipe does not apply the chat template; without turn markers Gemma 4 returns "".
  return llm.generateResponse(`<|turn>user\n${prompt}<turn|>\n<|turn>model\n`);
}
