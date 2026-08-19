/*
 * checks-hygiene.js - the check registry.
 *
 * Requiring this file registers every check. Split by domain because each file
 * has to stay under the project's 450-line limit, and because the domains were
 * specified independently: supply chain, secrets, CI safety, and verification.
 */
'use strict';
require('./checks-secrets.js');
require('./checks-supply.js');
require('./checks-ci.js');
require('./checks-quality.js');
