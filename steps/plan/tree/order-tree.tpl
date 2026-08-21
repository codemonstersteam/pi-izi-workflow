$START_TASK
Заполни четыре модуля дерева.

В скелете ниже у каждого модуля пусты шесть мест: `io`, `<hides>`, `<owns>`, `<twin path>`,
`<needs>`, `<contract>`. Впиши их. Остальное скопируй буква в букву. Файл запиши целиком по
staging-пути.

ГЛАВНОЕ ПРАВИЛО ЭТОГО НАРЯДА: `<needs>` — это «БЕЗ ЧЕГО МЕНЯ НЕ НАПИСАТЬ», а не «кого я зову».
Реализация нуждается в своём интерфейсе. Интерфейс в своей реализации НЕ нуждается.
Тот, кто принимает тип, нуждается в файле, где этот тип объявлен.

Второе правило: строка копируется СИМВОЛ В СИМВОЛ, вместе с `&lt;` `&gt;` `&amp;`.
верно:   <sig>IResourceStore&lt;Glossary&gt;</sig>
неверно: <sig>IResourceStore<Glossary></sig>
$END_TASK

$START_DATA
$START_DOCUMENT
path: {STAGING} (скелет — заполняй его)
Модули этой порции: {MINE}
Состав посчитан скриптом. `path`, `delta`, `candidates` и блок `<facts>` уже правильные:
`<facts>` — объявления и адреса, снятые с репозитория, их не нужно ни проверять, ни переписывать.
$END_DOCUMENT
$START_CONTENT
{SKELETON}
$END_CONTENT

$START_DOCUMENT
path: образец из репозитория
Так в этом проекте уже написан файл, решающий ту же задачу. Отсюда берутся базовый класс,
аннотации и форма объявления — не выдумывай их.
Слева от каждой строки — её номер в файле. Если чего-то не хватает, читай ТОЧЕЧНО и по правилам:
    read(path: <путь из первой строки выжимки>, offset: <номер минус 2>, limit: 12)
Не больше ДВУХ таких чтений на всю порцию. `read` без offset и limit запрещён, других файлов нет.
$END_DOCUMENT
$START_CONTENT
{TWIN}
$END_CONTENT

$START_DOCUMENT
path: соседние порции (уже решённые модули этой же работы)
Их типы и объявления — то, на что твои модули вправе ссылаться в `<needs>`.
Пусто — значит твоя порция первая.
$END_DOCUMENT
$START_CONTENT
{NEIGHBOURS}
$END_CONTENT

$START_DOCUMENT
path: .agent/frd.xml
Требование целиком: use case, их шаги, ветвления, поля и коды отказов.
По нему пишется `<post>`: гарантия называет шаг требования вида UC2/3.
$END_DOCUMENT
$START_CONTENT
{FRD}
$END_CONTENT

$START_DOCUMENT
path: {STAGING} (твой файл прошлой попытки; пусто = первая попытка)
Чини его по FEEDBACK, а не пиши заново.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT
$END_DATA

$START_CONSTRAINTS
- Модулей в файле ровно столько же, сколько в скелете, и те же самые.
- `path`, `delta`, `candidates`, `<facts>` копируются символ в символ.
- `<twin path="…">` — ОДИН путь из `candidates` этой же строки.
- В `<needs>` — только ПУТИ файлов, у каждого `why`.
- `io` — одно из: none · http · db · file · queue · llm.
- `<sig>` и `<owns>` по-английски; `<hides>`, `<pre>`, `<post>`, `<fail>`, `why` по-русски.
$END_CONSTRAINTS

$START_SELFCHECK
Перед записью ответь себе по каждому модулю, письменно, одной строкой:

    <путь модуля> — без чего его не написать: <перечисли> — и почему это ОБЪЯВЛЕНИЯ, а не вызовы

«Он зовёт его» ответом не является: зовёт — значит зависит тот, кто зовёт, а не наоборот.
Если в ответе оказался тот, кто зовёт ТЕБЯ, — убери его из `<needs>`.
$END_SELFCHECK

$START_FEEDBACK
Блокеры последней проверки staging-файла (пусто = первая попытка).
Каждый называет модуль его путём. Чини ровно их, больше ничего не меняй.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_OUTPUT
path: {STAGING}
schema:
  <tree task="…" goal="…">
    <module path="…" delta="Added" io="db">
      <hides>одно решение, которое модуль прячет</hides>
      <owns type="Loan"/>
      <twin kind="twin" path="…" candidates="…"></twin>
      <needs><need path="src/loans/ILoanStore.java" why="реализует интерфейс"/></needs>
      <contract><sig>…</sig><pre>…</pre><post>… (UC1/3)</post><fail>… либо «нет»</fail></contract>
    </module>
  </tree>
check: {CHECK}
ПЕРЕД ОТПРАВКОЙ: пройди по всем `<need>` и вычеркни те, куда попал вызывающий тебя модуль.
`needs` — это «без чего меня не написать», и круга в нём быть не может.
return: вызови workflow_result по OUTPUT_FORMAT своей ROLE
$END_OUTPUT
