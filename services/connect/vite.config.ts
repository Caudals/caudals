import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { defineConfig, type Plugin } from 'vite';
import type { OutputBundle, OutputChunk } from 'rollup';
import { mediaPage } from './src/site/media.ts';
import { redirectFor, siteOutputs } from './src/site/routes.ts';
import { PEOPLE } from './src/data/people.ts';
import type { Assets } from './src/site/pages.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

const DEV_ASSETS: Assets = { css: [], js: '/src/client/main.ts', fonts: [], modulepreload: [] };

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? walk(file) : [file];
  });
}

/** Static chunks reachable from a chunk, depth first. */
function reachable(bundle: OutputBundle, start: string[], seen = new Set<string>()): string[] {
  for (const fileName of start) {
    if (seen.has(fileName)) continue;
    seen.add(fileName);
    const chunk = bundle[fileName];
    if (chunk && chunk.type === 'chunk') reachable(bundle, chunk.imports, seen);
  }
  return [...seen];
}

type Next = (error?: unknown) => void;

function serve(server: { transformIndexHtml?: (url: string, html: string) => Promise<string> }) {
  return async (req: IncomingMessage, res: ServerResponse, next: Next) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const redirect = redirectFor(url.pathname, req.headers['accept-language']);
      if (redirect) {
        res.statusCode = 302;
        res.setHeader('Location', redirect + url.search + url.hash);
        res.end();
        return;
      }
      if (!server.transformIndexHtml) {
        // Preview serves dist/ like nginx: directories resolve to index.html.
        if (url.pathname.endsWith('/')) req.url = `${url.pathname}index.html${url.search}`;
        return next();
      }
      if (url.pathname.startsWith('/__media/')) {
        const html = mediaPage(url);
        if (!html) return next();
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end(await server.transformIndexHtml(url.pathname, html));
        return;
      }
      const wanted = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
      const output = siteOutputs(DEV_ASSETS).find((o) => o.path === wanted);
      if (!output) return next();
      const body = output.type.startsWith('text/html')
        ? await server.transformIndexHtml(url.pathname, output.body)
        : output.body;
      res.setHeader('Content-Type', output.type);
      res.setHeader('Cache-Control', 'no-store');
      res.end(body);
    } catch (error) {
      next(error);
    }
  };
}

function connectSite(): Plugin {
  return {
    name: 'caudals-connect-site',
    configureServer(server) {
      server.middlewares.use(serve(server));
    },
    configurePreviewServer(server) {
      server.middlewares.use(serve({}));
    },
    generateBundle(_options, bundle) {
      const entry = Object.values(bundle).find(
        (item): item is OutputChunk => item.type === 'chunk' && item.isEntry && item.name === 'main',
      );
      if (!entry) throw new Error('connect: main entry chunk missing');
      const css = [...(entry.viteMetadata?.importedCss ?? [])];
      const lazy = reachable(bundle, entry.dynamicImports);
      const fileNames = Object.keys(bundle);
      const latinFonts = fileNames.filter((f) => /-latin-wght-normal[^/]*\.woff2$/.test(f));
      const assets: Assets = {
        css: css.map((f) => `/${f}`),
        js: `/${entry.fileName}`,
        fonts: latinFonts.filter((f) => /geist(-mono)?-latin-wght-normal/.test(f)).map((f) => `/${f}`),
        modulepreload: lazy.map((f) => `/${f}`),
      };

      const outputs = siteOutputs(assets);
      for (const out of outputs) {
        this.emitFile({ type: 'asset', fileName: out.path.slice(1), source: out.body });
      }

      const publicDir = join(root, 'public');
      const publicFiles = walk(publicDir)
        .map((f) => `/${relative(publicDir, f).split('\\').join('/')}`)
        .filter((f) => /^\/(favicon\.svg|icons\/(favicon-32|apple-touch-icon|icon-192)\.png)$/.test(f));
      const pages = outputs
        .filter((o) => o.path.endsWith('index.html') && !o.path.includes('/setup/'))
        .map((o) => o.path.replace(/index\.html$/, ''));
      const precache = [
        ...pages,
        ...outputs.filter((o) => /\.(vcf|webmanifest)$/.test(o.path)).map((o) => o.path),
        '/404.html',
        assets.js,
        ...assets.css,
        ...assets.modulepreload,
        ...latinFonts.map((f) => `/${f}`),
        ...publicFiles,
      ];
      const version = createHash('sha256').update(JSON.stringify([fileNames.sort(), outputs.map((o) => o.body)])).digest('hex').slice(0, 12);
      const sw = readFileSync(join(root, 'src/sw.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__PRECACHE__', JSON.stringify(precache))
        .replace('__PEOPLE__', PEOPLE.map((p) => p.id).join('|'));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: sw });
    },
  };
}

export default defineConfig({
  root,
  appType: 'custom',
  publicDir: 'public',
  plugins: [connectSite()],
  server: { host: '127.0.0.1', port: 4190, strictPort: true },
  preview: { host: '127.0.0.1', port: 4191, strictPort: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: ['es2022', 'safari15'],
    cssTarget: ['safari15'],
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
    sourcemap: false,
    reportCompressedSize: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: { main: join(root, 'src/client/main.ts') },
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
