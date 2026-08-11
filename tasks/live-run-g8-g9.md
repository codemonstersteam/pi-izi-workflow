# Живой прогон под G8 (`<decl>` на карте) и G9 (якорь-существительное)

Что доказываем — ровно две вещи, которых нет ни в одном юните:

1. **G9** — правка примера роли `gilb` меняет ПОВЕДЕНИЕ модели: якорей `found="no"` стало меньше, чем
   в прогонах `c4fde2f3`/`06c4172c` (там было 3 из 6 и 2 из 5 промахов).
2. **G8** — `<decl>` доезжает на узел живой карты, `<gap>` про «вход не объявлен» опустел, а байты на
   узел легли в замер (`DECL_CAP=12`, ожидание +120 б/узел).

Всё, что печатает модель, — не доказательство. Доказательство лежит на диске.

---

## 0. Песочница — СДЕЛАНА, порядок берётся из ранбука

Общий порядок прогонов живёт ВНЕ этого репозитория:
**`~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md`** — эталон, три предусловия, herdr, диагноз.
Здесь только то, что специфично для G8/G9.

Готово к прогону (11 авг):

| | состояние |
|---|---|
| эталон `~/IdeaProjects/codemonstersdev/sandbox/quarkus-rest-json-app-v2-t1-3` | обновлён харнесом ветки, коммит `d2f4db7 harness: main (G8 …, G9 …, ext 1.8.0)` |
| прогонная копия `/tmp/quarkus-rest-json-app-v2-t1-3` | создана с эталона, `.agent`/`.izi` нет, `git status` чист |
| роль-перекрышка `~/.pi/agent/pi-extensible-workflows/roles/` | только `gilb.md.bak-20260810`, ни одного `*.md` — репозиторий не подменяется |
| расширение | подключено ПО ПУТИ (`~/.pi/agent/settings.json` → `packages`), `pi install ./ext` не нужен |
| `env | grep HERDR` | пусто — не в пейне herdr |
| `node --test` | 133 зелёных |

`TASK.md` формы — прежний, тот самый, что давал `fruit · search · filter · limit · backward ·
compatibility`: «UI тянет весь список фруктов… поиск по части имени, с ограничением на размер
ответа. Существующие вызовы ломать нельзя». Дырка (размер лимита) в нём НАРОЧНО: вопрос оператору на
шаге 2 ожидаем.

---

## 1. Осталось сделать оператору перед запуском

**Выйти из текущей сессии `pi` и зайти заново.** Расширение читается на СТАРТЕ сессии, воркфлоу — на
каждом прогоне. Иначе прогон умрёт на `brdForm is not defined` (функция появилась в 1.8.0) — и
скажет это прямым текстом.

---

## 2. Прогон №1 — с нуля

`pi` стартовать ИЗ каталога прогона (хост читает скрипт как `resolve(context.cwd, scriptPath)`):

```bash
cd /tmp/quarkus-rest-json-app-v2-t1-3 && pwd && ls -l workflows/izi.js && pi
```

в сессии: `/izi`

Роль `gilb` спросит про предел размера ответа — **ответить прямо в этом чате** (`10`). Модель сама
вызовет `izi_answer` и `workflow_respond`. Ответ обязан быть ЧИСЛОМ: число из формулировки самого
вопроса источником не считается (`invented-default`).

### Что смотреть в логе прогона

```
survey-plan: files=… cells=2 edges=… [java:edges:9 (unknown):no-rules:…]
survey-plan: якорей без единого файла — N из M: …        ← НОВОЕ, метрика G9
scope: cells=2 modules=… gaps=0 cache-hit=0
graph: modules=… components=… isolated=… levels=… edges=… suites=2 surface=…
graph: пробелов K — …                                     ← K должен УПАСТЬ против прежних прогонов
```

---

## 3. Приёмка по диску

```bash
cd /tmp/quarkus-rest-json-app-v2-t1-3

# --- G9: якоря -------------------------------------------------------------
grep "subjects\[\]" .agent/brd.md                    # ни одного слова-ОЦЕНКИ
grep -c 'found="no"' .agent/appgraph.xml             # доля промахов; сравнить с 3/6 и 2/5
grep '<subject ' .agent/appgraph.xml

# --- G8: вход узла ---------------------------------------------------------
grep -c "<decl " .agent/appgraph.xml                 # > 0 — иначе G8 не доехал
grep "<lang " .agent/appgraph.xml                    # java: decls="class,…,field"; прочие no-rules
grep -A4 'Fruit.java"' .agent/appgraph.xml | head    # <decl kind="field" name="name" …>
grep "<gap " .agent/appgraph.xml                     # НЕТ строк «neither a declared entry point…»
grep "<decl more=" .agent/appgraph.xml               # если есть — остаток объявлен, это норма

# --- цена карты (замер G8e на ЖИВОЙ карте) ---------------------------------
wc -c .agent/appgraph.xml
grep -c "<module " .agent/appgraph.xml               # байт/узел = первое ÷ второе, ждём ~330
```

| # | критерий | чем он важен |
|---|---|---|
| 1 | `track:"ok"` в `journal.json` | единственный вердикт прогона |
| 2 | `якорей без единого файла` меньше половины | G9 изменил поведение, а не только файл роли |
| 3 | `<decl>` есть на узлах, `<lang … decls=…>` в шапке | G8b/G8c доехали через хост в карту |
| 4 | ни одного `<gap>` вида «neither a declared entry point…» | G8d: `<gap>` перестал ловить молчание роли |
| 5 | байт/узел ≈ 330 (216 + ~120) | замер G8e подтверждён живой картой, а не чужим деревом |
| 6 | `.agent/staging/` пуст | ни одна часть не отвергнута |
| 7 | `.izi/parts/*.json` несут `"grammar": "3"` | кэш записан, грамматика не менялась |

Журнал: `~/.pi/workflows/projects/<slug>/sessions/<sid>/runs/<runId>/journal.json` — записи
`function/survey/1` (метрика якорей) и `function/buildGraph/1` (вход и выход шага 5 дословно).

### Если красное

- `brdForm is not defined` → сессия `pi` старше расширения: просто выйти и зайти снова (расширение
  подключено по пути, переустанавливать нечего).
- `Missing prompt value` / `Unused prompt value` на старте → плейсхолдеры `steps/brd/order.tpl` и
  ключи `workflows/izi.js` разошлись; шов на это есть в `steps/brd/brd.test.mjs`, значит в форму
  доехала СТАРАЯ копия — перезапустить `node bin/install.mjs --to=…`.
- `blocked: репозиторий к работе не готов` → хребет вернул `<suites found="no"/>`: смотреть
  `.agent/staging/graph-parts/spine.xml`.
- Отказ шага 5 всегда терминальный: роли на шаге нет, пере-делегации нет, чинит человек.

---

## 4. Прогон №2 — по кэшу (доказывает, что G8 не стоил ни одного токена роя)

`.izi/` НЕ чистим — в этом весь смысл.

```bash
cp /tmp/quarkus-rest-json-app-v2-t1-3/.agent/appgraph.xml /tmp/appgraph-run1.xml   # ДО прогона №2
rm -rf /tmp/quarkus-rest-json-app-v2-t1-3/.agent                                   # .izi остаётся
cd /tmp/quarkus-rest-json-app-v2-t1-3 && pi                                        # затем /izi, тот же ответ gilb
diff /tmp/appgraph-run1.xml /tmp/quarkus-rest-json-app-v2-t1-3/.agent/appgraph.xml && echo "идентично"
```

Ожидание: обе клетки `reuse → hit`, `cache-hit=2`, один запуск роли (`gilb`), и `appgraph.xml` байт в
байт совпадает с первым — слияние коммутативно, `Date`/`Math.random` в ядре нет.

---

## 5. После двух зелёных

1. `backlog.md` — снять «ждёт живого прогона» с G9 и «долг замера» с G8, вписать оба runId.
2. `docs/graph.md` §7 — заменить статический замер (287 узлов чужого дерева) на живой байт/узел.
3. Ветка, коммит, PR.
