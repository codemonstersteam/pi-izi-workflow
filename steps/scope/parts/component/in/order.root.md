$START_TASK
Map cell root of this repository: one `<module>` per file, one `<gap>` per file that is genuinely
unreadable, what each module IS, what it EXPOSES and what it reaches OUTSIDE this repository.
Edges are already computed — you do not write them.
$END_TASK

$START_DATA
$START_DOCUMENT
files of cell root — the whole world of this run: these paths, and only these.

Each file appears as a DIGEST, not as its text: size and language, `package`, the imports a script
resolved inside this repository, the routes and drivers it read out of annotations and imports, then
one line per declaration (`+` public, `-` internal). Lines marked `(computed)` are facts — use them,
do not restate them.

Paths are relative to the run's root, and you are already in it. Copy them verbatim from the list;
never prefix them with a directory of your own.
$END_DOCUMENT
$START_CONTENT
SMALL CELL: every file comes as FULL TEXT below — the digest is skipped, and you have nothing to open with read
$START_FILE path=src/main/java/demo/Fruit.java (247 b)
package demo;

public class Fruit {

    public String name;
    public String description;

    public Fruit() {
    }

    public Fruit(String name, String description) {
        this.name = name;
        this.description = description;
    }
}

$END_FILE
$START_FILE path=src/main/java/demo/FruitResource.java (408 b)
package demo;

import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.MediaType;
import java.util.Collections;
import java.util.List;

@Path("/fruits")
public class FruitResource {

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public List<Fruit> list() {
        return Collections.singletonList(new Fruit("Apple", "a winter fruit"));
    }
}

$END_FILE
$START_FILE path=src/test/java/demo/FruitResourceTest.java (171 b)
package demo;

import org.junit.jupiter.api.Test;

public class FruitResourceTest {

    @Test
    public void listsFruits() {
        new FruitResource().list();
    }
}

$END_FILE
$END_CONTENT
$START_DOCUMENT
BRD anchors that matched something in this cell — a hint about what the change will care about.
They mark files, they do not select them: every file above is mapped regardless
$END_DOCUMENT
$START_CONTENT
- src/main/java/demo/Fruit.java — Fruit
- src/main/java/demo/FruitResource.java — Fruit
- src/test/java/demo/FruitResourceTest.java — Fruit
$END_CONTENT
$START_DOCUMENT
path: .agent/brd.md
the measurable requirement this survey serves — read it for context, never as a list of files
$END_DOCUMENT
$START_CONTENT
R1 add | Fruit | description field | second column of the fruit card
R2 serve | REST path | Fruit | /fruits following the store pattern
analogue: Legume — files 0; the neighbouring resource the Fruit endpoint is modeled after
subjects[]: Fruit
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- the digest IS the file for `<role>`, `<api>` and `<test>`. Open a file ONLY when its line says
  `no digest` or `NOT COMPUTED`, or when the declarations genuinely do not tell you what the file is.
  A `read` of a file the digest already answered is this run's budget spent on nothing — measured:
  run `615192d7` opened all 17 files of this cell and learned nothing the order had not printed
- every file above is closed by a `<module path>` or a `<gap path why>` — no file is left silent
- `path` is copied from the list verbatim; a path outside this cell does not belong in this part
- every `<module>` answers all THREE dimensions, with an element or with the explicit "none":
  external points — `<io>` … or `io="none"`;
  exposed surface — `<api>` … or `api="none"`;
  tests — `<test path>` … or `tests="none"`
- `<test path="…"/>` when a file of THIS cell tests this module, or when the module itself names its
  test. Write the PATH and nothing else: a suite id belongs to the spine cell, which is being read at
  the same moment as yours, so you cannot know it and must not guess — step 5 binds a test to its
  suite by path. A module with no test you can see carries `tests="none"`
- edges are NOT yours: a `<dep>` or a `deps="none"` anywhere in the part is a blocker. What this file
  imports inside the repository is printed above as `imports (computed)`, with the line it was read
  from; a script owns that measurement now. A library or framework is not an edge either way, and
  what crosses to another SYSTEM is `<io>`, not an import
- `<api kind="http|cli|event|lib" scope="public|internal" name="…">` — an entry point this file
  offers. `scope="public"` means it is reachable from OUTSIDE the process (an HTTP route, a CLI
  command, a consumed topic); `scope="internal"` means only other modules of this repository call it.
  For `kind="http"` the name is exactly `METHOD /path` — `GET /fruits`, uppercase method, no query
  string, no placeholders of your own. A `route (computed)` line above is already in that form — copy
  it. Routes registered by CALLS in the body (a router's `Handle("/x", …)`) are not computable and are
  yours to find
- `<io kind="http|db|queue|cache|blob|mail|rpc" dir="in|out" system="…" config="…" target="…"/>` —
  a point where this file reaches an EXTERNAL system: a database, a broker, another service. `system`
  is a short kebab-case label; `config` is the configuration key that carries the address when the
  address is not in the code; `target` is what you can see in the code (URL, topic, table). At least
  one of `config`/`target` is filled — an external point with neither is a guess. Your own inbound
  HTTP is `<api>`, not `<io>`; `dir="in"` only when the EXTERNAL system initiates (a queue consumer,
  a webhook). A `driver (computed)` line names the KIND only — an import cannot carry `system` or
  `config`, so completing the `<io>` from the file is yours
- a raw `<` inside an attribute value is written `&lt;`
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: .agent/staging/part~root.xml
ТВОЙ ПРОШЛЫЙ ОТВЕТ — тот самый файл, который забраковала проверка (пусто = первая попытка).
Это ПОЧИНКА, а не новый ответ: правь названные ниже места ЭТОГО текста, остальное оставь как есть.
Написанное заново ломает то, что проверку уже прошло.
$END_DOCUMENT
$START_CONTENT

$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
Evidence from the last red check, if this is a redelegation. Empty means the first attempt. Each
blocker carries its rule number and the path it is about — repair exactly what it names, first.
$START_CONTENT

$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: .agent/staging/part~root.xml
schema:
  <part cell="root" kind="survey">
    <module path="…">
      <role>…</role>
      <api name="…" kind="http" scope="public"/>
      <io kind="db" dir="out" system="…" config="…" target="…"/>
      <test path="…"/>
    </module>
    <module path="…" io="none" api="none" tests="none"><role>…</role></module>
    <gap path="…" why="…"/>
  </part>
check: the script judges the file you write at .agent/staging/part~root.xml by the part guardrail (grammar 4); a red verdict returns as FEEDBACK with rule numbers and paths
return: call workflow_result — the shape and the choice of rail are declared by your ROLE's
OUTPUT_FORMAT
$END_OUTPUT
