#!/usr/bin/env node
/*
 * test-markdown.js - the renderer, and above all what it refuses to do.
 *
 * Article text is model output published on a public page, so the escaping cases
 * matter more than the formatting ones: a formatting bug is ugly, an escaping bug
 * is a script tag on moses-y.github.io. Those come first here for that reason.
 *
 *   node tests/test-markdown.js
 */
'use strict';
const { renderMarkdown, hasMarkdown } = require('../src/lib/lib-markdown.js');

let fail = 0;
function check(label, got, want) {
  const ok = typeof want === 'function' ? want(got) : got === want;
  if (!ok) {
    fail++;
    console.log(`FAIL  ${label}\n        got:  ${JSON.stringify(got)}` +
      (typeof want === 'string' ? `\n        want: ${JSON.stringify(want)}` : ''));
  }
}
const has = s => got => got.includes(s);
const lacks = s => got => !got.includes(s);

/* ---- refusals ----------------------------------------------------------- */

check('a script tag is text, not markup',
  renderMarkdown('<script>alert(1)</script>'), lacks('<script'));
check('an img onerror cannot be smuggled in',
  renderMarkdown('<img src=x onerror=alert(1)>'), lacks('<img'));
// The handler text may survive; what must not survive is a live element for it to
// attach to. Asserting on the substring alone was a stricter test than the truth.
check('an event handler has no element to attach to',
  renderMarkdown('<div onclick="steal()">hi</div>'),
  got => !/<div/.test(got) && got.includes('&lt;div'));
check('a javascript: link keeps its text and loses its href',
  renderMarkdown('[click](javascript:alert(1))'), got => !/href/.test(got) && got.includes('click'));
check('a data: link is refused too',
  renderMarkdown('[x](data:text/html;base64,PHNjcmlwdD4=)'), lacks('href'));
check('an https link is allowed',
  renderMarkdown('[docs](https://example.com/a)'), has('<a href="https://example.com/a"'));
check('html inside a code fence is still inert',
  renderMarkdown('```\n<script>x</script>\n```'), lacks('<script>x'));
check('markdown inside a code fence is not processed',
  renderMarkdown('```\n**not bold** `not code`\n```'), has('**not bold**'));
check('an image is reduced to its caption',
  renderMarkdown('![a diagram](https://x/y.png)'), got => !/<img/.test(got) && got.includes('a diagram'));

/* ---- the two things the prompt asks for and never got ------------------- */

const commands = renderMarkdown('Setup:\n\n```bash\ngit clone https://github.com/x/y.git\ncd y\nmake setup\n```\n');
check('install commands become one code block', commands, has('<pre data-lang="bash"><code>'));
check('the commands keep their line breaks', commands, has('git clone https://github.com/x/y.git\ncd y\nmake setup'));
check('a URL inside a code block is not linkified', commands, lacks('<a href'));

const table = renderMarkdown('| Function | Callers |\n| --- | --- |\n| `safe_ensure_future` | 62 |\n| `_api_get` | 54 |\n');
check('a blast-radius table becomes a table', table, has('<table>'));
check('the header row is a header', table, has('<th>Function</th>'));
check('cells render their inline code', table, has('<td><code>safe_ensure_future</code></td>'));
check('a wide table can scroll on its own', table, has('class="table-scroll"'));
check('prose containing a pipe is not a table',
  renderMarkdown('Use a | b to pipe output.'), lacks('<table'));

/* ---- ordinary structure ------------------------------------------------- */

check('a heading shifts under the page h1',
  renderMarkdown('## How It Is Wired'), '<h3>How It Is Wired</h3>');
check('a top-level heading becomes h2',
  renderMarkdown('# Overview'), '<h2>Overview</h2>');
check('paragraphs are joined across soft wraps',
  renderMarkdown('one line\nand its continuation\n\nsecond para'),
  '<p>one line and its continuation</p>\n<p>second para</p>');
check('a bullet list is a list',
  renderMarkdown('- first\n- second'), '<ul><li>first</li><li>second</li></ul>');
check('a numbered list is ordered',
  renderMarkdown('1. first\n2. second'), '<ol><li>first</li><li>second</li></ol>');
check('inline code survives', renderMarkdown('call `_api_get` here'), has('<code>_api_get</code>'));
check('bold survives', renderMarkdown('**important**'), has('<strong>important</strong>'));
check('a blockquote survives', renderMarkdown('> a caveat'), has('<blockquote>a caveat</blockquote>'));
check('a bare url is linked', renderMarkdown('see https://osv.dev for advisories'),
  has('<a href="https://osv.dev"'));
check('an ampersand in prose is escaped once',
  renderMarkdown('Code Health & Issues'), '<p>Code Health &amp; Issues</p>');
check('an underscore inside a name does not become italics',
  renderMarkdown('`safe_ensure_future` and `_api_get`'), lacks('<em>'));

/* ---- telling new articles from the 1,331 flattened ones ----------------- */

check('a flattened article reports no markdown',
  hasMarkdown('Building a crypto trading bot that can execute market-making.\n\ngit clone x\ncd y'), false);
check('an article with a fence reports markdown', hasMarkdown('a\n\n```\nb\n```'), true);
check('an article with headings reports markdown', hasMarkdown('## How It Is Wired\n\ntext'), true);
check('an article with a table reports markdown', hasMarkdown('| a | b |\n| - | - |'), true);
check('empty input is safe', renderMarkdown(''), '');
check('null input is safe', renderMarkdown(null), '');

/* ---- attribute break-out ------------------------------------------------
 * The link rules put a captured URL inside href="...". escapeHtml covered
 * &, < and > but not quotes, so a URL carrying one closed the attribute and
 * everything after it became markup. The input is a model's prose about
 * someone else's repository, which is two removes from anything trusted.
 */

check('a double quote in a link URL cannot close the attribute',
  renderMarkdown('[x](https://a.com/" onmouseover="alert(1))'), lacks('"https://a.com/"'));
check('it is escaped rather than dropped',
  renderMarkdown('[x](https://a.com/" onmouseover="alert(1))'), got => got.includes('&quot;'));
check('a single quote in a link URL is escaped too',
  renderMarkdown("[x](https://a.com/' onmouseover='alert(1))"), got => got.includes('&#39;'));
check('a bare URL carrying a quote is escaped as well',
  renderMarkdown('see https://a.com/"onmouseover="alert(1) here'), lacks('/"onmouseover'));
check('no rendered attribute is left unterminated',
  renderMarkdown('[x](https://a.com/" onmouseover="alert(1))'),
  got => (got.match(/"/g) || []).length % 2 === 0);

// The escaping must not cost the ordinary cases their rendering.
check('an ampersand in a query string still renders as a link',
  renderMarkdown('[docs](https://example.com/a?b=1&c=2)'),
  got => got.includes('href="https://example.com/a?b=1&amp;c=2"'));
check('a quote inside a fenced block survives as text',
  renderMarkdown('```js\nconst a = "x";\n```'), got => got.includes('&quot;x&quot;'));

console.log(fail ? `\n  ${fail} failures` : '\n  renderer correct, and refuses everything it should');
process.exit(fail ? 1 : 0);
