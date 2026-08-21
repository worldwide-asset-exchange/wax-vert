// node-rsa requires the node crypto module at load time in every scheme file,
// but the branches it takes when its environment is 'browser' call only
// createHash and randomBytes: the RSA arithmetic itself runs on its own
// BigInteger. Mapping crypto to this module therefore keeps the browser bundle
// to those two functions rather than pulling a whole crypto implementation in
// behind them. The engine selector reads publicEncrypt and friends off this
// object, finds them absent, and settles on the pure JavaScript engine, which
// is the one a browser has to use anyway.
module.exports = {
  createHash: require('create-hash'),
  randomBytes: require('randombytes'),
};
