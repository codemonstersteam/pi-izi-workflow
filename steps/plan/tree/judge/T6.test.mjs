// Units of T6: seed-модуль с Added → красный, без seed → зелёный, seed с Changed → зелёный.
import test from "node:test"
import assert from "node:assert/strict"
import { T6 } from "./T6.mjs"

test("T6: seed-модуль с delta=Added → блокер с именем файла", () => {
  const b = T6({
    modules: [{ path: "src/backup/RestExportService.java", delta: "Added" }],
    seeds: new Set(["src/backup/RestExportService.java"]),
  })
  assert.equal(b.length, 1)
  assert.match(b[0], /T6/)
  assert.match(b[0], /RestExportService\.java/)
  assert.match(b[0], /Changed/)
})

test("T6: seed-модуль с delta=Changed → зелёный", () => {
  const b = T6({
    modules: [{ path: "src/backup/RestExportService.java", delta: "Changed" }],
    seeds: new Set(["src/backup/RestExportService.java"]),
  })
  assert.equal(b.length, 0)
})

test("T6: не-seed модуль с delta=Added → зелёный (новый файл)", () => {
  const b = T6({
    modules: [{ path: "src/glossaries/model/Glossary.java", delta: "Added" }],
    seeds: new Set(["src/backup/RestExportService.java"]),
  })
  assert.equal(b.length, 0)
})

test("T6: пустой ввод → зелёный (тотален)", () => {
  assert.deepEqual(T6(), [])
  assert.deepEqual(T6({ modules: [], seeds: new Set() }), [])
})

test("T6: модуль без path → зелёный (не падает)", () => {
  assert.deepEqual(T6({ modules: [null, { delta: "Added" }], seeds: new Set() }), [])
})
