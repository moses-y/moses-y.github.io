/*
 * lib-languages.js - the grammars and queries the symbol layer parses with.
 *
 * Split out of build-symbols.js because the per-language detail is the part that
 * grows: five languages of node-type names and capture queries would otherwise
 * push that file past the project's line limit and bury the pipeline logic under
 * grammar trivia.
 *
 * Python was the only language parsed for a long time, which left the largest
 * part of the estate with no symbols and no call graph at all: 218 TypeScript
 * repos, 94 JavaScript, 80 Go, 72 Rust. Those articles could describe a module
 * graph and nothing below it.
 *
 * Each spec carries:
 *   language   the GitHub language name, since that is what the index records
 *   also       other index language names the spec claims (Jupyter for Python)
 *   grammars   [{ wasm, ext }] - one entry per grammar, because TypeScript needs
 *              two: .tsx will not parse with the .ts grammar
 *   query      captures named fn / cls / imp / call / mcall, the same five names
 *              for every language so the extraction stays language-agnostic
 *   fnNodes    node types that count as an enclosing function when attributing a
 *              call to its caller
 *
 * The capture names matter more than they look. fn and cls become symbols, imp
 * becomes a module edge, call is a direct call by name, and mcall is a method
 * call whose receiver is unknown - the last of those is filtered against a list
 * of ambiguous names, because without type inference x.get() cannot be told from
 * a call to a function named get.
 */
'use strict';

// Shared across the C-family grammars: a call by bare name, and a call through a
// member or field access where only the final name is knowable.
const PY = `
  (function_definition name: (identifier) @fn)
  (class_definition name: (identifier) @cls)
  (import_statement name: (dotted_name) @imp)
  (import_from_statement module_name: (dotted_name) @imp)
  (call function: (identifier) @call)
  (call function: (attribute attribute: (identifier) @mcall))`;

// JavaScript names functions in several shapes, and the anonymous ones matter:
// `const handler = async () => {}` is a definition to any reader, so the
// extraction takes the name from the declarator when the function has none.
// className differs between the two grammars and the query will not compile
// against the wrong one: JavaScript's class_declaration takes an identifier,
// TypeScript's takes a type_identifier. Sharing the string verbatim looked
// obvious and failed to compile for the whole TypeScript half of the estate,
// which is precisely the failure that reports zero symbols rather than an error.
const jsQuery = className => `
  (function_declaration name: (identifier) @fn)
  (generator_function_declaration name: (identifier) @fn)
  (method_definition name: (property_identifier) @fn)
  (variable_declarator name: (identifier) @fn value: (arrow_function))
  (variable_declarator name: (identifier) @fn value: (function_expression))
  (class_declaration name: (${className}) @cls)
  (import_statement source: (string) @imp)
  (call_expression function: (identifier) @call)
  (call_expression function: (member_expression property: (property_identifier) @mcall))`;

const JS = jsQuery('identifier');

// TypeScript adds the type-level declarations, which are as much a part of the
// public surface of a module as its classes.
const TS = jsQuery('type_identifier') + `
  (interface_declaration name: (type_identifier) @cls)
  (type_alias_declaration name: (type_identifier) @cls)
  (enum_declaration name: (identifier) @cls)
  (abstract_class_declaration name: (type_identifier) @cls)`;

// Go's methods hang off a receiver rather than a class, so method_declaration is
// a function here; the type it belongs to is visible in the file either way.
const GO = `
  (function_declaration name: (identifier) @fn)
  (method_declaration name: (field_identifier) @fn)
  (type_spec name: (type_identifier) @cls)
  (import_spec path: (interpreted_string_literal) @imp)
  (call_expression function: (identifier) @call)
  (call_expression function: (selector_expression field: (field_identifier) @mcall))`;

// Rust's struct/enum/trait are all type definitions, and a macro invocation is
// close enough to a call to be worth the edge.
const RUST = `
  (function_item name: (identifier) @fn)
  (function_signature_item name: (identifier) @fn)
  (struct_item name: (type_identifier) @cls)
  (enum_item name: (type_identifier) @cls)
  (trait_item name: (type_identifier) @cls)
  (type_item name: (type_identifier) @cls)
  (use_declaration argument: (scoped_identifier) @imp)
  (use_declaration argument: (identifier) @imp)
  (call_expression function: (identifier) @call)
  (call_expression function: (field_expression field: (field_identifier) @mcall))
  (call_expression function: (scoped_identifier name: (identifier) @mcall))`;

const LANGS = {
  python: {
    language: 'Python',
    also: ['Jupyter Notebook'],
    grammars: [{ wasm: 'tree-sitter-python/tree-sitter-python.wasm', ext: ['.py', '.ipynb'] }],
    query: PY,
    fnNodes: ['function_definition'],
    importStyle: 'dotted'
  },
  javascript: {
    language: 'JavaScript',
    grammars: [{ wasm: 'tree-sitter-javascript/tree-sitter-javascript.wasm', ext: ['.js', '.mjs', '.cjs', '.jsx'] }],
    query: JS,
    fnNodes: ['function_declaration', 'generator_function_declaration', 'function_expression',
      'arrow_function', 'method_definition'],
    importStyle: 'path',
    ambiguous: ['then', 'catch', 'map', 'filter', 'forEach', 'reduce', 'toString', 'valueOf',
      'render', 'use', 'test', 'exec', 'call', 'apply', 'bind', 'has', 'match']
  },
  typescript: {
    language: 'TypeScript',
    grammars: [
      { wasm: 'tree-sitter-typescript/tree-sitter-typescript.wasm', ext: ['.ts', '.mts', '.cts'] },
      // .tsx is a different grammar, not a dialect the .ts one tolerates, and a
      // React codebase keeps most of its behaviour in .tsx files.
      { wasm: 'tree-sitter-typescript/tree-sitter-tsx.wasm', ext: ['.tsx'] }
    ],
    query: TS,
    fnNodes: ['function_declaration', 'generator_function_declaration', 'function_expression',
      'arrow_function', 'method_definition', 'function_signature'],
    importStyle: 'path',
    ambiguous: ['then', 'catch', 'map', 'filter', 'forEach', 'reduce', 'toString', 'valueOf',
      'render', 'use', 'test', 'exec', 'call', 'apply', 'bind', 'has', 'match']
  },
  go: {
    language: 'Go',
    grammars: [{ wasm: 'tree-sitter-go/tree-sitter-go.wasm', ext: ['.go'] }],
    query: GO,
    fnNodes: ['function_declaration', 'method_declaration', 'func_literal'],
    importStyle: 'path',
    // Go's interface conventions: every type implements String, Error, Len and
    // the rest, so attributing those calls by name alone inflates fan-in without
    // saying anything. Send reached 71 callers in term.everything this way.
    ambiguous: ['String', 'Error', 'Len', 'Less', 'Swap', 'ServeHTTP', 'Unwrap', 'Reset',
      'Send', 'Recv', 'Lock', 'Unlock', 'Wait', 'Done', 'Err', 'Sprintf', 'Printf', 'Println',
      'Fatalf', 'Errorf', 'Marshal', 'Unmarshal', 'Bytes', 'Name', 'Value', 'Set', 'Get']
  },
  rust: {
    language: 'Rust',
    grammars: [{ wasm: 'tree-sitter-rust/tree-sitter-rust.wasm', ext: ['.rs'] }],
    query: RUST,
    fnNodes: ['function_item', 'closure_expression'],
    importStyle: 'scoped',
    // new() is a naming convention rather than a function: 101 distinct callers
    // in serie, which says only that the crate constructs things. The trait
    // methods below are the same story.
    ambiguous: ['new', 'default', 'from', 'into', 'fmt', 'clone', 'to_string', 'as_ref',
      'as_str', 'as_mut', 'unwrap', 'expect', 'borrow', 'deref', 'iter', 'collect', 'drop',
      'try_from', 'try_into', 'eq', 'partial_cmp', 'cmp', 'hash', 'build', 'len']
  }
};

// Every extension any spec parses, so the tree-based fetch fallback can ask for
// the right blobs without knowing which language it is serving.
function allExtensions() {
  const out = new Set();
  for (const s of Object.values(LANGS)) {
    for (const g of s.grammars) for (const e of g.ext) out.add(e);
  }
  return [...out];
}

function extensionsOf(spec) {
  const out = [];
  for (const g of spec.grammars) for (const e of g.ext) if (!out.includes(e)) out.push(e);
  return out;
}

// A spec claims a repo when the index's recorded language matches it. Test files
// in other languages inside that repo are simply not parsed, which is the honest
// behaviour: the symbol file says which language produced it.
function acceptsLanguage(spec, indexLanguage) {
  if (indexLanguage === spec.language) return true;
  return (spec.also || []).includes(indexLanguage);
}

/*
 * The module name a reader would recognise, from whatever the grammar captured.
 * Python's dotted_name comes through bare and only its first segment identifies
 * the package; JavaScript and Go capture the quoted specifier, where the whole
 * path is the useful thing ("react", "./types", "net/http"); Rust captures a
 * scoped path whose first segment is the crate.
 */
function normalizeImport(spec, text) {
  let t = String(text || '').trim().replace(/^["'`]|["'`]$/g, '');
  if (!t) return null;
  if (spec.importStyle === 'dotted') return t.split('.')[0];
  if (spec.importStyle === 'scoped') return t.split('::')[0];
  return t;
}

// Names too common to attribute to a definition by name alone. The shared list
// is Python-shaped because Python was the only language for a long time, so each
// spec contributes its own conventions on top.
function ambiguousFor(spec, shared) {
  const out = new Set(shared);
  for (const n of spec.ambiguous || []) out.add(n);
  return out;
}

module.exports = { LANGS, allExtensions, extensionsOf, acceptsLanguage, normalizeImport,
  ambiguousFor };
