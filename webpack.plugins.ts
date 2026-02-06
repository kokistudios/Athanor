import type IForkTsCheckerWebpackPlugin from 'fork-ts-checker-webpack-plugin';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ForkTsCheckerWebpackPlugin: typeof IForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';
const disableTypeChecker = process.env.ATHANOR_DISABLE_TS_CHECKER === '1';

export const plugins = [
  ...(!disableTypeChecker && isProduction
    ? [
        new ForkTsCheckerWebpackPlugin({
          logger: 'webpack-infrastructure',
        }),
      ]
    : []),
];
