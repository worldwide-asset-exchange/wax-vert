// Check that the browser bundle works where a browser runs it. The webpack
// build proves only that every import resolved; it cannot show whether the
// node builtins the bundle maps away still behave once they are gone. So this
// loads the emitted chunks into a context that holds no Buffer, no process, no
// global and no require, then drives the RSA host function end to end: node-rsa
// reaches the crypto shim, the shim reaches create-hash, and the buffer package
// stands in for the node one.
//
// Usage: node scripts/browser-bundle.test.js
//
// Run yarn run build-web first. This script builds nothing.
//
// It reports in the same shape as the bash tests beside it, since CI and a
// reader both want one format, but the work is a node sandbox rather than shell.
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'dist-web');
const NodeRSA = require(path.join(ROOT, 'node_modules', 'node-rsa'));

let cases = 0;
let passed = 0;

function ok(name) {
  cases += 1;
  passed += 1;
  console.log(`ok ${cases} ${name}`);
}

function no(name, detail) {
  cases += 1;
  console.log(`not ok ${cases} ${name}\n    ${detail}`);
}

function browserContext() {
  const sandbox = {
    console,
    WebAssembly,
    TextEncoder,
    TextDecoder,
    URL,
    URLSearchParams,
    ArrayBuffer,
    DataView,
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Int8Array,
    Int16Array,
    Int32Array,
    Float32Array,
    Float64Array,
    BigInt64Array,
    BigUint64Array,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
  };
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  return vm.createContext(sandbox);
}

// Drives verify_rsa_sha256_sig inside the sandbox. VM.from accepts an empty
// module and the memory is assigned directly, which is how the node suite
// reaches the host functions without a compiled contract.
const DRIVER = `
  const { Blockchain, VM, Memory } = vertLib;
  function verify(signatureHex) {
    const chain = new Blockchain();
    const memory = Memory.create(256);
    const machine = VM.from(new Uint8Array(), chain);
    machine._memory = memory;

    const bytes = new Uint8Array(memory.buffer);
    const encoder = new TextEncoder();
    let offset = 0;
    const write = (value) => {
      bytes.set(value, offset);
      const at = offset;
      offset += value.length + 1;
      return [at, value.length];
    };
    const fromHex = (hex) => {
      const out = new Uint8Array(hex.length / 2);
      for (let i = 0; i < out.length; i += 1) out[i] = parseInt(hex.substr(i * 2, 2), 16);
      return out;
    };

    const [digestAt, digestLen] = write(fromHex(input.digest));
    const [signatureAt, signatureLen] = write(encoder.encode(signatureHex));
    const [exponentAt, exponentLen] = write(encoder.encode(input.exponent));
    const [modulusAt, modulusLen] = write(encoder.encode(input.modulus));

    return machine.imports.env.verify_rsa_sha256_sig(
      digestAt, digestLen,
      signatureAt, signatureLen,
      exponentAt, exponentLen,
      modulusAt, modulusLen,
    );
  }
  result = { valid: verify(input.signature), tampered: verify(input.tampered) };
`;

function main() {
  for (const chunk of ['externals.min.js', 'vert.min.js']) {
    if (!fs.existsSync(path.join(DIST, chunk))) {
      no('the browser bundle is present', `${path.join('dist-web', chunk)} is missing; run yarn run build-web`);
      report();
      return;
    }
  }

  const context = browserContext();
  let library;
  try {
    for (const chunk of ['externals.min.js', 'vert.min.js']) {
      vm.runInContext(fs.readFileSync(path.join(DIST, chunk), 'utf8'), context, { filename: chunk });
    }
    library = context.vert;
  } catch (error) {
    no('the bundle loads without node globals', String(error));
    report();
    return;
  }

  if (library && typeof library.Blockchain === 'function') {
    ok('the bundle loads in a context with no Buffer, process, global or require');
  } else {
    no('the bundle loads in a context with no Buffer, process, global or require', 'the UMD export is missing Blockchain');
    report();
    return;
  }

  // Sign outside the sandbox with the real node crypto, which is where a
  // signature comes from in practice.
  const key = new NodeRSA({ b: 1024 });
  const digest = crypto.createHash('sha256').update('Hello, RSA!').digest('hex');
  const signature = key.sign(Buffer.from(digest, 'hex'), 'hex');
  const publicKey = key.exportKey('components-public');

  context.vertLib = library;
  context.input = {
    digest,
    signature,
    tampered: (signature.slice(0, 2) === 'ff' ? '00' : 'ff') + signature.slice(2),
    exponent: publicKey.e.toString(16),
    modulus: publicKey.n.toString('hex'),
  };

  try {
    vm.runInContext(DRIVER, context, { filename: 'verify-rsa-sha256-sig' });
  } catch (error) {
    no('the RSA host function runs in the bundle', String(error));
    report();
    return;
  }

  const { valid, tampered } = context.result;
  if (valid === 1) {
    ok('the bundle accepts a valid RSA signature');
  } else {
    no('the bundle accepts a valid RSA signature', `verify_rsa_sha256_sig returned ${valid}, wanted 1`);
  }
  if (tampered === 0) {
    ok('the bundle rejects a tampered RSA signature');
  } else {
    no('the bundle rejects a tampered RSA signature', `verify_rsa_sha256_sig returned ${tampered}, wanted 0`);
  }

  report();
}

function report() {
  console.log(`passed ${passed}/${cases}`);
  process.exit(passed === cases ? 0 : 1);
}

main();
