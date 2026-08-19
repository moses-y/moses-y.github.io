#!/usr/bin/env node
/*
 * test-languages.js - proves each grammar query captures what it claims.
 *
 * A tree-sitter query against the wrong node-type name does not error, it simply
 * matches nothing, so a language can be "supported" while contributing zero
 * symbols and nobody notices until an article for a Go repository has no
 * functions in it. Every language therefore gets a fixture with a known number of
 * functions, types, imports and calls, and the query has to find them.
 *
 *   node scripts/test-languages.js
 */
'use strict';
const path = require('path');
const { LANGS } = require('./lib-languages.js');

const FIXTURES = {
  python: {
    ext: '.py',
    src: `import os\nfrom pkg.sub import thing\n\nclass Store:\n    def put(self, k):\n        return helper(k)\n\ndef helper(k):\n    return os.path.join(k)\n`,
    expect: { fn: ['put', 'helper'], cls: ['Store'], imp: ['os', 'pkg.sub'], calls: ['helper'] }
  },
  javascript: {
    ext: '.js',
    src: `import fs from "node:fs";\n\nclass Store {\n  put(k) { return helper(k); }\n}\n\nfunction helper(k) { return fs.readFileSync(k); }\n\nconst handler = async (req) => helper(req.path);\n`,
    expect: { fn: ['put', 'helper', 'handler'], cls: ['Store'], imp: ['"node:fs"'], calls: ['helper'] }
  },
  typescript: {
    ext: '.ts',
    src: `import type { Req } from "./types";\n\ninterface Store { put(k: string): void }\ntype Key = string;\n\nclass MemStore implements Store {\n  put(k: string) { return helper(k); }\n}\n\nfunction helper(k: string): number { return k.length; }\n`,
    expect: { fn: ['put', 'helper'], cls: ['Store', 'Key', 'MemStore'], imp: ['"./types"'], calls: ['helper'] }
  },
  go: {
    ext: '.go',
    src: `package main\n\nimport "fmt"\n\ntype Store struct { n int }\n\nfunc (s *Store) Put(k string) { helper(k) }\n\nfunc helper(k string) { fmt.Println(k) }\n\nfunc main() { helper("x") }\n`,
    expect: { fn: ['Put', 'helper', 'main'], cls: ['Store'], imp: ['"fmt"'], calls: ['helper'] }
  },
  rust: {
    ext: '.rs',
    src: `use std::collections::HashMap;\n\npub struct Store { n: usize }\n\nenum Kind { A, B }\n\ntrait Put { fn put(&self, k: &str); }\n\nfn helper(k: &str) -> usize { k.len() }\n\nfn main() { helper("x"); }\n`,
    expect: { fn: ['put', 'helper', 'main'], cls: ['Store', 'Kind', 'Put'], imp: ['std::collections::HashMap'], calls: ['helper'] }
  }
};

async function main() {
  const { Parser, Language, Query } = require('web-tree-sitter');
  await Parser.init();
  let fail = 0;

  for (const [name, spec] of Object.entries(LANGS)) {
    const fx = FIXTURES[name];
    if (!fx) { console.log(`FAIL  ${name}: no fixture`); fail++; continue; }
    const grammar = spec.grammars.find(g => g.ext.includes(fx.ext)) || spec.grammars[0];
    const wasmPath = require.resolve(grammar.wasm, { paths: [process.cwd(), path.join(process.cwd(), 'node_modules')] });
    const lang = await Language.load(wasmPath);
    const parser = new Parser();
    parser.setLanguage(lang);
    let query;
    try { query = new Query(lang, spec.query); }
    catch (e) { console.log(`FAIL  ${name}: query does not compile - ${e.message.split('\n')[0]}`); fail++; continue; }

    const tree = parser.parse(fx.src);
    const got = { fn: [], cls: [], imp: [], call: [], mcall: [], mfull: [] };
    for (const cap of query.captures(tree.rootNode)) got[cap.name].push(cap.node.text);

    for (const kind of ['fn', 'cls', 'imp']) {
      for (const want of fx.expect[kind]) {
        if (!got[kind].includes(want)) {
          console.log(`FAIL  ${name}: expected ${kind} "${want}", got [${got[kind].join(', ')}]`);
          fail++;
        }
      }
    }
    for (const want of fx.expect.calls) {
      if (!got.call.includes(want) && !got.mcall.includes(want)) {
        console.log(`FAIL  ${name}: expected a call to "${want}", got [${got.call.concat(got.mcall).join(', ')}]`);
        fail++;
      }
    }
    console.log(`  ${name.padEnd(11)} fn ${got.fn.length}  cls ${got.cls.length}  imp ${got.imp.length}  call ${got.call.length}  mcall ${got.mcall.length}  mfull ${got.mfull.length}`);
  }

  console.log(fail ? `\n  ${fail} failures` : '\n  all languages capture what they claim');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
