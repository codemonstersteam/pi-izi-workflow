# G6 — живой прогон шага 5 `graph`

Форма: `/tmp/quarkus-rest-json-app-v2-t1-3`. Два прогона: **чистый** (доказывает полосу целиком) и
**повторный** (доказывает кэш под грамматикой 3). Всё, что печатает модель, — не доказательство;
доказательство лежит на диске.

**Почему прогон обязателен, а юнитов мало.** Грамматика частей поднята 2→3: роль `scout` впервые
пишет `<artifact>` и `match` у сьюта. Ни одного живого факта о том, что она это делает, ещё нет —
юниты проверяли гардрейл, а не роль. Красный результат здесь — результат, а не провал этапа.

---

## 0. Подготовка (один раз)

```bash
cd /Users/mac/IdeaProjects/codemonstersdev/izi-pi-v2
node --test                      # обязано быть зелёным ЦЕЛИКОМ до всего остального
cd ext && npm install && cd ..
pi install ./ext                 # расширение 1.7.0: без переустановки buildGraph не существует
node bin/install.mjs --to=/tmp/quarkus-rest-json-app-v2-t1-3
```

**Перезапусти `pi` после `pi install`.** Расширение читается на СТАРТЕ сессии, воркфлоу — на каждом
прогоне; в старой сессии `buildGraph is not defined`, и `workflows/izi.js` это скажет прямым текстом.

---

## 1. Прогон №1 — с нуля

Состояние обнуляем ПОФАЙЛОВО, каталог проекта не трогаем: `rm -rf` каталога убивает cwd терминала, и
`pi` падает на `uv_cwd`.

```bash
rm -rf /tmp/quarkus-rest-json-app-v2-t1-3/.agent /tmp/quarkus-rest-json-app-v2-t1-3/.izi
ls /tmp/quarkus-rest-json-app-v2-t1-3          # TASK.md на месте, .agent/.izi нет
```

```bash
cd /tmp/quarkus-rest-json-app-v2-t1-3 && pi
```
в сессии: `/izi`

Роль `gilb` спросит про ограничение размера ответа — **отвечай прямо в чате** (`10` или
`не более 10 записей`). Модель сама вызовет `izi_answer` и `workflow_respond`.

### Что должно напечататься в лог прогона

```
survey-plan: files=17 bytes=… cells=2 edges=4 [java:edges:9 (unknown):no-rules:8]
scope: батч spine root
scope: cells=2 modules=15 gaps=0 cache-hit=0
graph: modules=15 components=2 isolated=5 levels=4 edges=8 suites=2 surface=4
graph: не найдено в репозитории — toggles, branching, contract, integrations (вопрос оператору на шаге 10)
graph: пробелов 2 — непрочитанное и вызываемое без объявленного входа
```

### Приёмка — по диску, не по чату

```bash
cd /tmp/quarkus-rest-json-app-v2-t1-3
head -3 .agent/appgraph.xml
grep -c "<module " .agent/appgraph.xml                       # 15
grep "<artifact"  .agent/appgraph.xml                        # name="rest-json-quickstart" root="."
grep "<suite "    .agent/appgraph.xml                        # у ОБОИХ match="…"
grep "FruitResourceIT" .agent/appgraph.xml | head -1         # kind="test" suite="component-native"
grep "FruitResourceTest.java\" kind=" .agent/appgraph.xml    # kind="test" suite="unit"
grep 'pkg="org.acme.rest.json"' .agent/appgraph.xml | wc -l  # 6 java-модулей с пакетом
grep "<systems/>\|<subject name=\"search\" found=\"no\"" .agent/appgraph.xml
```

| # | критерий | почему он тут |
|---|---|---|
| 1 | `track:"ok"` в `journal.json` прогона | единственный источник вердикта |
| 2 | `<artifact name="rest-json-quickstart" root="."/>` | **новое в G0** — роль впервые отвечает на седьмой вопрос |
| 3 | у обоих `<suite>` непустой `match` | **новое в G0**, и правило P6 обязано было это потребовать |
| 4 | `FruitResourceIT` → `suite="component-native"`, `FruitResourceTest` → `suite="unit"` | ради этого весь G0: иначе IT уехал бы командой юнитов и выполнил ноль тестов зелёным |
| 5 | 15 `<module>`, 2 `<component>`, 5 `<isolated>`, `levels="4"` | иерархия посчитана из рёбер (G2) |
| 6 | `pkg="org.acme.rest.json"` у java-модулей | G1 доехал |
| 7 | `<systems/>` пуст, `<subject name="search" found="no"/>` | «нет» — это ответ, а не молчание |
| 8 | `.agent/staging/` пуст | ни одна часть не была отвергнута |
| 9 | `.izi/parts/*.json` несут `"grammar": "3"` | кэш записан под новой грамматикой |

Журнал прогона — там же, где и всегда:
`~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/journal.json`
(запись `function/buildGraph/1` — вход и выход шага 5 дословно).

### Если красное

- `buildGraph is not defined` → сессия `pi` старше расширения: выйти, `pi install ./ext`, зайти снова.
- `P6 spine: <suite id="…"> shares path=…` → роль не написала `match`. Это дефект **наряда**
  (`steps/scope/order.spine.tpl`), а не гардрейла: гардрейл сработал правильно. Чинить формулировку,
  не правило.
- `P1 spine: <artifact> is missing` → то же самое про седьмой вопрос.
- `blocked: репозиторий к работе не готов` → хребет вернул `<suites found="no"/>`; смотреть
  `.agent/staging/graph-parts/spine.xml` — что именно роль прочитала в `pom.xml`.
- Любой отказ шага 5 — **терминальный**: роли на шаге нет, пере-делегации нет, чинит человек.

---

## 2. Прогон №2 — повторный, по кэшу

`.izi/` НЕ чистим — в этом весь смысл: части должны переиспользоваться, шаг 4 стоит 0 токенов.

```bash
rm -rf /tmp/quarkus-rest-json-app-v2-t1-3/.agent      # .izi остаётся
cd /tmp/quarkus-rest-json-app-v2-t1-3 && pi           # затем /izi, ответ роли gilb тот же
```

Ожидание:
```
scope: spine — из кэша (.izi/parts), скаут не звался
scope: root  — из кэша (.izi/parts), скаут не звался
scope: cells=2 modules=15 gaps=0 cache-hit=2
graph: modules=15 components=2 isolated=5 levels=4 …
```

`appgraph.xml` второго прогона обязан совпасть с первым **байт в байт**: слияние — коммутативный
моноид, ни одного `Date`/`Math.random` в ядре нет.

Перед прогоном №2 сохрани артефакт первого, после — сравни:
```bash
cp /tmp/quarkus-rest-json-app-v2-t1-3/.agent/appgraph.xml /tmp/appgraph-run1.xml     # ДО прогона №2
diff /tmp/appgraph-run1.xml /tmp/quarkus-rest-json-app-v2-t1-3/.agent/appgraph.xml && echo "идентично"
```

---

## 3. После двух зелёных

1. `docs/graph.md` — снять `[РЕШЕНО]`, поставить `[СДАНО]`, вписать runId обоих прогонов.
2. `backlog.md` — G6 и G7 закрыть, срез G0–G7 свернуть в одну строку «сдано», как это сделано с
   W0–W6 и R0–R5.
3. `docs/workflow.md` §3.5 и `docs/scope.md` §2а — под принятую форму (G7).
4. Ветка, коммит, PR.
