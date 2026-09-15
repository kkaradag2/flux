import { build } from 'vite';
import { builtinModules } from 'node:module';
const external = ['electron', ...builtinModules, ...builtinModules.map(name => 'node:' + name)];
await build({ configFile: 'vite.main.config.mts', define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window') }, build: { outDir: '.vite/build', emptyOutDir: true, lib: { entry: 'src/main/main.ts', formats: ['cjs'], fileName: () => 'main.js' }, rollupOptions: { external } } });
await build({ configFile: 'vite.preload.config.mts', build: { outDir: '.vite/build', emptyOutDir: false, lib: { entry: 'src/preload/preload.ts', formats: ['cjs'], fileName: () => 'preload.js' }, rollupOptions: { external } } });
await build({ configFile: 'vite.renderer.config.mts', build: { outDir: '.vite/renderer/main_window', emptyOutDir: true } });
