// MODULE_CONTRACT: digest — what travels into the order instead of a file's whole text
// Purpose:    one decision — the minimum about a file a scout must be handed so that it does not open
//             the file for one line of `<role>`. The measurement behind it: java signatures and
//             imports are 27% of the volume (`src/main` of eddi: 5.3 → 1.4 MB), and before this
//             `MAX_BYTES` dropped a large file out of the plan ENTIRELY — the node was lost in
//             silence. PURE: knows no disk; ext/index.mjs reads the bytes.
// io:         none
// EXTERNAL_DEPENDENCY: steps/scope/source.mjs — the Source shape (`lang`, `rules`, `pkg`, `imports`,
//             `decls`); steps/scope/computed.mjs — the Computed shape (`edges`, `api`, `use`,
//             `drivers`).
// Invariants: newDigest is total; a digest NEVER stays silent about what it does not carry — a file
//             with no language rules says so on its own line, a truncated declaration list names how
//             many were dropped. Silent truncation reads as "that was all there was", which is
//             precisely the disease this whole step exists to cure.
// Interface:  MAX_DECLS — how many declarations of one file travel into the order
//             newDigest({ files, computed, maxDecls }) -> string

// MAX_DECLS — the ceiling on one file's declarations in an order. Not an "optimal number" but the
// border past which a digest stops being a digest; everything beyond it is NAMED by count, not dropped.
export const MAX_DECLS = 40

const by = (list, key) => {
  const m = new Map()
  for (const x of list || []) {
    if (!m.has(x[key])) m.set(x[key], [])
    m.get(x[key]).push(x)
  }
  return m
}

// FUNCTION_CONTRACT: newDigest — the {FILES} block of one cell's order
//   Input:        { files, computed, maxDecls }
//                 files — [{ path, bytes, source }] in order; `source` is readSource's result or null
//                 computed — newComputed over the WHOLE repository; only the facts about THESE files
//                            are taken from it (a cell's edges may point outward — as they should)
//   Dependencies: by, MAX_DECLS
//   Antecedent:   any values; missing ones read as empty
//   Consequent:   success: the order's text. Per file — a path line with size and language, then the
//                          facts, each behind its own prefix; a file with no language reader carries
//                          an explicit "no digest", a long declaration list an explicit "… N more"
//                 failure: none — total
//   Purity:       pure
//   Interface:    newDigest({ files, computed, maxDecls }) -> string
export function newDigest({ files = [], computed = {}, maxDecls = MAX_DECLS } = {}) {
  const deps = by(computed.edges, "from")
  const api = by(computed.api, "at")
  const uses = by(computed.use, "at")
  const drivers = by(computed.drivers, "at")

  const out = []
  for (const f of files) {
    const s = f.source
    const lang = s && s.lang ? s.lang : "?"
    out.push(`- ${f.path} (${f.bytes} b · ${lang})`)

    if (!s || !s.lang) {
      out.push("    no digest: this extension has no reader — open the file yourself if it holds a module")
      // …but a page with no reader is still the most common CONSUMER of a route, and that fact IS
      // computed. Printing it here is what lets `fruits.html` be described as the UI of `/fruits`.
      for (const u of uses.get(f.path) || []) out.push(`    calls route (computed): ${u.path}   ← ${u.via}`)
      continue
    }
    if (s.pkg) out.push(`    package ${s.pkg}`)

    const own = (deps.get(f.path) || [])
    if (own.length) out.push(`    imports (computed): ${own.map((e) => e.to).join(" · ")}`)
    else if (s.rules) out.push("    imports (computed): none inside this repository")
    else out.push(`    imports: NOT COMPUTED — no edge rules for ${s.lang}; read them yourself if this cell needs them`)

    for (const a of api.get(f.path) || []) out.push(`    route (computed): ${a.name}   ← ${a.via}`)
    for (const u of uses.get(f.path) || []) out.push(`    calls route (computed): ${u.path}   ← ${u.via}`)
    for (const d of drivers.get(f.path) || []) out.push(`    driver (computed): ${d.kind}   ← ${d.via}`)

    const decls = s.decls || []
    for (const d of decls.slice(0, maxDecls)) {
      const ann = d.annotations && d.annotations.length ? `${d.annotations.join(" ")} ` : ""
      out.push(`    ${d.visibility === "public" ? "+" : "-"} ${ann}${d.line}`)
    }
    if (decls.length > maxDecls) out.push(`    … ${decls.length - maxDecls} more declarations — read the file for them`)
  }
  return out.join("\n")
}
