// Slice `intake`: the requirement fried against the map — a PURE core; its io lives in ext/index.mjs
// (standards/code.md: an io pipe is not unit-tested). Formula: 1 happy + Σ antecedent branches with a
// DISTINGUISHABLE consequent — here the seven rules of docs/intake.md §5, each built by REINTRODUCING
// the defect into a green fixture, so the seam is proven rather than claimed.

import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { newFrd, parseFrd, checkFrd, FRD_FORM } from "./frd.mjs"
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
            after="отдаёт только посылки с AB в треке" nodes="src/ParcelResource.java"/>
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
  const viaRoute = bare.replace('nodes="src/ParcelResource.java"', 'nodes="src/ParcelResource.java src/Parcel.java"')
  assert.deepEqual(blockersOf(viaRoute), [])
})

test("F3: an invented form, an Unknown without why, a node outside the map and outside touched", () => {
  assert.match(blockersOf(FRD.replace('form="Added"', 'form="Modified"')).join("\n"), /F3 findByTrack: form="Modified"/)
  assert.match(blockersOf(FRD.replace('form="Added" node="src/ParcelRepo.java"', 'form="Unknown"')).join("\n"), /F3 findByTrack: Unknown без why/)
  assert.match(blockersOf(FRD.replace('node="src/ParcelRepo.java"', 'node="src/Invented.java"')).join("\n"), /F3 findByTrack: узла «src\/Invented\.java» нет в карте/)
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
  )
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
  assert.match(blockersOf(FRD.replace('nodes="src/ParcelResource.java"', 'nodes=""')).join("\n"), /F4 S1: nodes пуст/)
  assert.match(blockersOf(FRD.replace('nodes="src/ParcelResource.java"', 'nodes="src/Invented.java"')).join("\n"),
    /F4 S1: узла «src\/Invented.java» нет ни в карте, ни среди создаваемых/)
  // A route of several nodes is the ordinary case — whitespace-separated, every one resolved.
  assert.deepEqual(blockersOf(FRD.replace('nodes="src/ParcelResource.java"', 'nodes="src/ParcelResource.java src/ParcelRepo.java"')), [])
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
    /F3 parcel card page: new="yes", но узел «src\/ui\/parcels.html» ЕСТЬ в карте/)
  // A module that does not exist yet has no contract to move.
  assert.match(blockersOf(WITH_NEW.replace('form="Added" node="' + NEW_PAGE + '" new="yes"', `form="Changed" node="${NEW_PAGE}" new="yes" from="одна колонка" to="две колонки"`)).join("\n"),
    /F3 parcel card page: new="yes" с формой Changed/)
  // Without the declaration the path is what it has always been: invented.
  assert.match(blockersOf(WITH_NEW.replace(' new="yes"', "")).join("\n"),
    /F3 parcel card page: узла «src\/ui\/parcel-card.html» нет в карте — либо это Unknown, либо путь выдуман, либо модуль создаётся/)
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

test("F2c holds for a created node too — its why is the only place the artifact says what it is for", () => {
  const b = blockersOf(WITH_NEW.replace(' why="новая страница карточки посылки, создаётся этим изменением"', ""))
  assert.match(b.join("\n"), new RegExp(`F2c touched «${NEW_PAGE}» без why`))
})

test("F5: a number with no source among the sources, and a source outside the vocabulary", () => {
  const invented = FRD.replace('fit="не больше 20 записей"', 'fit="не больше 50 записей"')
  assert.match(blockersOf(invented).join("\n"), /F5 нфт response-size \[invented-default\]: число 50/)
  assert.match(blockersOf(FRD.replace('source="TASK.md"', 'source="здравый смысл"')).join("\n"), /F5 поле track: source="здравый смысл"/)

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
test("F6b: a branch that fails without a code says so — error=\"none\" is an answer, not a code", () => {
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
test("F6a: an empty failure map is a blocker unless it is DECLARED empty, with a reason", () => {
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

// The order is a file the host reads, not code, but prompt() demands an EXACT bidirectional match
// between its placeholders and the values the workflow passes (execution.ts: "Missing prompt value" /
// "Unused prompt value" both throw) — a mismatch kills the run at launch, not at review.
// S33: `QUESTIONS_LEFT` is gone with the budget of questions itself. A count handed to a role as
// "left in this run" is read as an allowance to spend, and two live runs spent it (core/budgets.mjs).
const ORDER_KEYS = ["BRD", "MAP", "ANSWERS", "FEEDBACK", "STAGING", "CHECK", "DELTA_FORMS", "SOURCES"]
const placeholders = (tpl) =>
  [...tpl.matchAll(/{{|}}|{([A-Za-z_$][\w$]*)}/g)].flatMap((m) => (m[1] === undefined ? [] : [m[1]]))

test("order.tpl uses exactly the keys the workflow passes", () => {
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  assert.deepEqual([...new Set(placeholders(tpl))].sort(), [...ORDER_KEYS].sort())
})

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
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
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
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
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
  assert.match(tpl, /На каждый `<usecase>` — свой `<scenario uc="…">`/)
  const selfcheck = tpl.match(/\$START_SELFCHECK[\s\S]*?\$END_SELFCHECK/)
  assert.ok(selfcheck, "наряд обязан нести блок $START_SELFCHECK")
  assert.equal((selfcheck[0].match(/^\d\. /gm) || []).length, 7)
  assert.match(role, /Не оставляй `<usecase>` без сценария.*`F4b`/)
})

// S30g seam: since step 11 exists, a FEEDBACK line can come from TWO places, and they are not
// repaired the same way. A guardrail blocker is numbered by a rule and fixed pointwise; a critic
// blocker names a code and a node and says the REQUIREMENT is short. Without the distinction the
// role hunts for a rule number that does not exist and repairs the wrong thing. Drop either mention
// and this goes red.
test("role and order: a FEEDBACK line names its source, and the two are repaired differently", () => {
  const role = readFileSync(new URL("intake.md", import.meta.url), "utf8")
  const tpl = readFileSync(new URL("order.tpl", import.meta.url), "utf8")
  for (const [what, text] of [["role", role], ["order", tpl]]) {
    assert.match(text, /guardrail:/, `${what} must name the guardrail as a source of feedback`)
    assert.match(text, /critic:/, `${what} must name the critic as a source of feedback`)
  }
})
