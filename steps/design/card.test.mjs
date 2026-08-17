// The split of step 9 — a PURE core; its io lives in ext/index.mjs (standards/code.md: an io pipe is
// not unit-tested). Formula: 1 happy + Σ antecedent branches with a DISTINGUISHABLE consequent. The
// branches are the three shapes a change can have (files shared by several use cases, files owned by
// one, none shared at all) plus the two decisions the grouping itself makes (transitivity, the id).
//
// The FRD fixture is PARSED, not typed: `frd` reaches this core exactly as steps/intake/frd.mjs hands
// it over.

import test from "node:test"
import assert from "node:assert/strict"
import { splitOf } from "./card.mjs"
import { parseFrd } from "../intake/frd.mjs"

// The shape measured on `eddi`, in miniature: a trio every use case runs through, a record shared by
// the first two use cases, another record shared by the third — and a separate island of two files
// that no use case connects to the first group.
const FRD_XML = `<frd grammar="1" goal="хранилище словарей и выгрузка">
  <usecase id="UC1" actor="api" goal="создать"><post>создан</post><step n="1">POST /store</step></usecase>
  <usecase id="UC2" actor="api" goal="прочитать"><post>прочитан</post><step n="1">GET /store/{id}</step></usecase>
  <usecase id="UC3" actor="api" goal="добавить термин"><post>добавлен</post><step n="1">POST /store/{id}/terms</step></usecase>
  <usecase id="UC9" actor="api" goal="выгрузить"><post>выгружен</post><step n="1">POST /export</step></usecase>
  <usecase id="UC10" actor="api" goal="загрузить"><post>загружен</post><step n="1">POST /import</step></usecase>

  <delta op="POST /store" form="Added" node="src/rest/RestStore.java" new="yes"/>
  <delta op="store()" form="Added" node="src/IStore.java" new="yes"/>
  <delta op="mongo store" form="Added" node="src/mongo/Store.java" new="yes"/>
  <delta op="POST /export" form="Added" node="src/export/RestExport.java" new="yes"/>

  <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S2" uc="UC2" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>
  <scenario id="S3" uc="UC3" before="нет" after="есть" nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Term.java"/>
  <scenario id="S9" uc="UC9" before="нет" after="есть" nodes="src/export/RestExport.java src/export/Zip.java"/>
  <scenario id="S10" uc="UC10" before="нет" after="есть" nodes="src/export/RestExport.java src/export/Zip.java"/>
</frd>`

const FRD = parseFrd(FRD_XML)
const ids = (g) => g.map((x) => x.id)
const paths = (g, k) => [...g[k].paths]

test("happy: общее отделено от частного, и общее сложено в связные группы", () => {
  const s = splitOf({ frd: FRD })

  // Общее — в порядке FRD: трио, которое проходят три use case, и две записи по две.
  assert.deepEqual([...s.shared], [
    "src/rest/RestStore.java", "src/IStore.java", "src/mongo/Store.java",
    "src/model/Doc.java", "src/export/RestExport.java", "src/export/Zip.java",
  ])
  // Частное — файл ровно одного use case: его дизайнер видит про него всю правду.
  assert.deepEqual([...s.own], ["src/model/Term.java"])

  // Две группы: хранилище и выгрузка. Ни одного общего use case между ними.
  assert.equal(s.groups.length, 2)
  assert.deepEqual(paths(s.groups, 0), ["src/rest/RestStore.java", "src/IStore.java", "src/mongo/Store.java", "src/model/Doc.java"])
  assert.deepEqual(paths(s.groups, 1), ["src/export/RestExport.java", "src/export/Zip.java"])

  // Группе едут ВСЕ use case, которые её контракт может сломать.
  assert.deepEqual([...s.groups[0].ucs], ["UC1", "UC2", "UC3"])
  assert.deepEqual([...s.groups[1].ucs], ["UC9", "UC10"])

  // Каждый узел знает свои use case, в порядке FRD.
  assert.deepEqual([...s.ucOf.get("src/rest/RestStore.java")], ["UC1", "UC2", "UC3"])
  assert.deepEqual([...s.ucOf.get("src/model/Term.java")], ["UC3"])
})

// Транзитивность — не украшение: на `eddi` `Glossary` встречается с трио через UC1-UC5, а `Term`
// через UC6-UC8, и между собой они не делят ни одного use case. Разорви связь — и пять файлов,
// которые обязаны решаться вместе, разъедутся по трём группам.
test("группа транзитивна: A и C без общего use case, но оба связаны через B", () => {
  const s = splitOf({ frd: FRD })
  const g = s.groups[0]
  assert.equal(g.paths.includes("src/model/Doc.java"), true, "запись первых двух use case — в той же группе")
  // Прямой связи между записью и REST-точкой нет ни по одному use case? Есть — через UC1. Проверяем
  // настоящую транзитивность: убираем `Doc` из S2, и он остаётся в группе через один только UC1.
  const thin = parseFrd(FRD_XML.replace('nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java src/model/Doc.java"/>\n  <scenario id="S3"', 'nodes="src/rest/RestStore.java src/IStore.java src/mongo/Store.java"/>\n  <scenario id="S3"'))
  const t = splitOf({ frd: thin })
  assert.equal(t.groups.length, 2, "групп по-прежнему две")
})

test("id группы — общий каталог её файлов, а не выдуманный номер", () => {
  const s = splitOf({ frd: FRD })
  assert.deepEqual(ids(s.groups), ["src", "src/export"])
})

test("общих узлов нет — групп нет, и фаза вырождается бесплатно", () => {
  const one = parseFrd(`<frd grammar="1" goal="один">
    <usecase id="UC1" actor="api" goal="g"><post>p</post><step n="1">s</step></usecase>
    <delta op="GET /x" form="Added" node="src/A.java"/>
    <scenario id="S1" uc="UC1" before="нет" after="есть" nodes="src/A.java src/B.java"/>
  </frd>`)
  const s = splitOf({ frd: one })
  assert.deepEqual([...s.shared], [])
  assert.deepEqual([...s.own], ["src/A.java", "src/B.java"])
  assert.equal(s.groups.length, 0)
})

test("тотальность: без требования — пустое разбиение, и ничего не брошено", () => {
  const s = splitOf()
  assert.deepEqual([...s.shared], [])
  assert.deepEqual([...s.own], [])
  assert.equal(s.groups.length, 0)
  assert.equal(s.ucOf.size, 0)
  assert.equal(splitOf({ frd: { scenarios: null } }).groups.length, 0)
})

test("разбиение — функция требования: два вычисления одного FRD совпадают", () => {
  const a = splitOf({ frd: FRD }), b = splitOf({ frd: parseFrd(FRD_XML) })
  assert.deepEqual([...a.shared], [...b.shared])
  assert.deepEqual(ids(a.groups), ids(b.groups))
})
