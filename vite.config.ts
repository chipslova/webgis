import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  if (env.GEMINI_API_KEY && !process.env.GEMINI_API_KEY) {
    process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;
  }

  return {
    publicDir: 'public',
    server: {
      port: 3000,
      open: false,
      host: true
    },
    plugins: [
      {
        name: 'vite-plugin-gemini-api',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url && req.url.startsWith('/api/gemini-navigator')) {
              try {
                let raw = '';
                for await (const chunk of req) {
                  raw += chunk;
                }
                if (raw) {
                  try {
                    (req as any).body = JSON.parse(raw);
                  } catch {
                    (req as any).body = raw;
                  }
                }
                const { default: geminiHandler } = await import('./api/gemini-navigator');
                await geminiHandler(req, res);
              } catch (err: any) {
                res.statusCode = 500;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: err?.message || 'API middleware error' }));
              }
            } else {
              next();
            }
          });
        }
      }
    ],
    optimizeDeps: {
      exclude: ['maplibre-gl']
    },
    build: {
      outDir: 'dist',
      target: 'es2022',
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            maplibre: ['maplibre-gl'],
            'turf-measure': ['@turf/area', '@turf/length', '@turf/helpers'],
            'spatial-buffer': ['@turf/buffer', '@/tools/spatial-buffer'],
            pmtiles: ['pmtiles']
          }
        }
      }
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    }
  };
});

