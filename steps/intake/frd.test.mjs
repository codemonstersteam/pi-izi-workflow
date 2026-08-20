// Slice `intake`: the requirement fried against the map — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — here the seven rules of docs/intake.md §5, each built by REINTRODUCING
// the defect into a green fixture, so the seam is proven rather than claimed.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newFrd, parseFrd, checkFrd, unreadable, spentAnswers, FRD_FORM, RULE_PASS, forPass, passOfBlocker, entryPass } from "./frd.mjs"
import { changeWidth } from "../ripple/ripple.mjs"

// Fixture: a DIFFERENT domain from any live input (parcels, not fruits) — the same reason the role's
// own EXAMPLE is foreign: a fixture indistinguishable from live input stops testing the code.
const NODES = new Set(["src/ParcelResource.java", "src/ParcelRepo.java", "src/Parcel.java", "src/test/ParcelResourceTest.java", "src/ui/parcels.html"])
const TESTS = new Set(["src/test/ParcelResourceTest.java"])
// The map's two answers to "can an existing call of this node break": its own `<api>`, and an edge
// pointing AT it. `src/ui/parcels.html` has neither — a leaf page that calls the resource and that
// nobody calls (live run e2905b82, the node that earned a false `major`).
const ENTRIES = new Set(["src/ParcelResource.java"])
const EDGES = [
  { from: "src/ui/parcels.html", to: "src/ParcelResource.java" },
  { from: "src/ParcelResource.java", to: "src/ParcelRepo.java" },
  { from: "src/ParcelRepo.java", to: "src/Parcel.java" },
]
const SOURCES = ["Нужен поиск посылки по части трек-номера, в ответе не больше 20 записей."]

// The route of the fixture's one scenario — BOTH nodes that carry a delta. F3c below demands exactly
// that: a node with a delta and no scenario through it is work no use case answers for. Written as a
// constant because four tests rewrite this route to reintroduce a defect into it.
const S1_NODES = 'nodes="src/ParcelResource.java src/ParcelRepo.java"'

const FRD = `<frd grammar="1" goal="искать посылку по части трек-номера">
  <actor name="operator-ui" kind="human" via="HTTP GET /parcels"/>

  <usecase id="UC1" actor="operator-ui" goal="найти посылку по части трек-номера">
    <pre>реестр посылок непуст</pre>
    <post>вернулись только посылки, чей трек содержит подстроку</post>
    <step n="1">клиент шлёт GET /parcels?track=AB</step>
    <step n="2">система отбирает посылки по подстроке трек-номера</step>
    <ext id="2a" error="TRACK_TOO_SHORT" outcome="отказ, поиск не выполняется"/>
  </usecase>

  <field name="track" in="GET /parcels" type="string" domain="подстрока трек-номера, регистронезависимо"
         required="no" error="TRACK_TOO_SHORT" source="TASK.md"/>
  <failure code="TRACK_TOO_SHORT" status="400" client="показать подсказку" operator="—" from="UC1/2a"/>

  <delta op="GET /parcels" form="Changed" node="src/ParcelResource.java" from="list()" to="list(track)"/>
  <delta op="findByTrack" form="Added" node="src/ParcelRepo.java"/>
  <scenario id="S1" uc="UC1" before="GET /parcels?track=AB отдаёт весь реестр"
            after="отдаёт только посылки с AB в треке" ${S1_NODES}/>
  <touched path="src/ParcelResource.java" why="метод list получает параметр track и фильтрует"/>
  <touched path="src/ParcelRepo.java" why="добавляется поиск по подстроке трека"/>

  <nfr subject="response-size" fit="не больше 20 записей" source="answers.md"/>
</frd>`

const REPO_TOUCHED = '<touched path="src/ParcelRepo.java" why="добавляется поиск по подстроке трека"/>'

const build = (xml = FRD) => newFrd({ xml, nodes: NODES, tests: TESTS, entries: ENTRIES, edges: EDGES, sources: SOURCES })
const blockersOf = (xml) =>
  checkFrd({ frd: parseFrd(xml), nodes: NODES, tests: TESTS, entries: ENTRIES, edges: EDGES, known: new Set(["20"]) })

test("happy: the FRD is built, and it carries what steps 7-9 consume", () => {
  const r = build()
  assert.equal(r.ok, true)

  const v = r.value
  assert.equal(v.goal, "искать посылку по части трек-номера")
  assert.equal(v.deltas.length, 2)
  assert.equal(v.unknown, 0)                                   // step 7 may derive a weight
  assert.deepEqual(v.touched, ["src/ParcelResource.java", "src/ParcelRepo.java"])   // step 8's input
  assert.deepEqual(v.scenarios.map((s) => s.id), ["S1"])
  assert.equal(v.usecases[0].steps.length, 2)
  assert.equal(v.usecases[0].exts[0].error, "TRACK_TOO_SHORT")
  assert.equal(v.usecases[0].post, "вернулись только посылки, чей трек содержит подстроку")
})

test("parse is total: garbage, undefined and an empty string yield an empty FRD, never a throw", () => {
  for (const bad of [undefined, null, "", "<frd", "не xml вовсе"]) {
    const f = parseFrd(bad)
    assert.equal(f.goal, "")
    assert.deepEqual([...f.deltas], [])
    assert.deepEqual([...f.touched], [])
  }
  const r = newFrd({ xml: "<frd grammar=\"1\"></frd>", nodes: NODES, sources: SOURCES })
  assert.equal(r.ok, false)
  assert.match(r.error.detail, /грамматика не распознана/)
})

test("F1: no goal, a use case without post, without actor and without a step", () => {
  assert.match(blockersOf(FRD.replace(' goal="искать посылку по части трек-номера"', "")).join("\n"), /F1 <frd goal> пуст/)
  assert.match(blockersOf(FRD.replace(/\n\s*<post>[^<]*<\/post>/, "")).join("\n"), /F1 UC1: нет <post>/)
  assert.match(blockersOf(FRD.replace(' actor="operator-ui" goal="найти', ' goal="найти')).join("\n"), /F1 UC1: нет actor/)
  assert.match(blockersOf(FRD.replace(/\n\s*<step n="1">[^<]*<\/step>\n\s*<step n="2">[^<]*<\/step>/, "")).join("\n"), /F1 UC1: нет ни одного <step>/)
})

test("F2: a touched that resolves to no node of the map", () => {
  const told = FRD.replace('<touched path="src/ParcelRepo.java"', '<touched path="src/Invented.java"')
  assert.match(blockersOf(told).join("\n"), /F2 touched «src\/Invented\.java» не резолвится/)
})

// Step 8 measures the WIDTH of the change by `touched` (docs/ripple.md §3), so a node declared touched
// on nothing but the role's say-so orders the `designer` role for free — and step 10 would owe it a
// ticket nobody can write. Touching must be explained by a delta or by a scenario running through it.
test("F2b: a touched with no delta of its own and no scenario through it is not explained", () => {
  const bare = FRD.replace('  ' + REPO_TOUCHED, '  ' + REPO_TOUCHED + '\n  <touched path="src/Parcel.java" why="поле track становится частью поиска"/>')
  assert.match(blockersOf(bare).join("\n"), /F2b touched «src\/Parcel\.java» ничем не объяснён/)
  // The same node, named by a scenario's route: explained, and green — this is exactly the live shape
  // of run c4b7cea5, where the page carried no delta of its own but the scenario ran through it.
  const viaRoute = bare.replace(S1_NODES, 'nodes="src/ParcelResource.java src/ParcelRepo.java src/Parcel.java"')
  assert.deepEqual(blockersOf(viaRoute), [])
})

test("F3: an invented form, an Unknown without why, a node outside the map and outside touched", () => {
  assert.match(blockersOf(FRD.replace('form="Added"', 'form="Modified"')).join("\n"), /F3 findByTrack: form="Modified"/)
  assert.match(blockersOf(FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Unknown"')).join("\n"), /F3 findByTrack: Unknown без why/)
  assert.match(blockersOf(FRD.replace('node="src/ParcelRepo.java"', 'node="src/Invented.java"')).join("\n"), /F3 findByTrack: файла «src\/Invented\.java» нет ни в карте роя, ни в репозитории/)
  // In the map and NOT declared touched — green, and this is a seam, not an omission.
  //
  // BUG_FIX_CONTEXT run a3597dd3 (eddi): the rule that demanded it cost eleven blockers of the
  // nineteen that killed step 6, and argued its case with something false — «шаг 8 не досчитает
  // рябь». changeWidth is `deltaNodes ∪ touched`, so step 8 reaches a delta's node either way; the
  // assertion below is that expression, called for real rather than quoted.
  const undeclared = FRD.replace('  ' + REPO_TOUCHED + '\n', '')
  assert.deepEqual(blockersOf(undeclared), [])
  assert.ok(changeWidth({ frd: parseFrd(undeclared), tests: new Set() }).has("src/ParcelRepo.java"))
  // `Fixed` is a form like the other three — it carries a node and passes. Without it a
  // contract-stable bug fix would have to be declared `Changed`, and step 7 could never weigh a
  // `patch` (docs/weight.md §3).
  assert.deepEqual(blockersOf(FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Fixed" node="src/ParcelRepo.java" from="ищет по полному треку" to="ищет по подстроке"')), [])
})

// Live run 9a8821a7 (quarkus-rest-json-app-v2-t2): beside the one real delta the artifact listed the
// three operations that do NOT change — `form="Fixed" from="unchanged" to="unchanged"` each. Step 10
// makes a plan node per delta, so that is three tickets for work nobody has to do.
test("F3b: a delta that moves nothing is not a delta, and Changed/Fixed owe both ends of the move", () => {
  const still = FRD.replace('<delta op="findByTrack" form="Added" node="src/ParcelRepo.java"/>',
    '<delta op="findByTrack" form="Fixed" node="src/ParcelRepo.java" from="unchanged" to="unchanged"/>')
  assert.match(blockersOf(still).join("\n"), /F3b findByTrack: from и to совпадают/)
  // A form that CLAIMS a movement must name it: `Fixed` and `Changed` without both ends say nothing.
  assert.match(blockersOf(FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Fixed" node="src/ParcelRepo.java"')).join("\n"),
    /F3b findByTrack: Fixed без from\/to/)
  // `Added` needs no `from`: the movement IS the appearance — the green fixture proves it.
  assert.deepEqual(blockersOf(FRD), [])
})

// Live run 9a8821a7 again: `<touched path=".../Fruit.java"/>` passed F2b because a scenario's route ran
// through it — and the implementation written afterwards never touched that file. The route is a fact
// about the path, not about the work; only the role knows the difference, so it must say it.
test("F2c: a touched with no why — the role must name what changes in the node", () => {
  const mute = FRD.replace(' why="добавляется поиск по подстроке трека"', "")
  assert.match(blockersOf(mute).join("\n"), /F2c touched «src\/ParcelRepo\.java» без why/)
  assert.match(blockersOf(FRD.replace('why="добавляется поиск по подстроке трека"', 'why="   "')).join("\n"), /F2c/)
})

// Live run e2905b82 (sandbox/runbox/quarkus-rest-json-app-v2-t2): the FRD declared
// `<delta op="fruit-card-rendering" form="Changed" node=".../fruits.html"/>` for a page that GAINED a
// card. That node has no `<api>` and `fanin="0"` — nothing calls it — so "the existing call changed"
// was a statement about nothing, and it weighed `major`, ordering step 9 for a purely additive change.
// The forms are defined by their effect ON AN EXISTING CALL, and this rule is where that definition
// finally has teeth.
test("F3: Changed/Removed need a node someone can actually call — an <api> or an incoming edge", () => {
  const onLeaf = (form) => FRD.replace(
    '  ' + REPO_TOUCHED,
    `  <delta op="parcel-card-rendering" form="${form}" node="src/ui/parcels.html" from="список без карточки" to="карточка по клику"/>\n  ${REPO_TOUCHED}\n  <touched path="src/ui/parcels.html" why="добавляется карточка по клику"/>`,
  ).replace(S1_NODES, 'nodes="src/ui/parcels.html src/ParcelResource.java src/ParcelRepo.java"')   // F3c: the new delta's node owes a scenario
  for (const form of ["Changed", "Removed"]) {
    const b = blockersOf(onLeaf(form)).join("\n")
    assert.match(b, new RegExp(`F3 parcel-card-rendering: «src/ui/parcels\\.html» — ${form}`))
    assert.match(b, /ломаться нечему/)
  }
  // The same node, the same page, declared for what it is: additive. Green.
  assert.deepEqual(blockersOf(onLeaf("Added")), [])
  assert.deepEqual(blockersOf(onLeaf("Fixed")), [])
  // And the rule does NOT fire on a node without an `<api>` that something DOES call: `Parcel.java`
  // is called by the repo, so breaking its shape breaks a real caller.
  const onCallee = FRD
    .replace('<delta op="findByTrack" form="Added" node="src/ParcelRepo.java"/>',
             '<delta op="findByTrack" form="Added" node="src/ParcelRepo.java"/>\n  <delta op="Parcel.track" form="Changed" node="src/Parcel.java" from="String track" to="TrackNo track"/>')
    .replace('  ' + REPO_TOUCHED, '  ' + REPO_TOUCHED + '\n  <touched path="src/Parcel.java" why="тип поля track"/>')
    .replace(S1_NODES, 'nodes="src/ParcelResource.java src/ParcelRepo.java src/Parcel.java"')   // F3c: same
  assert.deepEqual(blockersOf(onCallee), [])
})

// Live run 1d804798: beside the delta on FruitResource.java the artifact carried one on
// FruitResourceTest.java and passed. Step 10 makes a plan node per delta, so that would have become
// two tickets and the test would have been written by a different executor than the code.
test("F2/F3: a test file is not a delta and not touched — it is the DoD of the change", () => {
  const withTest = FRD.replace(
    '  ' + REPO_TOUCHED,
    '  <delta op="testList" form="Changed" node="src/test/ParcelResourceTest.java" from="тест списка" to="тесты поиска"/>\n  ' + REPO_TOUCHED + '\n  <touched path="src/test/ParcelResourceTest.java" why="новые проверки"/>',
  )
  const b = blockersOf(withTest).join("\n")
  assert.match(b, /F3 testList: узел «src\/test\/ParcelResourceTest\.java» — тест/)
  assert.match(b, /F2 touched «src\/test\/ParcelResourceTest\.java» — тест/)
  assert.match(b, /<dod> изменения, а не изменение/)
  assert.deepEqual(blockersOf(FRD), [])   // the green fixture stays green
})

test("F4: a scenario that does not distinguish, and an FRD with no scenario at all", () => {
  const same = FRD.replace('after="отдаёт только посылки с AB в треке"', 'after="GET /parcels?track=AB отдаёт весь реестр"')
  assert.match(blockersOf(same).join("\n"), /F4 S1: before и after совпадают/)
  assert.match(blockersOf(FRD.replace(/<scenario[\s\S]*?\/>/, "")).join("\n"), /F4 ни одного <scenario>/)
  assert.match(blockersOf(FRD.replace('uc="UC1"', 'uc="UC9"')).join("\n"), /F4 S1: uc="UC9" — такого <usecase> нет/)
  // …и обратная сторона: use case, который не различает ни один сценарий.
  assert.match(blockersOf(FRD.replace(/<scenario[\s\S]*?\/>/, "")).join("\n"), /F4b UC1 .* — нет <scenario uc="UC1">/)

  // The ROUTE of the scenario. Step 8 seeds the ripple subgraph from these paths and step 9 demands a
  // contract for every node of the route (design.mjs::checkDesign, rule 1), copied out of that
  // subgraph. A path that no module owns would arrive at step 9 as a node nobody can contract, and
  // step 8 — a script with no role — could only stop the band. It is cheap here and terminal there.
  assert.match(blockersOf(FRD.replace(S1_NODES, 'nodes=""')).join("\n"), /F4 S1: nodes пуст/)
  assert.match(blockersOf(FRD.replace(S1_NODES, 'nodes="src/Invented.java"')).join("\n"),
    /F4 S1: узла «src\/Invented.java» нет ни в репозитории, ни среди создаваемых/)
  // A route of several nodes is the ordinary case — whitespace-separated, every one resolved.
  assert.deepEqual(blockersOf(FRD.replace(S1_NODES, 'nodes="src/ParcelResource.java src/ParcelRepo.java src/Parcel.java"')), [])
})

// F3n — the module this change CREATES.
//
// BUG_FIX_CONTEXT: live run b857d4a0 (quarkus-rest-json-app-v2-t2). The operator answered «создать
//   новый файл fruit.html» and the FRD had no way to say it: F2/F3 demand a map node. The role wrote
//   `form="Unknown"`, step 7 refused on it terminally, and the band stopped after intake×5 and
//   281 188 tokens on a change the operator had ordered outright.
const NEW_PAGE = "src/ui/parcel-card.html"
const WITH_NEW = FRD.replace(REPO_TOUCHED, `${REPO_TOUCHED}
  <delta op="parcel card page" form="Added" node="${NEW_PAGE}" new="yes"/>
  <touched path="${NEW_PAGE}" why="новая страница карточки посылки, создаётся этим изменением"/>
  <scenario id="S2" uc="UC1" before="карточки посылки нет" after="карточка показывает трек и статус" nodes="${NEW_PAGE} src/ParcelResource.java"/>`)

test("F3n: a module the change CREATES is a legal delta — the map cannot know it yet", () => {
  assert.deepEqual(blockersOf(WITH_NEW), [])
  const r = build(WITH_NEW)
  assert.equal(r.ok, true)
  assert.equal(r.value.unknown, 0)   // the whole point: no Unknown, so step 7 has a weight to fold
})

test("F3n: the claim is checked in the opposite direction, and the form is pinned", () => {
  // The path IS in the map: then it is not a new module, whatever the role wrote.
  assert.match(blockersOf(WITH_NEW.replaceAll(NEW_PAGE, "src/ui/parcels.html")).join("\n"),
    /F3 parcel card page: new="yes", но файл «src\/ui\/parcels.html» в репозитории ЕСТЬ/)
  // A module that does not exist yet has no contract to move.
  assert.match(blockersOf(WITH_NEW.replace('form="Added" node="' + NEW_PAGE + '" new="yes"', `form="Changed" node="${NEW_PAGE}" new="yes" from="одна колонка" to="две колонки"`)).join("\n"),
    /F3 parcel card page: new="yes" с формой Changed/)
  // Without the declaration the path is what it has always been: invented.
  assert.match(blockersOf(WITH_NEW.replace(' new="yes"', "")).join("\n"),
    /F3 parcel card page: файла «src\/ui\/parcel-card.html» нет ни в карте роя, ни в репозитории — либо это Unknown, либо путь выдуман, либо модуль создаётся/)
})

// The blocker's TEXT is the whole repair instruction: it rides in the FEEDBACK and nothing else does.
// Live run 6889fc3f spent all three redelegations and 392 378 tokens on «F3 <delta> без op — операция
// не названа», because the role's own rule says `op` is the entry AS THE MAP SPELLS IT and a file that
// does not exist yet is in no map. Reintroducing the generic message turns this red.
test("F3n: a created module with no op is told WHERE its op comes from — the requirement, not the map", () => {
  const b = blockersOf(WITH_NEW.replace('op="parcel card page" ', ""))
  assert.equal(b.length, 1)
  assert.match(b[0], /у создаваемого модуля op это ВНЕШНЯЯ ТОЧКА, которую он заведёт/)
  assert.match(b[0], new RegExp(NEW_PAGE))   // and it names WHICH delta, since a run has several
})

// A STUB IS NOT AN ANSWER. The delta below is verbatim from the frd.xml of live run 088fb3ee
// (sandbox/runbox/eddi): five of six created modules carried `op="-"`, the rule tested only `!d.op`,
// and step 6 closed green on an artifact with no external point for any of them. Restore `if (!d.op)`
// and this goes green while pass B of step 9 pays for it — outCandidates has nothing to offer.
test("F3n: op=«-» is judged as no op at all — a dash is the absence of an answer written down", () => {
  const stubbed = WITH_NEW.replace('op="parcel card page"', 'op="-"')
  const b = blockersOf(stubbed)
  assert.equal(b.length, 1)
  assert.match(b[0], /^F3 <delta new="yes"> на «src\/ui\/parcel-card\.html» с op="-" —/)
  assert.match(b[0], /словами требования, а не именем поведения и не прочерком$/)

  // The whole family, and none of them silently: a role that writes «tbd» has not answered either.
  for (const stub of ["—", "n/a", "N/A", "TBD", "todo", "нет", "none", "..."]) {
    assert.equal(blockersOf(WITH_NEW.replace('op="parcel card page"', `op="${stub}"`)).length, 1, stub)
  }
  // A real op that merely CONTAINS a dash is untouched — the stub is the whole value, not a character.
  assert.deepEqual(blockersOf(WITH_NEW.replace('op="parcel card page"', 'op="GET /parcel-card"')), [])
})

test("F2c holds for a created node too — its why is the only place the artifact says what it is for", () => {
  const b = blockersOf(WITH_NEW.replace(' why="новая страница карточки посылки, создаётся этим изменением"', ""))
  assert.match(b.join("\n"), new RegExp(`F2c touched «${NEW_PAGE}» без why`))
})

test("F5: a number with no source among the sources, and a source outside the vocabulary", () => {
  const invented = FRD.replace('fit="не больше 20 записей"', 'fit="не больше 50 записей"')
  assert.match(blockersOf(invented).join("\n"), /F5 нфт response-size \[invented-default\]: число 50/)
  assert.match(blockersOf(FRD.replace('source="TASK.md"', 'source="здравый смысл"')).join("\n"), /F5 поле track: source="здравый смысл"/)
  // ...and the refusal names its exit, like the invented-default branch beside it: a rule that states
  // only the law leaves the role to invent a repair. Live run d4ed43a0 burned three intake rounds on
  // exactly this — the role wrote a source MORE precise than the law and could not read why it was red.
  assert.match(blockersOf(FRD.replace('source="TASK.md"', 'source="здравый смысл"')).join("\n"), /имя файла назови отдельным словом/)

  // A LOCATOR INSIDE THE FILE IS NOT A VIOLATION — it is better provenance. `brd.md R4` names the
  // requirement the quantity came from; the rule judges the FILE, in any word order, and nothing else
  // reads this attribute.
  assert.deepEqual(blockersOf(FRD.replace('source="TASK.md"', 'source="TASK.md, строка 12"')), [])
  assert.deepEqual(blockersOf(FRD.replace('source="TASK.md"', 'source="строка 12 в TASK.md"')), [])

  // ...but the file must be a WHOLE WORD. Containment would pass prose that merely mentions it — and
  // prose with a number in it is exactly what F5 exists to refuse.
  assert.match(blockersOf(FRD.replace('source="TASK.md"', 'source="взял из головы, похоже наTASK.mdx"')).join("\n"), /F5 поле track/)

  // The counting window is narrow ON PURPOSE: status/step/grammar numbers are not the requirement's
  // quantities, and counting them would fail an honest artifact (docs/intake.md §5, run ed1d4094).
  assert.deepEqual(blockersOf(FRD.replace('status="400"', 'status="418"')), [])

  // The refusal names the way out. Run e132f0a1: told only that 24 had no source, the role KEPT the
  // number and moved `source` to the name of the analogue — a second breach of the same rule.
  assert.match(blockersOf(invented).join("\n"), /назови формат вместо его меры.*сними число.*<question>/)
})

test("F6: the failure map and the extensions must be 1:1 in both directions", () => {
  assert.match(blockersOf(FRD.replace('error="TRACK_TOO_SHORT" outcome', 'error="TRACK_UNKNOWN" outcome')).join("\n"),
    /F6 код «TRACK_UNKNOWN» из <ext> не описан/)
  assert.match(blockersOf(FRD.replace(/\n\s*<ext[^>]*\/>/, "")).join("\n"),
    /F6 код «TRACK_TOO_SHORT» карты отказов не встречен/)
})

// BUG_FIX_CONTEXT live run a3597dd3 (eddi): the operator decided a missing glossary term resolves to
// an empty string — no error at all — and the role wrote `error="none"`. The rule read it as a code,
// found no such row in the failure map, and refused an artifact that was RIGHT. The legal move was to
// omit the attribute, but the order's example carries `error="CODE"` on every <ext>, so the role
// declared the absence the way this repository declares every other one.
test("F6 error=\"none\": a branch that fails without a code says so — an answer, not a code", () => {
  const lenient = FRD.replace('error="TRACK_TOO_SHORT" outcome', 'error="none" outcome')
    .replace(/\n\s*<failure [^>]*\/>/, "")
    .replace("</frd>", '  <failures found="no" why="ветка отдаёт пустой результат, кода ошибки у неё нет"/>\n</frd>')
  assert.deepEqual(blockersOf(lenient), [])

  // …and it is not a licence: a code that IS named still has to appear in the failure map
  assert.match(blockersOf(lenient.replace('error="none"', 'error="TRACK_UNKNOWN"')).join("\n"),
    /F6 код «TRACK_UNKNOWN» из <ext> не описан/)
})

// Live run e82192db: an artifact with no <failure> and no `error` anywhere passed, because the rule
// above compared two EMPTY sets. The service was then read by hand and had no failure modes at all —
// so the answer is not "invent a code" but "say so", the way the map says found="no".
test("F6 found=\"no\": an empty failure map is a blocker unless it is DECLARED empty, with a reason", () => {
  const noFailures = FRD.replace(/\n\s*<failure [^>]*\/>/, "").replace(' error="TRACK_TOO_SHORT"', "")
  assert.match(blockersOf(noFailures).join("\n"), /F6 карта отказов пуста и не объявлена/)

  const declaredNoWhy = noFailures.replace("</frd>", '  <failures found="no"/>\n</frd>')
  assert.match(blockersOf(declaredNoWhy).join("\n"), /F6 <failures found="no"> без why/)

  const declared = noFailures.replace("</frd>", '  <failures found="no" why="в сервисе нет ни кодов ошибок, ни статусов, ни валидации"/>\n</frd>')
  assert.deepEqual(blockersOf(declared), [])
})

test("F7: an FRD with use cases but not a single delta", () => {
  assert.match(blockersOf(FRD.replace(/<delta[\s\S]*?\/>\n\s*<delta[\s\S]*?\/>/, "")).join("\n"), /F7 ни одной <delta>/)
})

// --- F9: a rewind's SUBJECT survives the repair — the guard against live run 508d74fa -------------
// Fixtures COPIED VERBATIM from sandbox/runbox/quarkus-rest-json-app-v2-t2's `.agent/frd.xml` (run
// 508d74fa), the same text steps/review/review.test.mjs's FRD_508 holds — the FRD as it stood on
// disk after the role, cornered between R4 and R5 over `UC*/post` (review.test.mjs), deleted the
// subject of the blocker instead of repairing it. FRD_508_CUT carries the usure to its logical end:
// UC2 and its scenario removed outright, the shape "goal-not-delivered evidence=UC2/post" degenerates
// into once the role stops even trying.
const T508_RES = "src/main/java/org/acme/rest/json/FruitResource.java"
const FRD_508_XML = `<frd grammar="1" goal="новый эндпоинт одного фрукта по имени и карточка на странице списка">
  <actor name="api-client" kind="system" via="HTTP GET /fruits/{name}"/>
  <actor name="fruits-page-user" kind="human" via="page fruits.html"/>
  <usecase id="UC1" actor="api-client" goal="получить один фрукт по имени">
    <pre>фрукт с заданным именем существует в хранилище</pre>
    <post>получен JSON-объект одного фрукта, имя которого совпадает с запрошенным</post>
    <step n="1">клиент отправляет GET /fruits/{name}</step>
    <ext id="2a" error="404" outcome="фрукт не найден, возвращается 404 с пустым телом"/>
  </usecase>
  <usecase id="UC2" actor="fruits-page-user" goal="отобразить карточку выбранного фрукта">
    <pre>пользователь на странице списка фруктов</pre>
    <post>карточка с данными выбранного фрукта отображена на странице</post>
    <step n="1">пользователь кликает на фрукт в списке</step>
    <ext id="2a" error="404" outcome="фрукт не найден, карточка не отображается"/>
  </usecase>
  <field name="name" in="GET /fruits/{name}" type="string" domain="fruit name" required="yes" error="404" source="brd.md"/>
  <failure code="404" status="404" client="карточка не отображается" operator="—" from="UC1/2a"/>
  <delta op="GET /fruits/{name}" form="Added" node="${T508_RES}"/>
  <scenario id="S1" uc="UC1" before="эндпоинт GET /fruits/{name} отсутствует" after="эндпоинт возвращает один фрукт по имени (200) или 404" nodes="${T508_RES}"/>
  <scenario id="S2" uc="UC2" before="страница не вызывает GET /fruits/{name} и не показывает карточку" after="страница вызывает GET /fruits/{name} и показывает карточку" nodes="${T508_RES}"/>
  <nfr subject="existing-endpoints" fit="unchanged" source="brd.md"/>
</frd>`
const FRD_508 = parseFrd(FRD_508_XML)
// The usure carried to its end: UC2's whole usecase AND its scenario cut — a role no longer even
// trying to answer the blocker, the state F9's message tells it not to reach.
const FRD_508_CUT = parseFrd(
  FRD_508_XML
    .replace(/<usecase id="UC2"[\s\S]*?<\/usecase>\n\s*/, "")
    .replace(/<scenario id="S2"[^/]*\/>\n\s*/, ""),
)
const NODES_508 = new Set([T508_RES])
const REWIND_508 = [{ code: "goal-not-delivered", node: T508_RES, evidence: "UC2/post" }]

test("F9: rewind=[goal-not-delivered·UC2/post] + FRD_508_CUT (UC2 удалён) → блокер; + FRD_508 (UC2 жив) → зелен", () => {
  // sanity: the cut fixture really did lose the row F9 is about
  assert.ok(!FRD_508_CUT.usecases.some((u) => u.id === "UC2"), "фикстура должна нести усушку до конца")

  const cut = checkFrd({ frd: FRD_508_CUT, nodes: NODES_508, tests: new Set(), rewind: REWIND_508 })
  assert.match(cut.join("\n"), /F9 предмет перемотки «UC2\/post» удалён из FRD — требование не гасят удалением/)
  assert.match(cut.join("\n"), /снимается из TASK\.md\/BRD отдельной работой, не полосой/)

  // Removing the `rewind = []` guard in checkFrd (steps/intake/frd.mjs) — or the whole F9 block —
  // makes THIS assertion pass on the cut fixture too, silently: the seam is that it must NOT.
  const full = checkFrd({ frd: FRD_508, nodes: NODES_508, tests: new Set(), rewind: REWIND_508 })
  assert.ok(!full.some((b) => b.startsWith("F9")), full.join("\n"))
})

test("F9 молчит без rewind: даже усохший FRD не получает F9 на прогоне, который не является перемоткой", () => {
  const blockers = checkFrd({ frd: FRD_508_CUT, nodes: NODES_508, tests: new Set() })   // no rewind at all
  assert.ok(!blockers.some((b) => b.startsWith("F9")), blockers.join("\n"))
  // …and the ordinary green fixture of this file stays green — zero noise on a run with no rewind
  assert.deepEqual(blockersOf(FRD), [])
})

test("Unknown is a legal artifact: it passes acceptance and is COUNTED, for step 7 to refuse on", () => {
  const told = FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Unknown" why="в карте два кандидата"')
    .replace('  ' + REPO_TOUCHED + '\n', "")
  const r = newFrd({ xml: told, nodes: NODES, sources: SOURCES })
  assert.equal(r.ok, true)
  assert.equal(r.value.unknown, 1)
})

test("no sources supplied — the number rule stays silent, the rest still judges", () => {
  const r = newFrd({ xml: FRD.replace('fit="не больше 20 записей"', 'fit="не больше 50 записей"'), nodes: NODES, sources: [] })
  assert.equal(r.ok, true)
})

// The order's placeholders against the workflow's keys is judged in core/orders.test.mjs, for EVERY
// step at once and by reading workflows/izi.js itself. The list of keys that used to sit here was
// retyped by hand, so it could only ever agree with the template — the third party to the contract,
// the workflow, was not in the room.

test("role: intake.md names the machine check behind each of its prohibitions", () => {
  // The role file is named by ROLE, not by step: pi resolves agent({role: "intake"}) by FILENAME
  // inside the declared roleDirectories (ext/index.mjs), so intake/role.md would install as "role".
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  // `\s+`, not a space: the prohibition wraps, and a rule that only passes on one line-breaking
  // whim of the editor is a seam that fails for the wrong reason.
  assert.match(role, /Unknown/)            // the form that carries "could not classify" to the operator
  assert.doesNotMatch(role, /\bmvn\b|@GET|src\/main\//)   // no design, no repository idiom in the role

  // `edit` is a REQUIREMENT of the order, not a convenience: it says "repair EXACTLY the rule and the
  // element it names, and change nothing else", and with `write` alone the role can only rewrite the
  // whole artifact — which is how run e132f0a1 lost a rule it had already repaired.
  assert.match(role, /^tools: \[read, edit, write\]$/m)
})

// S21, the operator's decision: grilling a requirement takes 25-30 questions, and the ROUND is what
// costs context — the role re-reads the BRD and the whole map on every trip. The rule the role
// inherited from gilb ("ONE closed question") forbade exactly the batch, so its absence is the seam.
test("role and order: questions travel in a BATCH, not one per exchange", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  assert.match(role, /"items"/)             // the questions travel as a LIST, unnumbered
  // Live run 6350f09b: the role sent one question in `items` and `questions: 3` — the number copied
  // off this very example. The size of a batch is the length of the list and lives nowhere else, so
  // the example must not carry a count for the role to imitate.
  assert.doesNotMatch(role, /"questions":/)
  assert.doesNotMatch(role, /You do number them/)

  // S33 — the batch has no QUOTA. "thirty is normal" was a DESCRIPTIVE figure out of S21's budget
  // rationale (git log -S'thirty is normal' → 8157407) that arrived in the strategy as a prescription,
  // and both live runs landed on it: e132f0a1 asked 25 in one batch, e4a583a7 asked 12 and wanted 18
  // more, a third of them step 9's business. What bounds elicitation is completeness, not a count.
  assert.doesNotMatch(role, /thirty is normal|questions left in the/)
  assert.doesNotMatch(tpl, /questions left in this run/)
  // And the gap that stays open is an OUTPUT, the way the role's source puts it
  // (rationaldev-ai-sdlc-skills/skills/lib/requirements-intake/SKILL.md) — not a pause to spend.
  // The CLI key path is gone from this role: an answer_cmd carrying a six-line key is unusable, and
  // the answer travels by NUMBER through the chat tool (run 46edab60).
  assert.doesNotMatch(role, /answer_cmd/)
})

test("the form the order substitutes is the SAME data the guardrail judges by", () => {
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  assert.doesNotMatch(tpl, /Added \| Changed \| Removed/)              // substituted, never retyped
  assert.deepEqual([...FRD_FORM.deltaForms], ["Added", "Changed", "Removed", "Fixed", "Unknown"])
  assert.ok(FRD_FORM.sources.includes("appgraph.xml"))
  // The forms are chosen by the EFFECT ON AN EXISTING CALL, and that definition lives in the role —
  // not in the order and not in this pipeline's prose (docs/weight.md §3). Without it `Fixed` is a
  // word without a rule, and the live run S21 defect (an additive change declared `Changed`, weighing
  // major for one node) comes straight back.
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")

  // F4b: a scenario is opened PER USE CASE, and the two texts carry it the way each of them can —
  // the order as a constraint plus a SELFCHECK the role counts before writing the file, the role as a
  // prohibition naming its check. Drop either and the guardrail is the first thing the role hears
  // about the rule, one redelegation later.
  // Наряд и роль переведены на английский (правка вне этого набора) — шов пинает то же ПРАВИЛО.
  assert.match(tpl, /Every `<usecase>` gets its own `<scenario uc="…">`/)
  // Самоповерка есть у КАЖДОГО прохода — это то, что роль считает перед записью файла, и пункты
  // разошлись по пластам вместе с правилами (steps/intake/passes-data-flow.md). Пусто хоть в одном
  // проходе — и его роль впервые слышит о правиле от гардрейла, кругом позже.
  for (const x of ["a", "b", "c", "d"]) {
    const block = TPL(x).match(/\$START_SELFCHECK[\s\S]*?\$END_SELFCHECK/)
    assert.ok(block, `наряд ${x.toUpperCase()} обязан нести блок $START_SELFCHECK`)
    assert.ok((block[0].match(/^\d\. /gm) || []).length >= 1, `самоповерка наряда ${x.toUpperCase()} пуста`)
  }
  assert.match(role, /Do not leave a `<usecase>` without a scenario.*`F4b`/)
})

// S30g seam: since step 11 exists, a FEEDBACK line can come from TWO places, and they are not
// repaired the same way. A guardrail blocker is numbered by a rule and fixed pointwise; a critic
// blocker names a code and a node and says the REQUIREMENT is short. Without the distinction the
// role hunts for a rule number that does not exist and repairs the wrong thing. Drop either mention
// and this goes red.
test("role and order: a FEEDBACK line names its source, and the two are repaired differently", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  // Роль несёт таблицу целиком — она одна на все четыре прохода, и второй её копии быть не должно.
  assert.match(role, /guardrail:/, "role must name the guardrail as a source of feedback")
  assert.match(role, /critic:/, "role must name the critic as a source of feedback")
  // Наряд каждого прохода, куда критик умеет адресовать находку (A, B, C — см.
  // steps/review/review.mjs::passOf), обязан назвать этот источник и отослать к роли за ремонтом.
  for (const x of ["a", "b", "c"]) {
    assert.match(TPL(x), /`critic:`/, `наряд ${x.toUpperCase()} не называет критика источником замечания`)
    assert.match(TPL(x), /THE CODE DECIDES THE REPAIR/, `наряд ${x.toUpperCase()} не отсылает к ремонту по коду`)
  }
})

// --- F6c / F6d: один корень отказа, разные виды по слоям -----------------------------------------
// Fixtures COPIED VERBATIM from `sandbox/runbox/<form>/.agent/frd.xml` — four forms that were really
// written by the role, so the two rules are counted on live artifacts and not on a shape invented to
// fit them. Only F6* is counted here: the maps of those forms do not travel with the XML, and F2/F3/F5
// judge against a map by design.
const FRD_9B019D80 = `<frd grammar="1" goal="новый эндпоинт GET /fruits/{name} отдаёт один фрукт по имени (case-insensitive substring), при отсутствии — 404; страница списка показывает карточку через этот эндпоинт">

  <actor name="api-client" kind="system" via="HTTP GET /fruits/{name}"/>
  <actor name="list-page-user" kind="human" via="fruits.html → HTTP GET /fruits/{name}"/>

  <usecase id="UC1" actor="api-client" goal="получить один фрукт по имени">
    <pre>фрукт существует в хранилище FruitResource</pre>
    <post>вернуто HTTP 200 с JSON-объектом одного фрукта, содержащим все поля</post>
    <step n="1">клиент шлёт GET /fruits/{name}</step>
    <step n="2">FruitResource ищет фрукт по имени с case-insensitive substring match</step>
    <step n="3">система возвращает HTTP 200 с JSON-объектом найденного фрукта</step>
    <ext id="1a" error="FRUIT_NOT_FOUND" outcome="фрукт не найден, вернуто HTTP 404"/>
  </usecase>

  <usecase id="UC2" actor="list-page-user" goal="посмотреть карточку фрукта из списка">
    <pre>пользователь на странице списка фруктов</pre>
    <post>карточка выбранного фрукта отображена на странице</post>
    <step n="1">пользователь кликает на фрукт в списке</step>
    <step n="2">fruits.html выполняет GET /fruits/{name}</step>
    <step n="3">FruitResource возвращает HTTP 200 с JSON-объектом фрукта</step>
    <step n="4">fruits.html отображает карточку фрукта</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="фрукт не найден, вернуто HTTP 404"/>
  </usecase>

  <field name="name" in="GET /fruits/{name}" type="string" domain="any non-empty string" required="yes" error="FRUIT_NOT_FOUND" source="brd.md"/>
  <field name="name" in="Fruit" type="string" domain="any string" required="yes" error="none" source="appgraph.xml"/>
  <field name="description" in="Fruit" type="string" domain="any string" required="yes" error="none" source="appgraph.xml"/>

  <failure code="FRUIT_NOT_FOUND" status="404" client="получить HTTP 404" operator="—" from="UC1/1a"/>

  <delta op="GET /fruits/{name}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java"/>

  <scenario id="S1" uc="UC1" before="GET /fruits/{name} не существует; доступны только GET /fruits, POST /fruits, DELETE /fruits" after="GET /fruits/{name} возвращает HTTP 200 с JSON-объектом одного фрукта по имени (case-insensitive substring) или HTTP 404" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>

  <scenario id="S2" uc="UC2" before="fruits.html не вызывает GET /fruits/{name} и не показывает карточку фрукта" after="fruits.html вызывает GET /fruits/{name} при клике и отображает карточку фрукта" nodes="src/main/resources/META-INF/resources/fruits.html src/main/java/org/acme/rest/json/FruitResource.java"/>

  <touched path="src/main/resources/META-INF/resources/fruits.html" why="добавлен вызов GET /fruits/{name} и отображение карточки фрукта при клике"/>

  <nfr subject="existing-endpoints" fit="GET /fruits, POST /fruits, DELETE /fruits, GET /legumes — формат и поведение unchanged" source="brd.md"/>
</frd>`

const FRD_T3 = `<frd grammar="1" goal="отдельная страница карточки фрукта со своим адресом, отображающая имя и описание">
  <actor name="browser" kind="human" via="HTTP GET /fruit-card.html, GET /fruits/{id}"/>
  <actor name="list-page" kind="system" via="HTML navigation link in fruits.html"/>

  <usecase id="UC1" actor="browser" goal="получить данные одного фрукта по идентификатору">
    <pre>фрукт с таким name существует в коллекции</pre>
    <post>вернётся JSON с полями name и description одного фрукта, HTTP 200</post>
    <step n="1">клиент отправляет GET /fruits/{id}, где {id} — имя фрукта</step>
    <step n="2">FruitResource находит фрукт по name в коллекции</step>
    <step n="3">FruitResource возвращает JSON {name, description} со статусом 200</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="фрукт с таким name не найден — HTTP 404"/>
  </usecase>

  <usecase id="UC2" actor="browser" goal="перейти на карточку фрукта из списка">
    <pre>пользователь видит страницу списка фруктов (fruits.html)</pre>
    <post>клик по имени фрукта открывает страницу карточки /fruit-card.html с параметром id</post>
    <step n="1">fruits.html рендерит список фруктов, каждое имя — ссылка &lt;a&gt;</step>
    <step n="2">ссылка ведёт на /fruit-card.html?id=&lt;fruitName&gt;</step>
    <step n="3">браузер открывает страницу fruit-card.html</step>
  </usecase>

  <usecase id="UC3" actor="browser" goal="отобразить карточку фрукта">
    <pre>пользователь открыл /fruit-card.html?id=&lt;fruitName&gt;</pre>
    <post>на странице отображены name и description фрукта</post>
    <step n="1">fruit-card.html считывает параметр id из URL</step>
    <step n="2">страница отправляет GET /fruits/{id}</step>
    <step n="3">при получении ответа страница отображает name и description</step>
    <ext id="2a" error="FRUIT_NOT_FOUND" outcome="GET вернул 404 — страница показывает сообщение об отсутствии фрукта"/>
  </usecase>

  <field name="id" in="GET /fruits/{id}" type="string" domain="any fruit name present in collection" required="yes" error="FRUIT_NOT_FOUND" source="answers.md"/>

  <failure code="FRUIT_NOT_FOUND" status="404" client="отобразить сообщение об отсутствии" operator="—" from="UC1/2a,UC3/2a"/>

  <delta op="GET /fruits/{id}" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java" from="endpoint отсутствует" to="endpoint возвращает Fruit по name (200) или 404"/>
  <delta op="GET /fruit-card.html" form="Added" node="src/main/resources/META-INF/resources/fruit-card.html" new="yes"/>
  <delta op="list-page navigation" form="Added" node="src/main/resources/META-INF/resources/fruits.html" from="имя фрукта не кликабельно" to="имя фрукта — ссылка &lt;a href=&quot;/fruit-card.html?id={name}&quot;&gt;"/>

  <scenario id="S1" uc="UC1" before="GET /fruits/{id} не существует — сервер возвращает 404 для любого path-параметра" after="GET /fruits/{id} возвращает JSON с name и description фрукта или 404 при отсутствии" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>
  <scenario id="S2" uc="UC2" before="fruits.html не содержит ссылок на карточку фрукта" after="имя каждого фрукта в списке — кликабельная ссылка на /fruit-card.html?id={name}" nodes="src/main/resources/META-INF/resources/fruits.html"/>
  <scenario id="S3" uc="UC3" before="файл fruit-card.html не существует, адрес /fruit-card.html недоступен" after="fruit-card.html загружает фрукт по GET /fruits/{id} и отображает name и description" nodes="src/main/resources/META-INF/resources/fruit-card.html src/main/java/org/acme/rest/json/FruitResource.java"/>

  <touched path="src/main/java/org/acme/rest/json/FruitResource.java" why="добавлен метод findByName() с @PathParam для GET /fruits/{id}"/>
  <touched path="src/main/resources/META-INF/resources/fruits.html" why="имя фрукта в списке обёрнуто в &lt;a&gt; со ссылкой на карточку"/>
  <touched path="src/main/resources/META-INF/resources/fruit-card.html" why="новый HTML-файл страницы карточки, загружающий данные по GET /fruits/{id}"/>

  <nfr subject="existing-contracts" fit="format ответа существующих endpoints unchanged" source="brd.md"/>
</frd>`

const FRD_EDDI = `<frd grammar="1" goal="ввести глобальный ресурс глоссарий с CRUD, подстановкой в промпты и поддержкой экспорта/импорта">
  <actor name="operator-ui" kind="human" via="HTTP REST /glossarystore/glossaries"/>
  <actor name="template-pipeline" kind="system" via="Qute namespace resolver glossary:termKey"/>

  <usecase id="UC1" actor="operator-ui" goal="управлять глоссариями через REST CRUD">
    <pre>оператор аутентифицирован</pre>
    <post>глоссарий сохранён в MongoDB коллекцию glossaries с версионированием; URI-префикс eddi://ai.labs.glossary</post>
    <step n="1">клиент отправляет POST /glossarystore/glossaries с телом {name, description?, terms[]}</step>
    <step n="2">система проверяет уникальность name и уникальность term.key внутри глоссария</step>
    <step n="3">система сохраняет глоссарий, генерирует id и version=1, возвращает 201 Created</step>
    <step n="4">GET /glossarystore/glossaries/{id}?version=N читает глоссарий с версионированием</step>
    <step n="5">PUT /glossarystore/glossaries/{id}?version=N обновляет глоссарий с проверкой версии</step>
    <step n="6">DELETE /glossarystore/glossaries/{id}?version=N удаляет глоссарий</step>
    <ext id="2a" error="GLOSSARY_NAME_CONFLICT" outcome="POST/PUT возвращает 409: name уже занят"/>
    <ext id="2b" error="GLOSSARY_KEY_DUPLICATE" outcome="POST/PUT возвращает 400: term.key дублируется внутри глоссария"/>
    <ext id="3a" error="GLOSSARY_NOT_FOUND" outcome="GET/PUT/DELETE возвращает 404: глоссарий с указанным id не найден"/>
    <ext id="5a" error="GLOSSARY_VERSION_MISMATCH" outcome="PUT возвращает 412: версия не совпадает"/>
  </usecase>

  <usecase id="UC2" actor="template-pipeline" goal="разрешить {glossary.termKey} в Qute-шаблонах">
    <pre>активные глоссарии загружены в кэш GlossaryService</pre>
    <post>выражение {glossary.termKey} заменено на value соответствующего термина; неразрешённые ключи отдаются как пустая строка</post>
    <step n="1">Qute engine встречает выражение {glossary.termKey}</step>
    <step n="2">GlossaryNamespaceResolver.searchAllGlossaries(termKey) ищет термин по всем активным глоссариям</step>
    <step n="3">если термин найден — возвращается value; иначе — пустая строка (lenient Qute)</step>
    <ext id="3a" error="none" outcome="термин не найден ни в одном глоссарии → пустая строка, обработка продолжается"/>
  </usecase>

  <usecase id="UC3" actor="operator-ui" goal="включить глоссарии в экспорт и импорт агента">
    <pre>ZIP-архив содержит {id}.glossary.json для каждого глоссария; импорт по name как у сниппетов</pre>
    <post>глоссарии экспортированы в ZIP; при импорте существующие сопоставлены по name и обновлены, новые созданы, неизменённые пропущены</post>
    <step n="1">экспорт: RestExportService собирает глобальные глоссарии и записывает {id}.glossary.json в ZIP</step>
    <step n="2">импорт: ZipResourceSource.readGlossaries() читает {id}.glossary.json из распакованного ZIP</step>
    <step n="3">StructuralMatcher сопоставляет глоссарии по name (buildExistingGlossaryNameMap)</step>
    <step n="4">UpgradeExecutor применяет diff: CREATE для новых, UPDATE для изменённых, SKIP для неизменённых</step>
    <ext id="4a" error="GLOSSARY_NAME_CONFLICT" outcome="создание дубликата возвращает 409"/>
  </usecase>

  <!-- Data Dictionary -->
  <field name="name" in="Glossary" type="String" domain="required, unique across deployment" required="yes" error="GLOSSARY_NAME_CONFLICT" source="answers.md"/>
  <field name="description" in="Glossary" type="String" domain="optional" required="no" error="none" source="answers.md"/>
  <field name="terms" in="Glossary" type="List&lt;GlossaryTerm&gt;" domain="0..N" required="yes" error="none" source="answers.md"/>
  <field name="key" in="GlossaryTerm" type="String" domain="pattern: ^[a-zA-Z_][a-zA-Z0-9_]*$, unique within glossary" required="yes" error="GLOSSARY_KEY_DUPLICATE" source="answers.md"/>
  <field name="value" in="GlossaryTerm" type="String" domain="required" required="yes" error="none" source="answers.md"/>
  <field name="version" in="Glossary CRUD" type="Integer" domain="&gt;=1" required="no" error="GLOSSARY_VERSION_MISMATCH" source="brd.md"/>
  <field name="collection" in="Glossary persistence" type="String" domain="glossaries" required="yes" error="none" source="answers.md"/>
  <field name="template-syntax" in="Glossary template resolution" type="String" domain="{glossary.termKey}" required="yes" error="none" source="answers.md"/>
  <field name="match-key" in="Glossary import" type="String" domain="name (as StructuralMatcher.buildExistingSnippetNameMap)" required="yes" error="none" source="answers.md"/>

  <!-- Failure Modes -->
  <failure code="GLOSSARY_NOT_FOUND" status="404" client="вернуть пустой ответ" operator="—" from="UC1/3a"/>
  <failure code="GLOSSARY_NAME_CONFLICT" status="409" client="отказать в операции" operator="—" from="UC1/2a, UC3/4a"/>
  <failure code="GLOSSARY_KEY_DUPLICATE" status="400" client="отказать в операции, указать дублирующийся ключ" operator="—" from="UC1/2b"/>
  <failure code="GLOSSARY_VERSION_MISMATCH" status="412" client="отказать в обновлении" operator="—" from="UC1/5a"/>

  <!-- Deltas: new modules -->
  <delta op="Glossary model POJO" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java" new="yes"/>
  <delta op="IGlossaryStore CRUD interface" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java" new="yes"/>
  <delta op="GET/POST/PUT/DELETE /glossarystore/glossaries/{id}" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java" new="yes"/>
  <delta op="GlossaryStore MongoDB on glossaries" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java" new="yes"/>
  <delta op="RestGlossaryStore REST CRUD" form="Added" node="src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java" new="yes"/>
  <delta op="GlossaryService cache and serve" form="Added" node="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" new="yes"/>
  <delta op="Qute namespace resolver for glossary:" form="Added" node="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java" new="yes"/>

  <!-- Deltas: existing modules -->
  <delta op="IResourceSource.readGlossaries" form="Added" node="src/main/java/ai/labs/eddi/backup/IResourceSource.java" from="readAgent, readWorkflows, readSnippets" to="readAgent, readWorkflows, readSnippets, readGlossaries"/>
  <delta op="RestExportService" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" from="экспорт без глоссариев" to="экспорт включает {id}.glossary.json"/>
  <delta op="RestImportService" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" from="импорт без глоссариев" to="импорт читает и применяет глоссарии"/>
  <delta op="ZipResourceSource.readGlossaries" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" from="readAgent, readWorkflows, readSnippets" to="readAgent, readWorkflows, readSnippets, readGlossaries"/>
  <delta op="RemoteApiResourceSource.readGlossaries" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" from="readAgent, readWorkflows, readSnippets" to="readAgent, readWorkflows, readSnippets, readGlossaries"/>
  <delta op="StructuralMatcher glossary matching" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" from="matching без глоссариев" to="buildExistingGlossaryNameMap + glossary diff по name"/>
  <delta op="UpgradeExecutor glossary apply" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" from="применение без глоссариев" to="CREATE/UPDATE/SKIP глоссариев"/>
  <delta op="TemplateEngineModule" form="Added" node="src/main/java/ai/labs/eddi/modules/templating/bootstrap/TemplateEngineModule.java" from="нет GlossaryNamespaceResolver" to="GlossaryNamespaceResolver зарегистрирован как CDI bean"/>
  <delta op="ITemplatingEngine" form="Added" node="src/main/java/ai/labs/eddi/modules/templating/ITemplatingEngine.java" from="нет glossary namespace" to="поддержка {glossary.termKey} через GlossaryNamespaceResolver"/>

  <!-- Scenarios -->
  <scenario id="S1" uc="UC1" before="REST /glossarystore/glossaries не существует, глоссарии невозможно создать"
            after="полный CRUD: POST создаёт, GET читает с version, PUT обновляет с проверкой версии, DELETE удаляет"
            nodes="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java"/>

  <scenario id="S2" uc="UC2" before="выражение {glossary.termKey} в шаблоне не разрешается"
            after="GlossaryNamespaceResolver ищет термин по всем активным глоссариям и возвращает value"
            nodes="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java src/main/java/ai/labs/eddi/modules/templating/impl/TemplatingEngine.java src/main/java/ai/labs/eddi/modules/templating/ITemplatingEngine.java"/>

  <scenario id="S3" uc="UC3" before="ZIP-экспорт не содержит глоссариев, импорт не обрабатывает .glossary.json"
            after="экспорт включает {id}.glossary.json; импорт сопоставляет по name и применяет CREATE/UPDATE/SKIP"
            nodes="src/main/java/ai/labs/eddi/backup/IResourceSource.java src/main/java/ai/labs/eddi/backup/impl/RestExportService.java src/main/java/ai/labs/eddi/backup/impl/RestImportService.java src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java"/>

  <!-- Touched: new modules -->
  <touched path="src/main/java/ai/labs/eddi/configs/glossary/model/Glossary.java" why="новый POJO модели глоссария: name, description, terms[]"/>
  <touched path="src/main/java/ai/labs/eddi/configs/glossary/IGlossaryStore.java" why="новый интерфейс CRUD для глоссариев"/>
  <touched path="src/main/java/ai/labs/eddi/configs/glossary/IRestGlossaryStore.java" why="новый REST интерфейс: GET/POST/PUT/DELETE /glossarystore/glossaries/{id}"/>
  <touched path="src/main/java/ai/labs/eddi/configs/glossary/mongo/GlossaryStore.java" why="новая MongoDB реализация на коллекции glossaries"/>
  <touched path="src/main/java/ai/labs/eddi/configs/glossary/rest/RestGlossaryStore.java" why="новая REST реализация делегирующая в GlossaryStore"/>
  <touched path="src/main/java/ai/labs/eddi/modules/llm/impl/GlossaryService.java" why="новый кэш и обслуживание глоссариев по паттерну PromptSnippetService"/>
  <touched path="src/main/java/ai/labs/eddi/modules/templating/impl/GlossaryNamespaceResolver.java" why="новый Qute namespace resolver: glossary.termKey → value из всех активных глоссариев"/>

  <!-- Touched: existing modules -->
  <touched path="src/main/java/ai/labs/eddi/backup/IResourceSource.java" why="новый метод readGlossaries() в интерфейсе ресурсного источника"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java" why="добавлена запись {id}.glossary.json в ZIP-архив экспорта"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RestImportService.java" why="добавлена обработка глоссариев в конвейере импорта"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/ZipResourceSource.java" why="новая реализация readGlossaries() для чтения .glossary.json из ZIP"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" why="новая реализация readGlossaries() для чтения глоссариев через удалённый REST API"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/StructuralMatcher.java" why="добавлено сопоставление глоссариев по name (buildExistingGlossaryNameMap) и diff"/>
  <touched path="src/main/java/ai/labs/eddi/backup/impl/UpgradeExecutor.java" why="добавлено применение глоссарий: CREATE/UPDATE/SKIP по diff"/>
  <touched path="src/main/java/ai/labs/eddi/modules/templating/bootstrap/TemplateEngineModule.java" why="GlossaryNamespaceResolver регистрируется как CDI bean для автообнаружения Qute"/>
  <touched path="src/main/java/ai/labs/eddi/modules/templating/ITemplatingEngine.java" why="интерфейс расширяется поддержкой glossary namespace resolution"/>

  <nfr subject="glossary-collection" fit="glossaries" source="answers.md"/>
  <nfr subject="glossary-scope" fit="глобальный ресурс на весь деплой" source="answers.md"/>
  <nfr subject="glossary-uri" fit="eddi://ai.labs.glossary" source="brd.md"/>
  <nfr subject="import-match" fit="по name, как StructuralMatcher.buildExistingSnippetNameMap" source="answers.md"/>
  <nfr subject="template-syntax" fit="{glossary.termKey} — Qute namespace resolver (одинарные скобки)" source="answers.md"/>
</frd>`

const FRD_T1_3 = `<frd grammar="1" goal="поиск фруктов по части имени с ограничением ответа до 10 записей">

  <actor name="api-client" kind="system" via="HTTP GET /fruits"/>

  <usecase id="UC1" actor="api-client" goal="поиск фруктов по части имени">
    <pre>коллекция фруктов существует</pre>
    <post>получены фрукты с подстрокой в имени без учёта регистра, не более 10 записей</post>
    <step n="1">клиент отправляет GET /fruits?search=&lt;value&gt;</step>
    <step n="2">система фильтрует фрукты по частичному совпадению name без учёта регистра</step>
    <step n="3">система ограничивает результат до 10 записей</step>
    <step n="4">система возвращает Set&lt;Fruit&gt; с совпавшими записями</step>
  </usecase>

  <usecase id="UC2" actor="api-client" goal="получить все фрукты без фильтрации">
    <pre>коллекция фруктов существует</pre>
    <post>получены все фрукты в коллекции, контракт не изменён</post>
    <step n="1">клиент отправляет GET /fruits без параметра search</step>
    <step n="2">система возвращает Set&lt;Fruit&gt; со всеми записями</step>
  </usecase>

  <field name="search" in="GET /fruits" type="string" domain="any string" required="no" error="—" source="brd.md"/>

  <failures found="no" why="поиск возвращает пустой набор при отсутствии совпадений — нормальный результат, а не ошибка; лимит 10 применяется к результату без генерации ошибки"/>

  <delta op="GET /fruits" form="Added" node="src/main/java/org/acme/rest/json/FruitResource.java" from="list() без параметров возвращает все фрукты" to="list(search) с опциональным query-параметром, фильтрацией по name без учёта регистра и лимитом 10 записей"/>

  <scenario id="S1" uc="UC1" before="GET /fruits?search=any игнорирует неизвестный параметр и возвращает все фрукты" after="GET /fruits?search=apple возвращает только фрукты с подстрокой &quot;apple&quot; в name без учёта регистра, не более 10" nodes="src/main/java/org/acme/rest/json/FruitResource.java"/>

  <touched path="src/main/java/org/acme/rest/json/FruitResource.java"/>

  <nfr subject="search-response-limit" fit="10" source="answers.md"/>

</frd>`

// Every blocker of the rule family, on the artifact alone.
const rule = (xml, n) => checkFrd({ frd: parseFrd(xml) }).filter((b) => b.startsWith(n))

// The repair: UC2's branch says what the PAGE observes, and the one row of the code names BOTH branches.
const FRD_9B_FIXED = FRD_9B019D80
  .replace('<ext id="2a" error="FRUIT_NOT_FOUND" outcome="фрукт не найден, вернуто HTTP 404"/>',
           '<ext id="2a" error="FRUIT_NOT_FOUND" outcome="карточка не открыта, на странице сообщение об отсутствии фрукта"/>')
  .replace('from="UC1/1a"', 'from="UC1/1a UC2/2a"')

test("F6c/F6d: FRD прогона 9b019d80 — ровно два блокера; разведённые outcome и составной from — зелено", () => {
  assert.equal(rule(FRD_9B019D80, "F6c").length, 1)
  assert.equal(rule(FRD_9B019D80, "F6d").length, 1)
  assert.equal(rule(FRD_9B019D80, "F6").length, 2)          // F6 itself stays silent: the code IS in the map
  assert.match(rule(FRD_9B019D80, "F6c")[0], /UC1\/1a и UC2\/2a несут один текст конца/)
  assert.match(rule(FRD_9B019D80, "F6d")[0], /ветка UC2\/2a поднимает «FRUIT_NOT_FOUND»/)

  assert.deepEqual(rule(FRD_9B_FIXED, "F6"), [])

  // The three forms that were already writing the artifact the way the rules now demand.
  for (const [form, xml] of [["t3", FRD_T3], ["eddi", FRD_EDDI], ["t1-3", FRD_T1_3]]) {
    assert.deepEqual(rule(xml, "F6"), [], form)
  }
})

// D30: `from` — список ТОКЕНОВ, и его разделитель объявлен на КЛАСС (`core/xml.mjs::tokens`), а не
// этим правилом. ` | ` здесь не экзотика: это та самая форма, которой схемы конвейера учат роль
// перечислять всё (`in="v1 | v14"`, `closes="UC2/2a | UC7/2b"`). До D30 черта приезжала сюда как
// токен и F6d краснел на законном FRD строкой «ссылается на «|»» — тот же дефект, что убил прогон
// 27b37fdb на шаге 9. Мутация: вернуть `split(/[\s,]+/)` в steps/intake/frd.mjs.
test("F6d: разделители from — пробел, запятая, черта — покрывают одинаково", () => {
  for (const sep of [" ", ",", ", ", " | ", "|"]) {
    const xml = FRD_9B_FIXED.replace('from="UC1/1a UC2/2a"', `from="UC1/1a${sep}UC2/2a"`)
    assert.deepEqual(rule(xml, "F6"), [], JSON.stringify(sep))
  }
  // …and the coverage is read in both directions: a token that resolves to no branch is a blocker too.
  const dangling = rule(FRD_9B_FIXED.replace("UC2/2a", "UC2/9z"), "F6d").join("\n")
  assert.match(dangling, /ссылается на «UC2\/9z», а такой ветки нет/)
  assert.match(dangling, /ветка UC2\/2a поднимает «FRUIT_NOT_FOUND»/)
})

// Three layers on one code. The blocker is one per COLLIDING END, not one per ordered pair: a role
// repairing the artifact pays a redelegation per round, and n² lines of one defect drown the rest.
const THREE = `<frd grammar="1" goal="показать посылку по трек-номеру">
  <usecase id="UC1" actor="api-client" goal="получить посылку по треку">
    <pre>посылка с таким треком существует</pre>
    <post>вернулась одна посылка</post>
    <step n="1">клиент шлёт GET /parcels/{track}</step>
    <ext id="1a" error="PARCEL_NOT_FOUND" outcome="посылка не найдена, вернуто HTTP 404"/>
  </usecase>
  <usecase id="UC2" actor="operator-ui" goal="открыть карточку посылки">
    <pre>оператор на странице реестра</pre>
    <post>карточка посылки открыта</post>
    <step n="1">оператор кликает на строку реестра</step>
    <ext id="2a" error="PARCEL_NOT_FOUND" outcome="карточка не открыта, на экране сообщение об отсутствии"/>
  </usecase>
  <usecase id="UC3" actor="courier-app" goal="показать посылку курьеру">
    <pre>курьер отсканировал трек</pre>
    <post>посылка показана в приложении курьера</post>
    <step n="1">приложение шлёт GET /parcels/{track}</step>
    <ext id="3a" error="PARCEL_NOT_FOUND" outcome="приложение показывает экран «посылка не в вашем маршруте»"/>
  </usecase>
  <failure code="PARCEL_NOT_FOUND" status="404" client="показать «не найдено»" operator="—" from="UC1/1a UC2/2a UC3/3a"/>
</frd>`

const ONE_TEXT = "посылка не найдена, вернуто HTTP 404"

test("F6c: три use case на одном коде — два блокера, по одному на столкнувшийся конец, не n²", () => {
  assert.deepEqual(rule(THREE, "F6"), [])           // three layers, three observations: legal

  const merged = THREE
    .replace("карточка не открыта, на экране сообщение об отсутствии", ONE_TEXT)
    .replace("приложение показывает экран «посылка не в вашем маршруте»", ONE_TEXT)
  assert.equal(rule(merged, "F6c").length, 2)
  assert.deepEqual(rule(merged, "F6d"), [])         // покрытие полное — судится только текст

  // …and the rule does NOT touch two branches of ONE use case carrying one observation: that is a
  // legal shape, judged by the dictionary rule of step 9 and not here.
  const twinsInOneUc = THREE
    .replace('<ext id="1a" error="PARCEL_NOT_FOUND" outcome="' + ONE_TEXT + '"/>',
             '<ext id="1a" error="PARCEL_NOT_FOUND" outcome="' + ONE_TEXT + '"/>\n    <ext id="1b" error="PARCEL_NOT_FOUND" outcome="' + ONE_TEXT + '"/>')
    .replace('from="UC1/1a', 'from="UC1/1a UC1/1b')
  assert.deepEqual(rule(twinsInOneUc, "F6"), [])
})

// A code that is missing from the failure map ENTIRELY is one defect and one blocker — F6's. F6d
// judges only the codes F6 is silent about, otherwise every such branch would arrive twice in FEEDBACK.
test("F6d молчит там, где судит F6: код вне карты отказов даёт один блокер, не два", () => {
  const orphan = THREE.replace(/\n\s*<failure [^>]*\/>/, '\n  <failures found="no" why="кодов у изменения нет"/>')
  const b = rule(orphan, "F6")
  assert.equal(b.filter((x) => x.startsWith("F6d")).length, 0, b.join("\n"))
  assert.equal(b.length, 1)                          // F6 speaks ONCE per code, and nothing else speaks
  assert.match(b[0], /F6 код «PARCEL_NOT_FOUND» из <ext> не описан/)
})

// ПОЧИНКА ЗА ОДИН КРУГ. Живой прогон 19.08.2026: гардрейл вернул 8 блокеров, роль чинила их по
// одному и сожгла три круга из шести. Ни роль, ни наряд НИКОГДА не говорили «закрой все» — оба
// говорили «правь ровно названные места» (это про «не трогай остальное»), а пример показывал ОДИН
// блокер, и слабая модель читала его буквально. Снять счёт строк — дефект вернётся.
// ПЕТЛЯ «КРИТИК → РОЛЬ»: КОД РЕШАЕТ, КАКОЙ РЕМОНТ. Найдено чтением петли после переезда критика
// (наряд J6e): оба текста говорили роли, что критик «оценил ПЛАН, построенный из твоего FRD» — плана
// на шаге 11 больше нет вовсе, — и оба несли ОДНО правило ремонта на все коды: «требование не чинится
// удалением элемента». Для `invented-value` это прямо наоборот: элемент, которого не просит ни одно
// требование, чинится именно удалением. Роль, поверившая старому тексту, не могла закрыть блокер
// вообще: удалять запрещено, а других способов у неё нет.
//
// Гардрейл при этом прав и трогать его не надо: F9 судит ТОЛЬКО `goal-not-delivered`
// (`frd.mjs`, `if (!r || r.code !== "goal-not-delivered") continue`), то есть тупика в коде нет — он
// был в словах.
test("роль и наряд: у каждого кода критика свой ремонт, и удаление разрешено ровно одному", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  // Таблица «код → ремонт» живёт В РОЛИ и только там: она одна на четыре прохода, а наряд прохода
  // отсылает к ней строкой `critic:` (шов выше). Копия таблицы в четырёх нарядах разошлась бы с ролью
  // на первой же правке — ровно то, что запрещает CLAUDE.md.
  for (const text of [role]) {
    // Предмет критика — требование, а не план: плана на шаге 11 не существует.
    assert.match(text, /step 11 read (your|this) FRD against `TASK\.md` and `brd\.md`/)
    assert.equal(/evaluated the (PLAN|plan) built from/.test(text), false, "текст всё ещё обещает роли план")
    // Каждый код назван вместе со своим ремонтом.
    for (const code of ["requirement-not-carried", "invented-value", "goal-not-delivered", "open-question"]) {
      assert.match(text, new RegExp(code), code)
    }
    // Удаление — ремонт РОВНО для invented-value, и для goal-not-delivered прямо запрещено (F9).
    assert.match(text, /invented-value[\s\S]{0,400}(REMOVE|removal|Удали|remove)/i)
    assert.match(text, /goal-not-delivered[\s\S]{0,400}F9/)
  }
})

test("роль и наряд велят закрыть ВСЕ строки FEEDBACK за один круг", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  assert.match(role, /CLOSE EVERY LINE OF THE FEEDBACK IN THIS ONE ANSWER/)
  assert.match(tpl, /COUNT THE LINES AND CLOSE THEM ALL IN THIS ANSWER/)
  // Пример в роли показывает НЕСКОЛЬКО блокеров и столько же правок: один блокер в примере и есть
  // инструкция «чини один».
  const example = (role.match(/FEEDBACK: F2b[\s\S]*?```/) || [""])[0]
  assert.ok((example.match(/^\s+F\d/gm) || []).length >= 2, "пример почин­ки показывает один блокер")
  assert.match(example, /3 lines, so 3 edits/)
})

test("роль и наряд несут свои строки про F6c/F6d", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  assert.match(role, /Branch `outcome` is the negation of that use case’s own `<post>`/)
  assert.match(role, /Do not describe one layer’s failure in the words of another layer[\s\S]*?`F6c`/)
  assert.match(role, /Do not leave a branch whose code is absent from the `from` of that code’s line[\s\S]*?`F6d`/)
  // F6c судит КОНЦЫ — пласт A; F6d судит карту отказов — пласт C. Каждое правило названо в наряде
  // своего прохода, и ни в каком другом (steps/intake/frd.mjs::RULE_PASS).
  assert.match(TPL("a"), /Two ends of different use cases with identical text → F6c/)
  assert.match(TPL("c"), /from="UC1\/1a UC2\/2a"/)
  assert.match(TPL("c"), /A branch whose code is not listed in the `from` of that code’s failure line → F6d/)
})

// --- F3c: a delta no scenario answers for — the guard against runs 300c545b and 9ae1c092 ----------
// Fixtures COPIED VERBATIM from sandbox/runbox/eddi/.agent/frd.xml: the two deltas the swarm escalated
// on (`:163`, `:167`) and the two scenarios whose routes run right past their nodes (`:182`, `:209`).
// Step 9's rule 2 printed exactly these two paths, terminally, TWICE — 863 666 tokens and $1.42 for one
// deficit of step 6. `rule()` above calls checkFrd with no map, so F3/F4 speak about every path here;
// only the F3c family is read, which is the whole point of the filter.
const D_IREST = '  <delta op="IRestGlossaryStore interface" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/IRestGlossaryStore.java" new="yes"/>'
const D_REMOTE = '  <delta op="readGlossaries()" form="Added" node="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java" from="readSnippets" to="readSnippets/readGlossaries"/>'
const S1_EDDI = '  <scenario id="S1" uc="UC1" before="POST /glossarystore/glossaries -&gt; 404 (endpoint не существует)" after="POST /glossarystore/glossaries -&gt; 201 Created с Location" nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/IGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/mongo/GlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java"/>'
const S10_EDDI = '  <scenario id="S10" uc="UC10" before="ZIP-архив агента не содержит Глоссарии" after="ZIP-архив агента содержит Глоссарии со всеми Терминами" nodes="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java src/main/java/ai/labs/eddi/backup/IResourceSource.java"/>'
const FRD_300 = `<frd grammar="1" goal="Глоссарии как ресурс с Терминами">
${D_IREST}
${D_REMOTE}
${S1_EDDI}
${S10_EDDI}
</frd>`

test("F3c: узел с дельтой, которого не называет ни один сценарий — два блокера прогонов 300c545b/9ae1c092", () => {
  const b = rule(FRD_300, "F3c")
  assert.equal(b.length, 2, b.join("\n"))
  assert.match(b[0], /^F3c дельта на «src\/main\/java\/ai\/labs\/eddi\/configs\/glossaries\/IRestGlossaryStore\.java» без сценария/)
  assert.match(b[1], /^F3c дельта на «src\/main\/java\/ai\/labs\/eddi\/backup\/impl\/RemoteApiResourceSource\.java» без сценария/)
  // All three exits, one command each: without the third the role invents a use case for a service
  // module instead of admitting the node moves behind its neighbour (`.agent.bak-20260815`).
  // Блокер НАЗЫВАЕТ кандидатов: слабая модель выбирает из списка и не выводит из описания. Убери
  // список — и вернётся живой дефект 19.08.2026: три круга подряд шесть F3c на РАЗНЫХ узлах, потому
  // что роль переписывала дельты вместо того, чтобы дописать узел в сценарий.
  assert.match(b[0], /в nodes ОДНОГО из этих сценариев: S1 \(UC1\) · S10 \(UC10\)/)
  assert.match(b[0], /напиши новый <scenario id="…" uc="…" before="…" after="…" nodes="src\/main\/java\/ai\/labs\/eddi\/configs\/glossaries\/IRestGlossaryStore\.java"\/>/)
  assert.match(b[0], /ни один из них через узел не идёт — напиши новый <scenario/)
  assert.match(b[0], /узел меняется лишь вслед за соседней дельтой — сними эту дельту$/)

  // The repair the first exit names: the same two deltas, their nodes written into the routes that
  // already run through their neighbours. Replacing `scenarioNodes` with `explained` in frd.mjs turns
  // the rule into a tautology — a delta explains itself — and the two assertions above go to zero.
  const fixed = FRD_300
    .replace('nodes="src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java',
             'nodes="src/main/java/ai/labs/eddi/configs/glossaries/IRestGlossaryStore.java src/main/java/ai/labs/eddi/configs/glossaries/rest/RestGlossaryStore.java')
    .replace('nodes="src/main/java/ai/labs/eddi/backup/impl/RestExportService.java',
             'nodes="src/main/java/ai/labs/eddi/backup/impl/RemoteApiResourceSource.java src/main/java/ai/labs/eddi/backup/impl/RestExportService.java')
  assert.deepEqual(rule(fixed, "F3c"), [])

  // Not judged, and neither absence is silence: `Unknown` is already terminal at step 7, and a delta
  // with no node at all is F3's own blocker — one defect, one line of FEEDBACK.
  const unknown = FRD_300.replace(D_IREST, '  <delta op="IRestGlossaryStore interface" form="Unknown" why="в карте два кандидата"/>').replace(D_REMOTE + "\n", "")
  assert.deepEqual(rule(unknown, "F3c"), [])
  const noNode = FRD_300.replace(D_IREST, '  <delta op="readGlossaries()" form="Added"/>').replace(D_REMOTE + "\n", "")
  assert.deepEqual(rule(noNode, "F3c"), [])
})

// F8 — ПОЛЕ, КОТОРОЕ НИКТО НЕ НАПИШЕТ. Формулировка правила куплена ПРОИГРЫШЕМ по четырём
// сохранённым формам: наивная («сущность резолвится и дельты нет») краснела на `Fruit.name` формы
// t2, где изменение поле только ЧИТАЕТ. Здесь те же четыре случая, но фикстурами.
const AGENT_CFG = "src/main/java/ai/labs/eddi/configs/agents/model/AgentConfiguration.java"
const FRUIT = "src/main/java/org/acme/rest/json/Fruit.java"
const TYPES = new Map([["AgentConfiguration", AGENT_CFG], ["Fruit", FRUIT]])
const MEMBERS = new Map([[AGENT_CFG, new Set(["AgentConfiguration"])], [FRUIT, new Set(["Fruit", "name", "description"])]])
const frd8 = (fields, extra = "") => `<frd grammar="1" goal="Глоссарии как ресурс">
  <delta op="Glossary model" form="Added" node="src/main/java/ai/labs/eddi/configs/glossaries/model/Glossary.java" new="yes"/>
${extra}
${fields}
</frd>`
const F_GLOSSARIES = '  <field name="glossaries" in="AgentConfiguration" type="array[string]" domain="ordered list" required="no" error="none" source="answers.md"/>'
const f8 = (xml, types = TYPES, members = MEMBERS) => checkFrd({ frd: parseFrd(xml), types, members }).filter((b) => b.startsWith("F8"))

test("F8: поле в чужой сущности без дельты — дефект прогона eddi/DOS-535", () => {
  const b = f8(frd8(F_GLOSSARIES))
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /поле «glossaries» объявлено в «AgentConfiguration»/)
  assert.match(b[0], new RegExp(AGENT_CFG.replace(/[/.]/g, "\\$&")))

  // Ремонт, который правило и называет: дельта на этот модуль — блокер снят.
  const withDelta = frd8(F_GLOSSARIES, `  <delta op="glossaries field" form="Added" node="${AGENT_CFG}" from="нет поля" to="список ссылок"/>`)
  assert.deepEqual(f8(withDelta), [])
  // Второй законный способ заявить модуль работой — touched.
  const withTouched = frd8(F_GLOSSARIES, `  <touched path="${AGENT_CFG}" why="читаем список ссылок"/>`)
  assert.deepEqual(f8(withTouched), [])
  // Дельта на СОСЕДНИЙ модуль не гасит: правило судит путь, а не пакет.
  const wrongDelta = frd8(F_GLOSSARIES, '  <delta op="x" form="Added" node="src/main/java/ai/labs/eddi/configs/agents/model/AgentIdentity.java"/>')
  assert.equal(f8(wrongDelta).length, 1)
})

test("F8 молчит там, где молчать обязано: новая сущность, существующее поле, пустая карта", () => {
  // Сущность, которой нет нигде, создаётся ЭТИМ изменением — требовать от неё дельту не по чему.
  const newEntity = '  <field name="terms" in="Glossary" type="array[Term]" domain="список пар" required="yes" error="none" source="brd.md"/>'
  assert.deepEqual(f8(frd8(newEntity)), [])
  // Поле, которое у сущности УЖЕ есть: изменение его читает, а не пишет (форма t2, поля Fruit).
  const existing = '  <field name="name" in="Fruit" type="string" domain="строка" required="yes" error="none" source="appgraph.xml"/>'
  assert.deepEqual(f8(frd8(existing)), [])
  // Без вычисленного графа таблицы пусты — правило молчит целиком, как F5 без sources.
  assert.deepEqual(f8(frd8(F_GLOSSARIES), new Map(), new Map()), [])
})

// F10 — КАНАЛ USE CASE ПРИНАДЛЕЖИТ ЕГО СОБСТВЕННЫМ УЗЛАМ. Живой прогон eddi: один актёрский
// `via="HTTP /glossarystore/glossaries"` достался всем восьми use case, включая экспорт и импорт
// агента; граничные наряды 05-07 велели проверять экспорт через CRUD словарей. Проигрыш правила по
// сохранённому FRD eddi даёт РОВНО три блокера — UC6, UC7, UC8.
const F10_XML = `<frd grammar="1" goal="глоссарии">
  <actor name="api-client" kind="system" via="HTTP /glossarystore/glossaries"/>
  <usecase id="UC1" actor="api-client" goal="создать глоссарий">
    <post>создан</post><step n="1">клиент шлёт POST</step>
  </usecase>
  <usecase id="UC6" actor="api-client" goal="выгрузить агента с глоссариями">
    <post>в архиве лежат глоссарии</post><step n="1">клиент просит выгрузку агента</step>
  </usecase>
  <delta op="POST /glossarystore/glossaries" form="Added" node="src/rest/RestGlossaryStore.java" new="yes"/>
  <delta op="exportAgent()" form="Changed" node="src/backup/RestExportService.java" from="без глоссариев" to="с глоссариями"/>
  <scenario id="S1" uc="UC1" before="404" after="201" nodes="src/rest/RestGlossaryStore.java"/>
  <scenario id="S6" uc="UC6" before="архив без глоссариев" after="архив с глоссариями" nodes="src/backup/RestExportService.java"/>
</frd>`
const f10 = (xml, routes = []) => checkFrd({ frd: parseFrd(xml), routes }).filter((b) => b.startsWith("F10"))

test("F10: канал актёра, доставшийся use case чужого узла — дефект прогона eddi/DOS-535", () => {
  const b = f10(F10_XML)
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /^F10 UC6 объявлен входящим через «HTTP \/glossarystore\/glossaries»/)
  assert.match(b[0], /src\/rest\/RestGlossaryStore\.java/)

  // Ремонт, который правило и называет: у use case появляется СВОЙ канал, и он принадлежит его узлу.
  const fixed = F10_XML.replace('<usecase id="UC6" actor="api-client"', '<usecase id="UC6" actor="api-client" via="HTTP POST /backup/export/{agentId}"')
  assert.deepEqual(f10(fixed, [{ at: "src/backup/RestExportService.java", name: "POST /backup/export/{agentId}" }]), [])
  // Владелец пути неизвестен — утверждать нечего, правило молчит.
  assert.deepEqual(f10(F10_XML.replace('<delta op="POST /glossarystore/glossaries" form="Added" node="src/rest/RestGlossaryStore.java" new="yes"/>', "")), [])
  // Канал без пути (`template data map injection` живого UC5) не судится вовсе.
  assert.deepEqual(f10(F10_XML.replace('via="HTTP /glossarystore/glossaries"', 'via="внедрение в карту данных шаблона"')), [])
})

// F11 — ПОКРЫТИЕ ТРЕБОВАНИЙ BRD, ПРЕДЪЯВЛЕННОЕ СТРОКОЙ. Форма t2, два прогона: требование
// нерегрессии не доехало до FRD ни одним элементом и не поймано никем — BRD входил в шаг 6 только
// словарём чисел. Роль проходит требования по одному и называет носителя; строку судит скрипт.
const F11_XML = `<frd grammar="1" goal="глоссарии">
  <usecase id="UC1" actor="api" goal="создать"><post>создан</post><step n="1">клиент шлёт POST</step></usecase>
  <delta op="POST /store" form="Added" node="src/rest/Store.java" new="yes"/>
  <scenario id="S1" uc="UC1" before="404" after="201" nodes="src/rest/Store.java"/>
  <carried req="R1" by="UC1/1"/>
</frd>`
const f11 = (xml, requirements) => checkFrd({ frd: parseFrd(xml), requirements }).filter((b) => b.startsWith("F11"))

test("F11: требование BRD, по которому роль не прошла, — блокер, называющий его номер", () => {
  // Правило — РАЗНОСТЬ ДВУХ СПИСКОВ НОМЕРОВ. Атрибут `by` не читается: живой прогон 4c8f26eb умер
  // на шаге 6, потому что правило судило ещё и адрес, а его словарь был уже языка требования —
  // роль шесть кругов называла верных носителей (`field:id` для «поля ресурса только id + version
  // + terms») и получала «такого элемента нет».
  assert.deepEqual(f11(F11_XML, ["R1"]), [])
  const b = f11(F11_XML, ["R1", "R2"])
  assert.equal(b.length, 1, b.join("\n"))
  assert.match(b[0], /требование R2 не пройдено/)
  assert.match(b[0], /<carried req="R2"/)

  // Любой носитель законен — судить его существование дальше не наше дело: кривой адрес всплывёт у
  // критика обратным списком, а пропавшая строка не всплывёт нигде.
  for (const by of ["S1", "src/rest/Store.java", "UC1", "field:id", "nfr:cache-ttl", "покрыто целиком"]) {
    assert.deepEqual(f11(F11_XML.replace('by="UC1/1"', `by="${by}"`), ["R1"]), [], by)
  }

  // Требований не дали (промоутнутый артефакт, resume) — правило молчит целиком.
  assert.deepEqual(f11(F11_XML, []), [])
})

// УЗЕЛ ИЗМЕНЕНИЯ — ФАЙЛ РЕПОЗИТОРИЯ, А НЕ ТОЛЬКО КЛЕТКА ФОКУСА (наряд J15).
//
// Живой прогон 19.08.2026: роль получила от оператора путь `AgentConfiguration.java` и упёрлась в
// тупик — F2 требовал ключ узла `appgraph.xml`, а рой этот файл не читал (86 узлов фокуса против 6890
// объявлений вычисленного графа). Выхода в грамматике не было, и роль написала `form="Unknown"`: факт
// был, а места для него нет. Рой читает клетки фокуса — это решение БЮДЖЕТА, и оно не должно решать,
// что существует.
const OUTSIDE = "src/main/java/app/configs/AgentConfiguration.java"
const J15_XML = `<frd grammar="1" goal="привязать глоссарии к агенту">
  <usecase id="UC1" actor="api" goal="привязать глоссарий"><post>ссылка сохранена</post><step n="1">клиент шлёт PUT</step></usecase>
  <delta op="glossaries field" form="Changed" node="${OUTSIDE}" from="нет поля" to="список ссылок"/>
  <touched path="${OUTSIDE}" why="появляется список ссылок на глоссарии"/>
  <scenario id="S1" uc="UC1" before="поля нет" after="поле есть" nodes="${OUTSIDE}"/>
</frd>`
const j15 = (xml, members) => checkFrd({ frd: parseFrd(xml), nodes: new Set(["src/rest/Store.java"]), members })

test("F2/F3/F4: путь, известный вычисленному графу, — законный узел изменения", () => {
  // Файл есть в репозитории (его знает graph-computed), но рой его не читал — блокеров нет.
  const known = new Map([[OUTSIDE, new Set(["AgentConfiguration"])]])
  assert.deepEqual(j15(J15_XML, known).filter((b) => /^F[234] /.test(b)), [])

  // Того же артефакта БЕЗ вычисленного графа хватает, чтобы правило вело себя как раньше: путь вне
  // карты роя — выдумка. Сними `computedPaths` из checkFrd — этот случай перестанет отличаться от
  // предыдущего, и тупик прогона вернётся.
  const blind = j15(J15_XML, new Map()).filter((b) => /^F[234] /.test(b))
  assert.ok(blind.length >= 2, blind.join("\n"))
  assert.match(blind.join("\n"), /F2 touched «[^»]*AgentConfiguration\.java» не резолвится ни в узел карты роя/)

  // И выдуманный путь остаётся выдумкой при любом графе: судится РЕПОЗИТОРИЙ, а не доверчивость.
  const invented = J15_XML.replace(new RegExp(OUTSIDE, "g"), "src/main/java/app/Nowhere.java")
  assert.ok(j15(invented, known).some((b) => b.startsWith("F2 ")), "выдуманный путь принят")
})

// EDIT ИЛИ WRITE РЕШАЕТ PREVIOUS, А НЕ FEEDBACK.
//
// Рельса lookup создала состояние, которого раньше не было: FEEDBACK НЕ ПУСТ (в нём ответ
// репозитория), а файла ещё нет — роль спросила справку, ничего не написав. Прежняя инструкция
// («write когда FEEDBACK пуст, edit когда есть») в этом состоянии требовала править несуществующее.
// Расхождение инструкции с состоянием — наша ошибка формулировки, и ловится она здесь.
test("роль и наряд: пустой PREVIOUS означает write, даже когда FEEDBACK не пуст", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const TPL = (x) => readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")
  const tpl = ["a", "b", "c", "d"].map(TPL).join("\n")
  assert.match(role, /THE PREVIOUS BLOCK DECIDES/)
  assert.match(role, /`write` when PREVIOUS is empty/)
  assert.match(role, /`edit` when PREVIOUS carries your file/)
  assert.match(role, /you asked for a `lookup` and wrote nothing yet/)
  assert.match(tpl, /Empty here means NOTHING IS WRITTEN YET/)
  // Блок PREVIOUS не смеет утверждать, что файл ЧТО-ТО провалил: после круга `lookup` он ничего не
  // проваливал, и роль, поверившая заголовку, пойдёт искать в своём тексте несуществующий дефект.
  assert.equal(/the exact file that failed validation/.test(tpl), false)
  assert.match(tpl, /Do not hunt this text for a fault nobody reported/)
  // Прежнее правило, привязанное к FEEDBACK, в текстах остаться не должно.
  assert.equal(/`write` when FEEDBACK is empty/.test(role), false, "старое правило edit/write ещё в роли")
})

// ИНТЕРФЕЙС И РЕАЛИЗАЦИЯ — ОДНА РАБОТА, И ПРАВИЛА ОБЯЗАНЫ ЭТО ВИДЕТЬ.
//
// Живой прогон eddi 19.08.2026, два круга подряд: F10 объявлял канал чужим, потому что эндпоинт
// объявлен ИНТЕРФЕЙСОМ (`IRestImportService`), а в узлах сценария стоит реализация; F3 объявлял
// «ломаться нечему», потому что у класса, подключаемого контейнером, входящего ребра в карте РОЯ
// нет. Оба ребра лежат в вычисленном графе шага 3. Сними `links` — оба ложных блокера вернутся.
const LINKS = [{ from: "src/rest/RestStore.java", to: "src/rest/IRestStore.java" }]
const IFACE_XML = `<frd grammar="1" goal="выгрузка">
  <actor name="api" kind="system" via="HTTP POST /store/export"/>
  <usecase id="UC1" actor="api" goal="выгрузить"><post>архив собран</post><step n="1">клиент шлёт POST /store/export</step></usecase>
  <delta op="export()" form="Changed" node="src/rest/RestStore.java" from="без архива" to="с архивом"/>
  <scenario id="S1" uc="UC1" before="нет архива" after="есть архив" nodes="src/rest/RestStore.java"/>
</frd>`
const iface = (links) => checkFrd({
  frd: parseFrd(IFACE_XML),
  nodes: new Set(["src/rest/RestStore.java", "src/rest/IRestStore.java"]),
  entries: new Set(["src/rest/IRestStore.java"]),
  edges: [{ from: "src/x.java", to: "src/rest/IRestStore.java" }],
  routes: [{ at: "src/rest/IRestStore.java", name: "POST /store/export" }],
  links,
}).filter((b) => /^F(3|10) /.test(b))

test("F10/F3: владелец эндпоинта — интерфейс, работа — у реализации; ребро связывает их", () => {
  assert.deepEqual(iface(LINKS), [], "правила не видят связки интерфейс → реализация")
  const blind = iface([])
  assert.ok(blind.length >= 1, "без рёбер вычисленного графа ложные блокеры обязаны вернуться")
  assert.match(blind.join("\n"), /F(3|10) /)
})

// ПЛАСТЫ ПРОХОДОВ (P1). Шов один и тот же с двух сторон: правило будущего пласта молчит, правило
// закрытого — нет.
test("пласт — у каждого кода, который checkFrd умеет напечатать, объявлен пласт", () => {
  const src = readFileSync(new URL("./frd.mjs", import.meta.url), "utf8")
  // коды берутся из ИСХОДНИКА, а не из списка в тесте: правило, добавленное без записи в
  // RULE_PASS, обязано ронять этот тест, а не тихо звучать во всех проходах
  const emitted = new Set(
    [...src.matchAll(/(?:B\.push\(|provenance\()[`'"]?(F\d+[a-z]*)\b/g)].map((m) => m[1]),
  )
  const bare = [...src.matchAll(/push\(`(F\d+[a-z]*)\b/g)].map((m) => m[1])
  for (const c of bare) emitted.add(c)
  assert.ok(emitted.size >= 15, `коды не нашлись в исходнике: ${emitted.size}`)
  const orphan = [...emitted].filter((c) => !RULE_PASS[c])
  assert.deepEqual(orphan, [], `коды без пласта: ${orphan.join(", ")}`)
})

test("пласт — артефакт из одних use case зелен в проходе A и красен без пласта", () => {
  const xml = `<frd goal="глоссарий подставляется в промпт">
    <actor name="оператор" kind="human" via="REST"/>
    <usecase id="UC1" actor="оператор" goal="завести термин">
      <pre>агент существует</pre><post>термин доступен подстановке</post>
      <step n="1">оператор шлёт термин</step>
    </usecase>
  </frd>`
  const frd = parseFrd(xml)
  assert.deepEqual(checkFrd({ frd, pass: "A" }), [])
  const full = checkFrd({ frd })
  assert.ok(full.length > 0, "полный суд обязан назвать недостающие пласты")
  assert.ok(full.some((b) => b.startsWith("F7")), "полный суд не заметил отсутствия дельт")
})

test("пласт — правило будущего пласта молчит, правило закрытого — звучит", () => {
  // дельта есть, сценария нет: F3c и F4 — пласт B; F6 (карта отказов) — пласт C
  const frd = parseFrd(`<frd goal="цель">
    <usecase id="UC1" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
    <delta node="a/b/C.java" form="Added" op="POST /x" from="нет" to="есть"/>
  </frd>`)
  const nodes = new Set(["a/b/C.java"])
  const b = checkFrd({ frd, nodes, pass: "B" })
  assert.ok(b.some((x) => x.startsWith("F4")), "проход B обязан требовать сценарий")
  assert.ok(!b.some((x) => x.startsWith("F6 ")), "карта отказов — пласт C, в B её судить нечем")
  // тот же артефакт в проходе C: пласт B уже закрыт, но роль его сломала — блокер обязан остаться
  const c = checkFrd({ frd, nodes, pass: "C" })
  assert.ok(c.some((x) => x.startsWith("F4")), "порча закрытого пласта не должна ждать конца прохода D")
  assert.ok(c.some((x) => x.startsWith("F6 ")), "проход C обязан требовать карту отказов")
})

test("пласт — F9 стоит в любом проходе: перемотку сторожат все", () => {
  const frd = parseFrd(`<frd goal="цель">
    <usecase id="UC1" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
  </frd>`)
  const rewind = [{ code: "goal-not-delivered", node: "UC2", evidence: "UC2" }]
  for (const pass of ["A", "B", "C", "D"]) {
    assert.ok(
      checkFrd({ frd, rewind, pass }).some((b) => b.startsWith("F9")),
      `проход ${pass} потерял сторожа перемотки`,
    )
  }
})

test("пласт — неизвестное имя прохода судит всем, а не ничем", () => {
  const blockers = ["F1 a", "F7 b", "F11 c"]
  assert.deepEqual(forPass(blockers, "Z"), blockers)
  assert.deepEqual(forPass(blockers, ""), blockers)
})

test("пласт — код, которого нет в таблице, звучит во ВСЕХ проходах, а не тонет в одном", () => {
  // правило, добавленное завтра и забытое в RULE_PASS, обязано быть шумным: молчание спрятало бы его
  // от всех четырёх проходов разом, и никто бы не заметил пропажи
  const fresh = "F42 новое правило: элемент X — напиши <x/>"
  for (const pass of ["A", "B", "C", "D"]) {
    assert.deepEqual(forPass([fresh], pass), [fresh], `проход ${pass} проглотил незнакомое правило`)
  }
})

test("пласт — правило-мост чинится РАНЬШЕ, чем видится: F8 виден в D, а закрывается дельтой пласта B", () => {
  const blocker = "F8 поле «terms» объявлено в «Glossary» (src/Glossary.java), но этот модуль не заявлен изменением"
  assert.equal(passOfBlocker(blocker), "D", "виден в пласте, где есть оба операнда")
  assert.equal(passOfBlocker(blocker, true), "B", "чинится там, где пишут дельты")
  // у остальных правил вопрос один и тот же
  assert.equal(passOfBlocker("F1 нет actor", true), "A")
  assert.equal(passOfBlocker("F5 число без источника", true), "C")
})

test("пласт — блокер F8 называет строку, которую надо написать", () => {
  const frd = parseFrd(`<frd goal="g">
    <usecase id="UC1" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
    <delta op="POST /x" form="Added" node="src/Other.java" from="нет" to="есть"/>
    <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/Other.java"/>
    <field name="terms" in="Glossary" type="map" domain="1..64" required="yes" source="brd.md"/>
  </frd>`)
  const types = new Map([["Glossary", "src/Glossary.java"]])
  const members = new Map([["src/Glossary.java", new Set(["id"])], ["src/Other.java", new Set()]])
  const f8 = checkFrd({ frd, nodes: new Set(["src/Other.java"]), types, members, pass: "D" }).filter((b) => b.startsWith("F8"))
  assert.equal(f8.length, 1)
  assert.match(f8[0], /<delta op="поле terms" form="Changed" node="src\/Glossary\.java"/, "нет образца строки — роль не знает, что писать")
  assert.match(f8[0], /сними строку <field name="terms">/, "не назван второй выход")
})

test("пласт — вход после красного полного суда: ранний из ЧИНЯЩИХ, а не из видящих", () => {
  // F8 виден в D, чинится в B — вход обязан быть B, иначе роль пласта D получит блокер, который её
  // наряд запрещает ей закрывать
  assert.equal(entryPass("F8 поле «terms» …"), "B")
  assert.equal(entryPass(["F11 требование R3 не пройдено"]), "D")
  assert.equal(entryPass("F5 число без источника\n  F1 нет actor"), "A")
  assert.equal(entryPass("F6 карта отказов пуста\n  F3 узла нет"), "B")
  assert.equal(entryPass(""), "A")
  assert.equal(entryPass(), "A")
})

// F0 — ЧИТАЕМОСТЬ РАНЬШЕ СУЖДЕНИЯ, и правило ходит парой с текстом, который его предупреждает.
test("F0: сырой < внутри значения атрибута — блокер, а не тихая потеря элемента", () => {
  const bad = `<frd goal="g">
  <usecase id="UC1" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
  <scenario id="S1" uc="UC1" before="нет подстановки; <code>{{glossary.<term>}}</code> не раскрыт" after="раскрыт" nodes="a/B.java"/>
</frd>`
  const found = unreadable(bad)
  assert.equal(found.length, 1, "элемент пропал из разбора молча")
  assert.match(found[0], /^F0 строка 3, атрибут before/)
  assert.match(found[0], /&lt;/, "не назван выход — как писать вместо этого")
  // и разбор действительно теряет элемент: это и есть цена молчания
  assert.equal(parseFrd(bad).scenarios.length, 0)

  // чистый артефакт молчит
  assert.deepEqual(unreadable(bad.replace(/<code>|<\/code>/g, "").replace("{{glossary.<term>}}", "{{glossary.TERM}}")), [])
  assert.deepEqual(unreadable(""), [])
  assert.deepEqual(unreadable(), [])
})

test("F0: роль и наряд пласта B предупреждают о значении атрибута ДО того, как оно стоит круга", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  // Пара «WRONG → RIGHT» стоит в наряде КАЖДОГО прохода, а не только в роли. Замер живого прогона
  // 19.08.2026: пласт B, у которого пара была, прошёл с первого круга; пласты A и C, у которых её не
  // было, встали на F0 — при том что закон 7a в роли действовал для всех троих. Правило рядом с
  // местом письма работает, правило в общем тексте — нет.
  const orders = ["a", "b", "c", "d"].map((x) => [`наряд ${x.toUpperCase()}`, readFileSync(new URL(`order-${x}.tpl`, import.meta.url), "utf8")])
  for (const [what, text] of [["роль", role], ...orders]) {
    assert.match(text, /ATTRIBUTE VALUES ARE PLAIN WORDS/, `${what} не несёт правила о значении атрибута`)
    assert.match(text, /WRONG\s+\w+="/, `${what} не показывает НЕВЕРНУЮ строку`)
    assert.match(text, /RIGHT\s+\w+="/, `${what} не показывает верную строку`)
  }
})

// F13 — ОТВЕТ ОПЕРАТОРА ОБЯЗАН БЫТЬ ПОТРАЧЕН. Фикстура — не выдумка: это пять обменов живого прогона
// eddi 19.08.2026 и то, что роль из них применила. Пауза человека самое дорогое в полосе, и ответ,
// не доехавший до артефакта, тратит её дважды.
test("F13: ответ с твёрдыми знаками, не встреченными в артефакте, — блокер", () => {
  const said = [
    { n: 1, question: "GET single glossary by id — not required, list only?", text: "да, нужен GET /glossarystore/glossaries/{id}" },
    { n: 2, question: "код ошибки при рендеринге?", text: "код ошибки 422 Unprocessable Entity" },
    { n: 3, question: "уровень слияния при импорте?", text: "замена набора терминов целиком, новая версия побеждает" },
  ]
  const xml = `<frd goal="g">
    <usecase id="UC1" actor="api" goal="list"><post>p</post><step n="1">GET /glossarystore/glossaries</step></usecase>
    <failure code="GLOSSARY_GONE" status="422" client="ссылка на удалённый глоссарий" from="UC1/1a"/>
  </frd>`
  const b = spentAnswers({ xml, said })
  assert.equal(b.length, 1, "поймано не ровно одно: " + b.map((x) => x.slice(0, 40)).join(" | "))
  assert.match(b[0], /GET \/glossarystore\/glossaries\/\{id\}/, "блокер не называет знак, которого нет")
  assert.match(b[0], /вернись к оператору вопросом/, "не назван второй выход — ответ мог устареть")

  // 422 потрачен — о нём молчим; «замена целиком» твёрдых знаков не имеет — о ней молчим тоже
  assert.equal(b[0].includes("422"), false)
  assert.equal(b.some((x) => x.includes("замена набора")), false, "правило судит то, чего судить нечем")
})

test("F13: тотальна и молчит, когда судить нечего", () => {
  assert.deepEqual(spentAnswers(), [])
  assert.deepEqual(spentAnswers({ xml: "<frd/>", said: [] }), [])
  assert.deepEqual(spentAnswers({ xml: "", said: [{ n: 1, question: "q", text: "просто слова без знаков" }] }), [])
  // ответ, чей знак В артефакте — молчание
  assert.deepEqual(spentAnswers({ xml: "<frd>TERM_KEY_INVALID</frd>", said: [{ n: 1, question: "q", text: "код TERM_KEY_INVALID" }] }), [])
})

// F14 — предмет требования со своим пакетом обязан иметь модуль в изменении. Один случай на каждую
// ветку антецедента: пакет есть и модуля нет · пакета нет · модуль есть · это аналог.
test("F14: предмет со своим пакетом и без модуля изменения — блокер; остальные ветки молчат", () => {
  const frd = parseFrd(`<frd goal="g">
    <usecase id="UC1" actor="оператор" goal="g"><post>p</post><step n="1">s</step></usecase>
    <delta op="POST /parcels" form="Added" node="src/parcels/ParcelResource.java" from="нет" to="есть"/>
    <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/parcels/ParcelResource.java"/>
  </frd>`)
  const dirs = new Set(["src/parcels", "src/carriers", "src/snippets"])
  const args = { frd, dirs, analogue: "Snippet", pass: "B" }

  // `carrier` — свой пакет в репозитории есть, модуля изменения в нём нет
  const b = checkFrd({ ...args, subjects: ["parcel", "carrier", "glossary", "snippet"] }).filter((x) => x.startsWith("F14"))
  assert.equal(b.length, 1, "поймано не ровно одно: " + b.map((x) => x.slice(0, 50)).join(" | "))
  assert.match(b[0], /«carrier»/)
  assert.match(b[0], /<delta node=/, "не назван первый выход")
  assert.match(b[0], /<question subject="carrier"/, "не назван выход «предмет не о работе»")
  // parcel — модуль есть · glossary — пакета нет, создаётся · snippet — аналог, его копируют
})

// Отговорка в комментарии — это не потраченный ответ: `<!-- … -->` не читает ни один потребитель
// артефакта, и до исполнителя из него не доезжает ничего.
test("F13: знак ответа в КОММЕНТАРИИ не засчитывается", () => {
  const said = [{ n: 1, question: "одиночное чтение?", text: "да, нужен GET /glossarystore/glossaries/{id}" }]
  const hidden = `<frd><uc id="UC1"/></frd>\n<!-- PENDING: GET /glossarystore/glossaries/{id} requested but out of scope -->`
  assert.equal(spentAnswers({ xml: hidden, said }).length, 1, "комментарий закрыл правило — ответ потерян молча")
  const spent = `<frd><step n="1">GET /glossarystore/glossaries/{id}</step></frd>`
  assert.deepEqual(spentAnswers({ xml: spent, said }), [], "ответ, вписанный в шаг, потрачен")
})

// ВХОД, КОТОРЫЙ НЕ ДОЕХАЛ ДО СУДА, ВЫКЛЮЧАЕТ ПРАВИЛО МОЛЧА. Правило без входа неотличимо от правила,
// которому нечего сказать: тесты среза зелены (они зовут `checkFrd` напрямую), а в продакшене оно
// не срабатывает никогда.
//
// BUG_FIX_CONTEXT: разбор 20.08.2026. F14 написан, испытан и объявлен ценой прогона 19.08.2026, где
// требование R11 («глоссарий подключён к агенту ссылкой в agent config») закрылось строкой
// `<carried req="R11" by="UC5/1"/>` — шаг ЧИТАЕТ ссылку, а не создаёт её. Хост считал `subjects`,
// `analogue` и `dirs` и передавал их в `newFrd`; `newFrd` вызывал `checkFrd` БЕЗ них. На артефакте
// того прогона правило даёт блокер про `agent` — то есть дыру ловило, но голоса не имело.
test("newFrd: предметы, аналог и каталоги доезжают до суда — F14 имеет голос", () => {
  assert.equal(build().ok, true, "фикстура должна быть зелёной без предметов")

  // Предмет требования, у которого в репозитории СВОЙ пакет, а изменение не трогает оттуда ничего.
  const dirs = new Set(["src/couriers"])
  const withSubject = newFrd({ xml: FRD, nodes: NODES, tests: TESTS, entries: ENTRIES, edges: EDGES,
    sources: SOURCES, subjects: ["courier"], dirs })
  assert.equal(withSubject.ok, false, "предмет со своим пакетом, которого не трогает ни одна дельта, прошёл")
  assert.match(withSubject.error.detail, /F14 предмет требования «courier»/)

  // Аналог копируют, а не меняют: он гасит правило — и этот вход тоже обязан доехать.
  assert.equal(newFrd({ xml: FRD, nodes: NODES, tests: TESTS, entries: ENTRIES, edges: EDGES,
    sources: SOURCES, subjects: ["courier"], dirs, analogue: "couriers — по образцу" }).ok,
    true, "аналог не гасит F14 — вход `analogue` до суда не доехал")
})
