import { defineConfig, type Plugin } from 'vite';
import fs from 'node:fs';

// Dev only: lets eval.html write its results to eval/results/ so they can be committed.
const saveEval = (): Plugin => ({
  name: 'save-eval',
  configurePreviewServer(server) {
    server.middlewares.use('/__save-eval', (req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        fs.mkdirSync('eval/results', { recursive: true });
        fs.writeFileSync(`eval/results/run-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, body);
        res.end('ok');
      });
    });
  },
});

export default defineConfig({
  // MediaPipe ships its own WASM; keep it out of the dep optimizer.
  optimizeDeps: { exclude: ['@mediapipe/tasks-genai'] },
  plugins: [saveEval()],
  build: { rollupOptions: { input: { main: 'index.html', eval: 'eval.html' } } },
});
