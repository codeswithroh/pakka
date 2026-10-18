// Open /eval.html in a WebGPU browser. Same Gemma, same runtime as the app.
import { loadGemma, generate } from '../src/llm.ts';
import { runEval } from './bench.ts';

const out = document.querySelector('#log')!;
const log = (line: string) => {
  out.textContent += line + '\n';
  console.log(line);
};

document.querySelector('#go')!.addEventListener('click', async () => {
  await loadGemma((m) => (document.title = m));
  document.title = 'running';
  const only = (document.querySelector('#only') as HTMLInputElement).value.split(',').map((s) => s.trim()).filter(Boolean);
  const result = await runEval(generate, log, only);
  (window as unknown as { result: unknown }).result = result;
  document.title = 'done';
  await fetch('/__save-eval', { method: 'POST', body: JSON.stringify({ ua: navigator.userAgent, ...result }, null, 2) }).catch(() => {});
});
