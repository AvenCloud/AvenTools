'use strict';

const webpack = require('webpack');

module.exports = {
  modifyBabelOptions: options => ({
    ...options,
    babelrc: false,
    plugins: [[require('babel-plugin-react-native-web'), { commonjs: true }]],
    presets: [require('babel-preset-razzle')],
  }),

  modify: config => {
    return {
      ...config,
      plugins: [
        ...config.plugins,
        new webpack.DefinePlugin({
          __DEV__: process.env.NODE_ENV !== 'production',
        }),
      ],
    };
  },
};
