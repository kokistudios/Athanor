import type { ModuleOptions } from 'webpack';

type Rules = Required<ModuleOptions>['rules'];

const tsRule = {
  test: /\.tsx?$/,
  exclude: /(node_modules|\.webpack)/,
  use: {
    loader: 'ts-loader',
    options: {
      transpileOnly: true,
    },
  },
};

// Main process rules — includes native module loaders
export const mainRules: Rules = [
  // Add support for native node modules
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
  tsRule,
];

// Renderer/preload rules — no native module loaders (they inject __dirname which
// is unavailable in sandboxed preload and browser renderer contexts)
export const rendererRules: Rules = [tsRule];
