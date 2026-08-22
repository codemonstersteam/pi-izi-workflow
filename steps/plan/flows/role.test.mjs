// ШОВ: список имён из примера роли и сам пример роли — одно и то же множество.
// Правило F13 отбивает значения, переписанные из примера; список живёт в flows.mjs, а пример — в
// flow-designer.md. Разъедутся — правило начнёт сторожить то, чего в роли уже нет, и пропустит то,
// что там появилось.
import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { EXAMPLE_NAMES } from "./flows.mjs"

const HERE = dirname(fileURLToPath(import.meta.url))
const role = readFileSync(join(HERE, "flow-designer.md"), "utf8")

test("шов примера: каждое имя из EXAMPLE_NAMES стоит в тексте роли", () => {
  for (const name of EXAMPLE_NAMES) {
    assert.ok(role.includes(name), `«${name}» есть в списке F13, но в роли его нет — правило сторожит призрак`)
  }
})

test("шов примера: доменные значения примера роли перечислены в EXAMPLE_NAMES", () => {
  const inExample = [...role.matchAll(/(?:in|out)="([^"]+)"/g)].map(([, v]) => v)
  const missed = [...new Set(inExample)].filter((v) => !EXAMPLE_NAMES.includes(v))
  assert.deepEqual(missed, [], `значения примера роли не покрыты F13: ${missed.join(" | ")} — модель перепишет их в ответ, и никто не отобьёт`)
})
