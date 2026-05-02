const esbuild = require('rollup-plugin-esbuild').default;
const json = require('@rollup/plugin-json');
const resolve = require('@rollup/plugin-node-resolve');
const commonjs = require('@rollup/plugin-commonjs');
const terser = require('@rollup/plugin-terser');
const typescript = require('@rollup/plugin-typescript');

// Edge runtimes (Cloudflare Workers, Vercel Edge, Deno Deploy) don't have
// `node:fs`. We only externalize what's strictly needed at runtime; everything
// else (libphonenumber-js, bson, tiny-lru) gets bundled in.
const external = ['node:buffer'];

const plugins = [
  json({ compact: true, preferConst: true }),
  resolve({
    browser: true,
    preferBuiltins: false,
    extensions: ['.ts', '.js', '.json'],
  }),
  commonjs(),
  esbuild({
    target: 'es2020',
    tsconfig: './tsconfig.json',
    sourceMap: true,
  }),
];

const declarationPlugin = typescript({
  tsconfig: './tsconfig.json',
  declaration: true,
  declarationDir: './dist/serverless',
  emitDeclarationOnly: true,
  rootDir: './src',
  include: ['src/serverless/**/*', 'src/types.ts', 'src/locales.ts', 'src/cache.ts', 'src/core.ts'],
  exclude: ['**/*.test.ts', '**/*.spec.ts', '__tests__/**/*'],
  compilerOptions: {
    module: 'esnext',
    sourceMap: true,
  },
});

const productionPlugins = [
  ...plugins,
  terser({
    compress: { drop_console: true, drop_debugger: true, passes: 2 },
    format: { comments: false },
  }),
];

const adapterEntry = (name) => ({
  input: `src/serverless/adapters/${name}.ts`,
  output: [
    { file: `dist/serverless/adapters/${name}.esm.js`, format: 'esm', sourcemap: true },
    { file: `dist/serverless/adapters/${name}.cjs.js`, format: 'cjs', exports: 'named', sourcemap: true },
  ],
  external,
  plugins,
});

module.exports = [
  // Pure verifier (ESM)
  {
    input: 'src/serverless/verifier.ts',
    output: { file: 'dist/serverless/verifier.esm.js', format: 'esm', sourcemap: true },
    external,
    plugins: [...plugins, declarationPlugin],
  },
  // Pure verifier (CommonJS)
  {
    input: 'src/serverless/verifier.ts',
    output: { file: 'dist/serverless/verifier.cjs.js', format: 'cjs', sourcemap: true },
    external,
    plugins,
  },
  // Pure verifier (Minified UMD for browsers)
  {
    input: 'src/serverless/verifier.ts',
    output: {
      file: 'dist/serverless/verifier.min.js',
      format: 'umd',
      name: 'PhoneNumberValidator',
      sourcemap: false,
    },
    external,
    plugins: productionPlugins,
  },

  // Platform adapters
  adapterEntry('aws-lambda'),
  adapterEntry('vercel'),
  adapterEntry('cloudflare'),
  adapterEntry('gcp'),
  adapterEntry('netlify'),
  adapterEntry('azure'),

  // Combined serverless barrel (ESM + CJS)
  {
    input: 'src/serverless/index.ts',
    output: [
      { file: 'dist/serverless/index.esm.js', format: 'esm', sourcemap: true },
      { file: 'dist/serverless/index.cjs.js', format: 'cjs', sourcemap: true },
    ],
    external,
    plugins,
  },
];
