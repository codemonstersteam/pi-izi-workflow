// MODULE_CONTRACT: source — what a SCRIPT can read out of a source file without understanding it
// Purpose:    one decision — the border between "computable" and "meaning". Everything a regular
//             expression can lift out of a file — the language, what it imports, what it declares and
//             with what visibility, which driver it pulls in — is lifted HERE, once, and three
//             consumers share it: steps/scope/edges.mjs (the graph's edges), steps/scope/digest.mjs
//             (what the order carries instead of the whole file) and steps/scope/computed.mjs (the
//             `<api>`/`<io>` a script can name). PURE: no disk; ext/index.mjs reads the bytes.
// io:         none
// EXTERNAL_DEPENDENCY: none — plain ECMAScript regular expressions, by the same rule as core/xml.mjs:
//             a parser per language would be a pipeline dependency, and everything wider than these
//             narrow shapes is of no use to a script that only ever computes candidates.
// Invariants: readSource is total — any input, including undefined, yields a record rather than a
//             throw. A language with no rule set is DECLARED (`rules: false`), never silently empty:
//             "no edges here" and "the regex broke" must not look the same — that is the defect of
//             run 337b957f moved from the role onto the script, and it would be undetectable.
//             Nothing here decides anything about the graph; these are facts, and their consumers
//             own the decisions.
// Interface:  LANGS — extension → language id, the declared coverage of this module
//             DRIVERS — import substring → io kind, the closed table of external-system drivers
//             ROUTE_LITERAL — the shape of a string literal that could name a route path
//             readSource({ path, text }) -> Source

// LANGS — the extensions this module has rules for, and the ones it knows it has NOT. A language
// absent from this table produces `rules: false`, which travels all the way into the graph as an
// explicit marker: the repository is mapped, its edges are simply not computable yet.
export const LANGS = Object.freeze({
  java: "java", kt: "kotlin", kts: "kotlin",
  go: "go",
  ts: "ts", tsx: "ts", mts: "ts", cts: "ts", js: "ts", jsx: "ts", mjs: "ts", cjs: "ts",
  py: "py",
  rb: "ruby", rs: "rust", php: "php", cs: "csharp", swift: "swift", scala: "scala", c: "c", h: "c", cpp: "cpp", hpp: "cpp",
})

// RULED — the languages whose imports this module actually resolves. The rest are named above so the
// graph can say "python: rules, kotlin: none" instead of saying nothing at all.
const RULED = new Set(["java", "go", "ts", "py"])

// DRIVERS — import substring → what the external system IS. Deliberately small: a table that guesses
// is worse than a table that abstains, because `<io>` carries a `config`/`target` the guess cannot
// supply. `http` is absent on purpose — every repository imports an HTTP client, and its own inbound
// routes are `<api>`, not `<io>` (steps/scope/part.mjs, IO_KINDS).
export const DRIVERS = Object.freeze([
  Object.freeze(["db", ["database/sql", "jackc/pgx", "lib/pq", "go-sql-driver", "mongo-driver", "gorm.io",
                        "java.sql", "javax.persistence", "jakarta.persistence", "org.hibernate", "spring.data",
                        "mongoose", "sequelize", "typeorm", "node-postgres", "better-sqlite3",
                        "psycopg2", "sqlalchemy", "asyncpg", "quarkus.hibernate", "panache"]]),
  Object.freeze(["queue", ["segmentio/kafka-go", "Shopify/sarama", "IBM/sarama", "streadway/amqp", "rabbitmq/amqp",
                           "nats-io", "kafkajs", "amqplib", "org.apache.kafka", "jakarta.jms", "javax.jms",
                           "kombu", "pika", "smallrye.reactive.messaging"]]),
  Object.freeze(["cache", ["go-redis", "gomodule/redigo", "ioredis", "node-redis", "redis.clients", "memcache", "redis.asyncio"]]),
  Object.freeze(["blob", ["aws-sdk-go/service/s3", "aws-sdk/client-s3", "minio-go", "software.amazon.awssdk.services.s3", "boto3"]]),
  Object.freeze(["mail", ["net/smtp", "nodemailer", "javax.mail", "jakarta.mail", "smtplib"]]),
])

// ROUTE_LITERAL — a string literal that could BE a route path: starts with "/", no spaces, only the
// characters a URL path holds. Deliberately loose, because it is not the filter that decides: a
// literal becomes a `<use>` only when it matches a route this repository actually declares
// (steps/scope/computed.mjs). `/usr/bin` and `/etc/hosts` are collected here and dropped there.
export const ROUTE_LITERAL = /^\/[A-Za-z0-9_\-./{}:]*$/
const MAX_LITERALS = 200   // per file; a bundle of thousands is not a consumer, it is a data blob

// literalsOf — path-shaped string literals with the line each was read from. Runs on RAW text and on
// EVERY file, including the ones with no language reader at all: the acceptance form's consumer is
// `fruits.html`, and html has no reader by design.
function literalsOf(text) {
  const out = []
  const seen = new Set()
  for (const m of text.matchAll(/["'`]([^"'`\n]{1,200})["'`]/g)) {
    const v = m[1]
    if (seen.has(v) || !ROUTE_LITERAL.test(v) || v.length < 2) continue
    seen.add(v)
    const from = text.lastIndexOf("\n", m.index) + 1
    const to = text.indexOf("\n", m.index)
    out.push({ value: v, via: text.slice(from, to === -1 ? undefined : to).trim().slice(0, 200) })
    if (out.length >= MAX_LITERALS) break
  }
  return out
}

const ext = (path) => {
  const p = String(path == null ? "" : path)
  const dot = p.lastIndexOf(".")
  return dot > p.lastIndexOf("/") ? p.slice(dot + 1).toLowerCase() : ""
}

// stripComments — line and block comments out, string literals kept. Enough for the shapes below:
// the point is that a commented-out import is not an edge, not that this is a lexer.
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1")

// --- imports per language -------------------------------------------------------------------------
// Every reader returns [{ spec, via, kind }]:
//   spec — what the file named, verbatim
//   via  — the line it was read from, the EVIDENCE that used to be the role's `via` attribute
//   kind — how edges.mjs must resolve it: "package" (dotted/absolute), "path" (relative to the file),
//          "wildcard" (a whole package — deliberately unresolvable), "same-package" (a bare type name
//          from `extends`/`implements`, resolvable only inside the file's own directory)

const javaImports = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*import[ \t]+(?:static[ \t]+)?([\w.]+(?:\.\*)?)[ \t]*;/gm)) {
    out.push({ spec: m[1], via: m[0].trim(), kind: m[1].endsWith(".*") ? "wildcard" : "package" })
  }
  // A type of the SAME package carries no import line at all — java only requires one across
  // packages. Both edges the acceptance form is supposed to yield are of that shape:
  // `FruitResourceIT extends FruitResourceTest`, and `FruitResource` returning `Set<Fruit>`. Neither
  // is reachable from imports, so every capitalised token is offered as a same-package CANDIDATE.
  //
  // Why offering `Set`, `Response` and `Override` too is safe rather than sloppy: a candidate becomes
  // an edge only if a file of that name exists in this package (steps/scope/edges.mjs), so the
  // framework and the JDK filter themselves out — there is no list of library names to keep, and a
  // library never has to be recognised to be excluded.
  const seen = new Set(out.map((i) => i.spec))
  for (const m of text.matchAll(/\b[A-Z][A-Za-z0-9_]*\b/g)) {
    if (seen.has(m[0])) continue
    seen.add(m[0])
    const from = text.lastIndexOf("\n", m.index) + 1
    const to = text.indexOf("\n", m.index)
    out.push({ spec: m[0], via: text.slice(from, to === -1 ? undefined : to).trim(), kind: "same-package" })
  }
  return out
}

const goImports = (text) => {
  const out = []
  for (const block of text.matchAll(/^[ \t]*import[ \t]*\(([\s\S]*?)^[ \t]*\)/gm)) {
    for (const m of block[1].matchAll(/^[ \t]*(?:[\w.]+[ \t]+)?"([^"]+)"/gm)) out.push({ spec: m[1], via: `import "${m[1]}"`, kind: "package" })
  }
  for (const m of text.matchAll(/^[ \t]*import[ \t]+(?:[\w.]+[ \t]+)?"([^"]+)"/gm)) {
    out.push({ spec: m[1], via: m[0].trim(), kind: "package" })
  }
  return out
}

const tsImports = (text) => {
  const out = []
  for (const m of text.matchAll(/(?:^[ \t]*(?:import|export)[\s\S]*?from|^[ \t]*import|\brequire[ \t]*\()[ \t]*["'`]([^"'`\n]+)["'`]/gm)) {
    out.push({ spec: m[1], via: m[0].replace(/\s+/g, " ").trim(), kind: m[1].startsWith(".") ? "path" : "package" })
  }
  return out
}

const pyImports = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*from[ \t]+([.\w]+)[ \t]+import[ \t]+([^\n#]+)/gm)) {
    const names = m[2].split(",").map((s) => s.trim().split(/\s+as\s+/)[0]).filter((s) => s && s !== "*")
    // `from a.b import c` is ambiguous by construction: `c` may be a module OR a name inside `a.b`.
    // Both candidates are emitted; edges.mjs keeps whichever resolves to a file, and refuses if both do.
    for (const n of names) out.push({ spec: `${m[1]}.${n}`, via: m[0].trim(), kind: m[1].startsWith(".") ? "path" : "package" })
    out.push({ spec: m[1], via: m[0].trim(), kind: m[1].startsWith(".") ? "path" : "package" })
  }
  for (const m of text.matchAll(/^[ \t]*import[ \t]+([\w.]+)/gm)) out.push({ spec: m[1], via: m[0].trim(), kind: "package" })
  return out
}

const IMPORTS = { java: javaImports, kotlin: javaImports, go: goImports, ts: tsImports, py: pyImports }

// --- declarations ---------------------------------------------------------------------------------
// A declaration is { kind, name, visibility, line, annotations[] }. `visibility` is the half of
// `<api scope>` a script can decide on its own: a Java modifier, a Go leading capital, a TS `export`,
// a Python leading underscore. Whether a public symbol is reachable from OUTSIDE THE PROCESS is not
// decidable here — that is what the role still answers (docs/scope.md §3).

const annotationsBefore = (text, at) => {
  const head = text.slice(0, at).split("\n")
  const out = []
  for (let i = head.length - 2; i >= 0; i--) {
    const line = head[i].trim()
    if (!line) break
    const m = line.match(/^@([\w.]+)(\([^\n]*\))?/)
    if (!m) break
    out.unshift(line)
  }
  return out
}

const decl = (kind, name, visibility, line, annotations = []) => ({ kind, name, visibility, line, annotations })

const javaDecls = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*((?:public|protected|private|static|final|abstract|sealed|default|synchronized|native|\s)*)\b(class|interface|enum|record|@interface)[ \t]+(\w+)/gm)) {
    out.push(decl(m[2], m[3], /\bpublic\b/.test(m[1]) ? "public" : "internal", m[0].trim(), annotationsBefore(text, m.index)))
  }
  for (const m of text.matchAll(/^[ \t]*((?:public|protected|private|static|final|abstract|default|synchronized|\s)*)\b([\w<>\[\],. ]+?)[ \t]+(\w+)[ \t]*\(([^)\n]*)\)/gm)) {
    if (/\b(class|interface|enum|record|new|return|if|for|while|switch|catch)\b/.test(m[2])) continue
    // A constructor has no return type, so the modifier lands in m[2] instead of m[1]; testing both
    // is what keeps `public Fruit()` from being reported as internal.
    out.push(decl("method", `${m[3]}(${m[4].trim()})`, /\bpublic\b/.test(`${m[1]} ${m[2]}`) ? "public" : "internal", m[0].trim(), annotationsBefore(text, m.index)))
  }
  return out
}

const goDecls = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*func[ \t]*(\([^)]*\)[ \t]*)?(\w+)[ \t]*\(([^)\n]*)\)/gm)) {
    out.push(decl("func", `${m[2]}(${m[3].trim()})`, /^[A-Z]/.test(m[2]) ? "public" : "internal", m[0].trim()))
  }
  for (const m of text.matchAll(/^[ \t]*type[ \t]+(\w+)[ \t]+(struct|interface|[\w.\[\]*]+)/gm)) {
    out.push(decl("type", m[1], /^[A-Z]/.test(m[1]) ? "public" : "internal", m[0].trim()))
  }
  return out
}

const tsDecls = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*(export[ \t]+(?:default[ \t]+)?)?(?:async[ \t]+)?(function|class|interface|type|const|enum)[ \t]+(\w+)([^\n=;{]*)/gm)) {
    out.push(decl(m[2], `${m[3]}${m[4].includes("(") ? m[4].trim() : ""}`, m[1] ? "public" : "internal", m[0].trim()))
  }
  return out
}

const pyDecls = (text) => {
  const out = []
  for (const m of text.matchAll(/^[ \t]*(?:async[ \t]+)?(def|class)[ \t]+(\w+)[ \t]*(\([^)\n]*\))?/gm)) {
    out.push(decl(m[1], `${m[2]}${m[3] || ""}`, m[2].startsWith("_") ? "internal" : "public", m[0].trim(),
      annotationsBefore(text, m.index).map((a) => a.replace(/^@/, "@"))))
  }
  return out
}

const DECLS = { java: javaDecls, kotlin: javaDecls, go: goDecls, ts: tsDecls, py: pyDecls }

// FUNCTION_CONTRACT: readSource — the computable facts of one source file
//   Input:        { path, text } — the file's path relative to the run's cwd and its whole text
//   Dependencies: LANGS, RULED, DRIVERS, IMPORTS, DECLS, stripComments
//   Antecedent:   any values; undefined/null read as "" — a binary or an empty file is an ordinary
//                 case, not an error
//   Consequent:   success: { path, lang, rules, pkg, imports[], decls[], drivers[], literals[] } where
//                          `lang` is "" for an extension outside LANGS, and `rules` says whether this
//                          module can resolve this language's imports AT ALL. `pkg` is the Java/Kotlin
//                          package declaration (""), used to resolve a same-package `extends`.
//                          `drivers` is [{ kind, spec, via }] — an external system named by the
//                          import alone, before anything reads the body; `literals` is
//                          [{ value, via }] — path-shaped string literals, collected for EVERY file
//                          including those with no language reader, because the consumer of a route
//                          is usually a template or a page rather than a source file
//                 failure: none — total
//   Purity:       pure
//   Interface:    readSource({ path, text }) -> Source
export function readSource({ path, text } = {}) {
  const p = String(path == null ? "" : path)
  const raw = String(text == null ? "" : text)
  const lang = LANGS[ext(p)] || ""
  const rules = RULED.has(lang)
  const src = lang ? stripComments(raw) : ""

  const imports = lang && IMPORTS[lang] ? IMPORTS[lang](src) : []
  const drivers = []
  for (const imp of imports) {
    for (const [kind, needles] of DRIVERS) {
      if (needles.some((n) => imp.spec.includes(n))) { drivers.push({ kind, spec: imp.spec, via: imp.via }); break }
    }
  }

  return Object.freeze({
    path: p,
    lang,
    rules,
    literals: Object.freeze(literalsOf(raw).map(Object.freeze)),
    pkg: (src.match(/^[ \t]*package[ \t]+([\w.]+)[ \t]*;?/m) || [])[1] || "",
    imports: Object.freeze(imports.map(Object.freeze)),
    decls: Object.freeze((lang && DECLS[lang] ? DECLS[lang](src) : []).map(Object.freeze)),
    drivers: Object.freeze(drivers.map(Object.freeze)),
  })
}
