import type { Configuration } from 'webpack';

import { rendererRules } from './webpack.rules';
import { plugins } from './webpack.plugins';

const rules = [
  ...rendererRules,
  {
    test: /\.(png|jpe?g|gif|svg|ico)$/i,
    type: 'asset/resource' as const,
  },
  {
    test: /\.css$/,
    use: [
      { loader: 'style-loader' },
      { loader: 'css-loader' },
      {
        loader: 'postcss-loader',
        options: {
          postcssOptions: {
            plugins: ['@tailwindcss/postcss'],
          },
        },
      },
    ],
  },
];

export const rendererConfig: Configuration = {
  module: {
    rules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css'],
  },
};
