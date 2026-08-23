# Нормализация заказа: что это и зачем

## Суть

Заказ приходит прозой на языке заказчика. Шаг 2 обязан работать не с прозой, а с **действиями над
вещами**: из них вырастают якоря, по которым дальше грепается репозиторий, и следствия, из которых
шаг 6 строит требования.

Дисциплина называется **requirements normalization / boilerplating в controlled natural language**;
промышленные родственники — EARS и Rupp's boilerplate. Механика извлечения — semantic role labeling:
предикат и его аргументы.

## Что на выходе

Таблица, одна строка на требование, четыре колонки:

```
<verb> | <object> | <instrument> | <values>
```

- `verb` — что делают;
- `object` — над чем;
- `instrument` — чем или через что;
- `values` — значения из заказа: пути, форматы, пределы, имена, целиком и как написаны.

Язык таблицы — английский, потому что репозиторий английский: русское существительное, не
переведённое в термин кода, ни во что не попадёт при грепе.

Наряд — `steps/brd/normalize.md`, 32 строки: три правила и пример из чужого домена.

## Что получили на eddi (DOS-535)

Прогон 22.08.2026, `qwen3.6-27b`, `temperature 0`, `effort low` — 60 с, выход 4514 токенов,
16 строк на заказ из 24 строк:

```
create    | Glossary configuration | E.D.D.I           | as a new config type for bot terms
export    | Glossary               | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
import    | Glossary               | agent ZIP archive | with merge by resource URI where new version wins
cache     | Glossary data          | Caffeine          | with TTL matching PromptSnippetService
reference | Glossary               | agent config      | alongside snippets
```

Разбор верный: каждое требование заказа стоит строкой, значения не перепутаны с вещами, имена файлов
сохранены целиком.

## Что ещё не сделано

Из таблицы никто не достаёт якоря. Объект — словосочетание (`agent ZIP archive`,
`Glossary configuration`), а якорь — одно слово. Резать словосочетания на слова и вынимать имена из
`{id}.descriptor.json` обязан скрипт: это разбор, а не понимание, и стоит он ноль токенов.

Мерка тоже пока врёт: сравнение объекта со строкой эталонного якоря даёт 1/6 там, где в таблице
стоит всё нужное. Мерить надо по словам, а не по строкам.



## Какой эталонный `brd.md` мы должны получить

ЧЕРНОВИК ЦЕЛИ, писан руками 22.08.2026. Настоящим эталоном он станет после вычитки оператором или
после живого прогона, дошедшего по нему до плана. Из перечисленного ниже происхождение есть только
у `subjects[]` — строка скопирована из `component-tests/etalon-eddi/.agent/brd.md:78`, по этим
якорям живой прогон дошёл до плана.

Соседние документы: как это делают в науке и в проде — `steps/brd/normalize-concept-research.md`;
как устроен шаг после переделки — `steps/brd/data-flow.md`.

Не тот, что лежит в `component-tests/etalon-eddi/.agent/brd.md`. Тот писала старая роль: 19
требований с `fit:` и `verify:`, значения внутри. Ворота такого не пишут — измеримые требования
собирает intake, когда у него есть карта репозитория и ответы оператора.

Эталон ворот на eddi:

```
verdict: solvable
R1 A new configuration type Glossary is added to E.D.D.I
R2 Glossary gets CRUD with versioning, on the model of Prompt Snippet
R3 Glossary terms are substituted into prompts alongside snippets
R4 Glossary is referenced from agent configuration
R5 Glossary is exported with the agent and imported back, merging with the existing one
R6 The agent export carries a descriptor file per Glossary
R7 Glossary is cached the way Prompt Snippet is cached
R8 Prompt rendering fails when a bound Glossary is gone
analogue: PromptSnippet — the existing configuration type Glossary is modelled on
subjects[]: Glossary · PromptSnippet · agent · export · descriptor · configuration
open-questions: 0
```

### Почему именно так

**Вердикт первым.** Единственное решение шага: задача решаема в ЭТОМ репозитории. Всё остальное в
артефакте существует ради следующих шагов, а не ради читателя.

**R-строки — следствия, по одной на строку нормализованной таблицы.** Без `fit:`, без чисел, без
путей: значения уже стоят в колонке `values` нормализации и попадут в требование на шаге 6, когда
будет что проверять. Строка, пересказывающая предложение заказа, — не следствие и подлежит удалению.

**`analogue` — розетка.** `focus.mjs` берёт имя аналога, находит файлы, где оно стоит, и добавляет
всех, кто их вызывает: работа втыкается туда же, где сидит старая вещь. `PromptSnippet` стоит в 62
файлах — аналог с нулевым счётом означал бы, что назвали то, чего в репозитории нет.

**Шесть якорей — и каждый оправдан местом работы, а не важностью слова:**

| якорь | файлов | почему |
|---|---|---|
| `Glossary` | 1 | создаётся; ноль или единица — норма, это и есть работа |
| `PromptSnippet` | 62 | образец: по нему строятся версионирование, кэш, экспорт |
| `agent` | 895 | владелец: глоссарий уезжает и приезжает вместе с агентом |
| `export` | — | механизм, который расширяется |
| `descriptor` | 272 | существующий артефакт ресурса, в который встраивается новый |
| `configuration` | 631 | место ссылки на глоссарий |

**Чего в якорях нет и почему.** `version` (668 файлов), `type` (853), `resource` (652), `REST` (662)
— слова, которыми репозиторий говорит о себе всюду. Пометив полрепозитория, они не сужают обзор, а
расширяют его — против того, ради чего якоря заведены. `name`, `description`, `value` — поля вещи, а
не вещь.

**`open-questions: 0`.** Вопрос о значении — работа intake. Ворота идут на рельс вопроса только тогда,
когда не могут решить, решаема ли задача и тот ли это репозиторий.
