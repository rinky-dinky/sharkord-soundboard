import type { BunPlugin } from 'bun';
import fs from 'fs/promises';

const pluginId = 'sharkord-soundboard';
const outdir = `dist/${pluginId}`;

const clientGlobals: BunPlugin = {
  name: 'client-globals',
  setup(build) {
    const jsxRuntimeFactory = `(() => {
      const runtime = window.__SHARKORD_REACT_JSX__
        || window.__SHARKORD_REACT_JSX_DEV__
        || window.ReactJSX
        || null;
      const react = window.__SHARKORD_REACT__ || window.React || null;

      if (runtime?.jsx && runtime?.jsxs) {
        return runtime;
      }

      if (!react?.createElement) {
        return runtime || react || {};
      }

      const create = (type, props, key) => {
        const nextProps = props ? { ...props } : {};

        if (key !== undefined) {
          nextProps.key = key;
        }

        return react.createElement(type, nextProps);
      };

      return {
        jsx: create,
        jsxs: create,
        Fragment: react.Fragment
      };
    })()`;

    const globals: Record<string, string> = {
      react: 'window.__SHARKORD_REACT__',
      'react/jsx-runtime': jsxRuntimeFactory,
      'react/jsx-dev-runtime': `(() => {
        const runtime = ${jsxRuntimeFactory};

        if (!runtime?.jsxDEV && runtime?.jsx) {
          return {
            ...runtime,
            jsxDEV: (type, props, key) => runtime.jsx(type, { ...props, key })
          };
        }

        return runtime;
      })()`,
      'react-dom': 'window.__SHARKORD_REACT_DOM__',
      'react-dom/client': 'window.__SHARKORD_REACT_DOM_CLIENT__'
    };

    for (const [mod, global] of Object.entries(globals)) {
      build.onResolve({ filter: new RegExp(`^${mod.replace('/', '\\/')}$`) }, () => ({
        path: mod,
        namespace: 'client-global'
      }));

      build.onLoad(
        {
          filter: new RegExp(`^${mod.replace('/', '\\/')}$`),
          namespace: 'client-global'
        },
        () => ({
          contents: `module.exports = ${global};`,
          loader: 'js'
        })
      );
    }
  }
};

await Promise.all([
  Bun.build({
    entrypoints: ['src/server/index.ts'],
    outdir: `${outdir}/server`,
    naming: 'index.js',
    target: 'bun',
    minify: true,
    format: 'esm',
    external: ['react', 'react-dom', '@sharkord/plugin-sdk']
  }),
  Bun.build({
    entrypoints: ['src/client/index.ts'],
    outdir: `${outdir}/client`,
    naming: 'index.js',
    target: 'browser',
    minify: true,
    format: 'esm',
    plugins: [clientGlobals],
    external: ['@sharkord/plugin-sdk', '@sharkord/ui']
  })
]);

await fs.copyFile('manifest.json', `${outdir}/manifest.json`);
