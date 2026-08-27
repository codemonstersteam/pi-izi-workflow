// Seam: roles declared in ROLES exist on disk as .md in their step folders; nothing
// undeclared lies there (a stray .md becomes a role and can kill the extension load).
import test from "node:test"
import assert from "node:assert/strict"
import { readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ROLES, MODULES, STEPS } from "./registry.ts"

const here = (p: string) => new URL(p, import.meta.url).pathname

test("объявленные роли лежат в папках шагов; необъявленных .md нет", () => {
  for (const [id, names] of Object.entries(ROLES)) {
    const dir = here(`../steps/${id}/`)
    assert.ok(existsSync(dir), `папка шага ${id} отсутствует`)
    for (const n of names) assert.ok(existsSync(join(dir, `${n}.md`)), `роль ${n} шага ${id} объявлена, файла нет`)
    const onDisk = readdirSync(dir).filter((f) => f.endsWith(".md")).map((f) => f.replace(/\.md$/, ""))
    for (const f of onDisk) assert.ok((names as string[]).includes(f), `${id}/${f}.md лежит в папке шага, но ролью не объявлена — хост зарегистрирует её молча`)
  }
})

test("у каждого шага есть голова (MODULES) и она на диске", () => {
  for (const id of STEPS) {
    const head = MODULES[id]
    assert.ok(head, `шаг ${id} без головы в MODULES`)
    assert.ok(existsSync(here(head)), `голова ${head} не найдена`)
  }
})
