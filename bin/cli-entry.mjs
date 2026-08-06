// MODULE_CONTRACT: cli-entry — is this .mjs file the process entry point, or an import?
// Purpose:      one decision — bin/answer.mjs (S11: the last bin/*.mjs left — the pipeline's io now
//               lives in ext/index.mjs, trusted host code, not a CLI) guards its own `main()` with
//               this so `node bin/answer.mjs` runs it while a future import would not. The usual
//               guard `import.meta.url === \`file://${process.argv[1]}\`` breaks silently whenever
//               the script sits under a symlinked directory — macOS aliases /tmp → /private/tmp and
//               /var → /private/var, `import.meta.url` resolves the realpath, `process.argv[1]`
//               does not, and the guard compares a resolved path to an unresolved one. Found on the
//               donor's own install script run from a temp fixture: main() silently never ran, exit
//               0, nothing written, no error — the worst kind of failure, indistinguishable from
//               success without reading the filesystem.
// io:           fs (realpathSync only — no read/write of content)
// Invariants:   —
// Interface:    isMain(importMetaUrl) -> boolean

import { fileURLToPath } from "node:url"
import { realpathSync } from "node:fs"

// FUNCTION_CONTRACT: isMain — true iff this module was invoked directly, not imported
//   Input:        importMetaUrl — the caller's own `import.meta.url`
//   Dependencies: process.argv[1], the filesystem (realpathSync resolves symlinks on both sides)
//   Antecedent:   importMetaUrl is a `file://` URL string
//   Consequent:   success: true when process.argv[1]'s realpath equals importMetaUrl's path —
//                          symlinked temp directories (macOS /tmp, /var) no longer defeat the check
//                 failure: never throws — process.argv[1] missing or unreadable yields false, since
//                          "cannot establish this is the entry point" must not default to "it is"
export function isMain(importMetaUrl) {
  try { return realpathSync(process.argv[1]) === fileURLToPath(importMetaUrl) }
  catch { return false }
}
