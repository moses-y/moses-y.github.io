/*
 * lib-effects.js - classifying a call by what it touches outside the process.
 *
 * The internal call graph answers "what calls what" and deliberately drops every
 * edge whose target is not defined in the repository. That is the right call for
 * a call graph and it throws away exactly the thing a reader most wants to know,
 * because the sinks are all external: requests.post, cursor.execute,
 * subprocess.run, fs.writeFileSync. A function that reaches none of them
 * computes; a function that reaches one of them changes the world.
 *
 * So effects are classified separately, from the whole receiver expression rather
 * than the final method name. From `get` nothing follows - it could be a dict
 * lookup, a property, a local helper. From `requests.get` a great deal follows.
 * That distinction is the entire reason the grammars capture mfull.
 *
 * The categories are deliberately few and are named for what a reader cares
 * about, not for the library involved: a repo that reaches a database, the
 * network, the filesystem, a subprocess, a model, or a cryptographic operation.
 * Anything that does not match is not classified, because a wrong effect label
 * would propagate into an article as a claim about behaviour.
 */
'use strict';

/*
 * Patterns are matched against the full receiver text, lowercased. Each is
 * anchored on something that identifies the library or the operation rather than
 * a bare verb, which is what keeps `x.execute()` out of the database bucket while
 * keeping `cursor.execute()` in it.
 */
const EFFECTS = [
  ['db', [
    /\b(cursor|conn|connection|session|db|database|tx|trx|transaction|pool|client)\.(execute|executemany|query|fetch|fetchall|fetchone|commit|rollback|prepare|exec)\b/,
    /\b(sqlalchemy|psycopg2?|asyncpg|sqlite3|pymongo|mongoose|prisma|knex|drizzle|typeorm|sequelize|redis|aioredis)\b/,
    /\.(objects|query)\.(all|filter|get|create|update|delete|first)\b/,     // Django and ORM chains
    /\bsupabase\.(from|rpc|table)\b/,
    /\b(collection|table|model|repo|repository)\.(insert|insert_one|insert_many|find|find_one|update_one|update_many|delete_one|delete_many|aggregate|save|create|bulk_write)\b/,
    /\b(queryrow|queryctx|execcontext|db\.query|db\.exec)\b/
  ]],
  ['network', [
    /\b(requests|httpx|aiohttp|urllib|urllib2|urllib3|http|https|axios|fetch|got|superagent|node_fetch)\.(get|post|put|patch|delete|head|request|send|stream)\b/,
    /\burlopen\b|\bfetch\s*$/,
    /\b(session|client|http|api)\.(get|post|put|patch|delete|request)\b/,
    /\b(socket|websocket|ws|grpc|channel)\.(connect|send|recv|dial|invoke)\b/,
    /\b(boto3|botocore|s3|azure|gcs|storage)\.(client|resource|upload|download|put_object|get_object)\b/
  ]],
  ['filesystem', [
    /\b(fs|fsp|fse|path|os|shutil|pathlib|io)\.(open|read|write|readfile|writefile|readfilesync|writefilesync|appendfile|appendfilesync|mkdir|makedirs|rmtree|remove|unlink|rename|copy|copyfile|copytree|chmod|chown)\b/,
    /\.(write_text|read_text|write_bytes|read_bytes|touch|unlink|mkdir)\b/,
    /\b(ioutil|osfile)\.(readfile|writefile)\b/,
    /\bopen\s*$/
  ]],
  ['subprocess', [
    /\b(subprocess|child_process|os|exec|spawn)\.(run|call|check_output|check_call|popen|system|exec|execsync|spawn|spawnsync|fork)\b/,
    /\b(command|cmd)\.(output|status|spawn|run)\b/,
    /\bexeccommand\b/
  ]],
  ['model', [
    /\b(openai|anthropic|cohere|mistral|groq|ollama|together|replicate|huggingface|hf|transformers|llm|genai|bedrock|vertexai)\b/,
    /\.(chat|completions|complete|generate|embed|embeddings|invoke|predict|infer|stream)\.(create|generate)?\b.*\b(client|api|model|llm)\b/,
    /\b(model|pipeline|predictor|estimator|net)\.(predict|forward|generate|fit|train|evaluate|infer)\b/,
    /\bchat\.completions\.create\b/
  ]],
  ['crypto', [
    // The hash constructors are named for the algorithm, not for an action,
    // so hashlib.sha256 matches nothing in a verb list.
    /\b(hashlib|hmac|bcrypt|argon2|scrypt|nacl|cryptography|crypto|jwt|jose|jsonwebtoken|fernet)\.(new|sign|verify|encode|decode|encrypt|decrypt|hash|hashpw|checkpw|digest|generate_private_key|sha\d+|md5|blake2[bs]|pbkdf2_hmac)\b/,
    /\b(secrets|randombytes|token_urlsafe|token_hex|urandom)\b/
  ]]
];

// Ordered most-specific first, and the first match wins, so a call is labelled
// once. A call that reaches two categories is rare and labelling it twice would
// overstate what one line of code does.
function effectOf(receiverText) {
  if (!receiverText) return null;
  const t = String(receiverText).toLowerCase();
  if (t.length > 200) return null;                 // a chained expression, not a call site
  for (const [name, patterns] of EFFECTS) {
    for (const re of patterns) if (re.test(t)) return name;
  }
  return null;
}

const CATEGORIES = EFFECTS.map(e => e[0]);

// What a reader should understand the label to mean, used in the fact block so
// the model does not have to infer it from the word alone.
const MEANING = {
  db: 'reads or writes a database',
  network: 'makes an outbound network call',
  filesystem: 'reads or writes files',
  subprocess: 'runs an external command',
  model: 'calls a model for inference',
  crypto: 'performs a cryptographic or secret-generating operation'
};

module.exports = { effectOf, CATEGORIES, MEANING };
