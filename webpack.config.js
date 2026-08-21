const path = require('path');
const { CleanWebpackPlugin } = require('clean-webpack-plugin');
const webpack = require('webpack');

module.exports = {
  entry: {
    vert: './src/index.ts',
  },
  mode: 'production',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.json'
          }
        },
        exclude: /node_modules/,
      }
    ]
  },
  plugins: [
    new CleanWebpackPlugin({ cleanOnceBeforeBuildPatterns: ['**/*'] }),
    new webpack.ProvidePlugin({
      Buffer: ["buffer", "Buffer"],
      // node-rsa reads process.title to tell a browser from node, and webpack
      // no longer supplies a process object of its own.
      process: "process/browser",
    }),
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    fallback: {
      assert: false,
      constants: require.resolve('constants-browserify'),
      crypto: require.resolve('./webpack/crypto-shim.js'),
      stream: require.resolve('stream-browserify'),
      // rustbn.js and colors reach for these only on their node branches, which
      // a browser build never takes.
      fs: false,
      os: false,
      path: false,
    }
  },
  output: {
    filename: x => x.chunk.name.replace('_', '-') + '.min.js',
    library: {
      name: 'vert',
      type: 'umd',
    },
    path: path.resolve(__dirname, 'dist-web'),
  },
  optimization: {
    splitChunks: {
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'externals',
          filename: 'externals.min.js',
          chunks: 'all'
        },
      },
    },
  }
};
