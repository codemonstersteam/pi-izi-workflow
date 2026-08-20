// Slice `scope`: the computable facts of a source file — a PURE core. Formula: 1 happy (a file whose
// every dimension is present) + the branches with a DISTINGUISHABLE consequent — an extension with no
// rules, and a commented-out import that must NOT become a fact. Imports themselves are exercised
// where they are consumed (edges.test.mjs); here the subject is what the ROLE used to be asked for
// and no longer is: visibility, route annotations and drivers (backlog W5, W6).

import test from "node:test"
import assert from "node:assert/strict"
import { readSource } from "./source.mjs"

test("java: visibility from the modifier, route annotations, a driver from an import", () => {
  const s = readSource({
    path: "src/main/java/org/acme/FruitResource.java",
    text: `
      package org.acme.rest.json;
      import jakarta.ws.rs.GET;
      import jakarta.persistence.EntityManager;

      @Path("/fruits")
      public class FruitResource {
        @GET
        @Produces(MediaType.APPLICATION_JSON)
        public Set<Fruit> list() { return fruits; }

        private void reload(int limit) { }
      }`,
  })
  assert.equal(s.lang, "java")
  assert.equal(s.rules, true)
  assert.equal(s.pkg, "org.acme.rest.json")

  const cls = s.decls.find((d) => d.kind === "class")
  assert.equal(cls.name, "FruitResource")
  assert.equal(cls.visibility, "public")
  assert.deepEqual(cls.annotations, ['@Path("/fruits")'])

  const list = s.decls.find((d) => d.name.startsWith("list("))
  assert.equal(list.visibility, "public")
  assert.deepEqual(list.annotations, ["@GET", "@Produces(MediaType.APPLICATION_JSON)"])
  assert.equal(s.decls.find((d) => d.name.startsWith("reload(")).visibility, "internal")

  // A driver is an external system named by ONE import, before anything reads the body. A web
  // framework is not a driver: our own inbound HTTP is <api>, not <io> (steps/scope/part.mjs).
  assert.deepEqual(s.drivers.map((d) => d.kind), ["db"])
  assert.equal(s.drivers[0].spec, "jakarta.persistence.EntityManager")
})

// ВИДИМОСТЬ ЧЛЕНА ИНТЕРФЕЙСА — ГРАММАТИКА ЯЗЫКА, А НЕ НАЛИЧИЕ СЛОВА (наряд J1).
// Живой прогон eddi: IConversationMemory объявляет 20 методов, а карта несла ОДНО объявление — сам
// интерфейс, потому что `public` в теле интерфейса не пишут. Шов ловит ровно это: сними
// interfaceBodies/inInterface в source.mjs — и три метода ниже станут internal, то есть исчезнут из
// карты на шаге 3 (computed.mjs оставляет только публичное).
test("java: члены интерфейса публичны без ключевого слова, а явный private — нет", () => {
  const s = readSource({
    path: "src/main/java/ai/labs/eddi/memory/IConversationMemory.java",
    text: `
      package ai.labs.eddi.memory;

      public interface IConversationMemory {
        String CACHE_KEY = "conversation";

        String getAgentId();
        void setAgentId(String agentId);
        default int size() { return 0; }
        private void seal() { }
        <T> IResourceStorage<T> create(String name, Class<T> type);
      }

      class Helper {
        void hidden() { }
      }`,
  })

  const by = (n) => s.decls.find((d) => d.name.startsWith(n))
  assert.equal(by("getAgentId(").visibility, "public")
  assert.equal(by("setAgentId(").visibility, "public")
  assert.equal(by("size(").visibility, "public")
  // Java 9+ разрешает приватный метод интерфейса — единственное исключение из неявной публичности.
  assert.equal(by("seal(").visibility, "internal")
  // Константа интерфейса — public static final по грамматике, модификаторов у неё не пишут.
  assert.equal(s.decls.find((d) => d.kind === "field" && d.name === "CACHE_KEY").visibility, "public")
  // Тело интерфейса кончается на своей закрывающей скобке: метод соседнего класса не публичен.
  assert.equal(by("hidden(").visibility, "internal")
  // Метод с параметром типа впереди возвращаемого — тоже член интерфейса, и он тоже публичен.
  assert.equal(by("create(").visibility, "public")
  assert.equal(s.decls.filter((d) => d.kind === "method" && d.visibility === "public").length, 4)
})

test("go and ts: visibility is the leading case and the word export; a commented-out line is no fact", () => {
  const go = readSource({
    path: "internal/store/store.go",
    text: `package store
      // import "github.com/never/used"
      import "github.com/jackc/pgx/v5"
      func New(dsn string) *Store { return nil }
      func hidden() {}
      type Store struct{}`,
  })
  assert.deepEqual(go.imports.map((i) => i.spec), ["github.com/jackc/pgx/v5"])
  assert.deepEqual(go.drivers.map((d) => d.kind), ["db"])
  assert.equal(go.decls.find((d) => d.name.startsWith("New(")).visibility, "public")
  assert.equal(go.decls.find((d) => d.name.startsWith("hidden(")).visibility, "internal")
  assert.equal(go.decls.find((d) => d.kind === "type").visibility, "public")

  const ts = readSource({
    path: "web/src/api.ts",
    text: `import { Kafka } from "kafkajs"
      export function listFruits(limit: number) {}
      function helper() {}`,
  })
  assert.deepEqual(ts.drivers.map((d) => d.kind), ["queue"])
  assert.equal(ts.decls.find((d) => d.name.startsWith("listFruits")).visibility, "public")
  assert.equal(ts.decls.find((d) => d.name.startsWith("helper")).visibility, "internal")
})

test("an extension outside the table: no language, no rules, no facts — and it SAYS so", () => {
  const s = readSource({ path: "src/main/resources/import.sql", text: "INSERT INTO fruit VALUES (1);" })
  assert.equal(s.lang, "")
  assert.equal(s.rules, false)
  assert.deepEqual(s.imports, [])
  assert.deepEqual(s.decls, [])

  const kt = readSource({ path: "src/Main.kt", text: "package a\nimport a.B" })
  assert.equal(kt.lang, "kotlin")
  assert.equal(kt.rules, false)          // the language is known, its import rules are not: different facts

  assert.doesNotThrow(() => readSource())
  assert.equal(readSource().lang, "")
})
