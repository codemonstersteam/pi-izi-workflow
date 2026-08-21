
$START_TASK
Fill the four modules of the tree.

In the skeleton below, each module has six empty places: `io`, `<hides>`, `<owns>`, `<twin path>`, `<needs>`, `<contract>`. Fill them. Copy everything else character-for-character. Write the complete file to the staging path.

PRIMARY RULE OF THIS ORDER: `<needs>` means “WITHOUT WHICH I CANNOT BE WRITTEN”, not “whom I call”.
An implementation needs its interface. An interface does NOT need its own implementation.
A module that accepts a type needs the file where that type is declared.

SECOND RULE: every string is copied CHARACTER-FOR-CHARACTER, including `&lt;` `&gt;` `&amp;`.
correct:   <sig>IResourceStore&lt;Glossary&gt;</sig>
incorrect: <sig>IResourceStore<Glossary></sig>
$END_TASK

$START_DATA

$START_WORK_DOCUMENT
path: {STAGING}
ЭТО ТВОЯ РАБОТА — скелет, который ты заполняешь и записываешь целиком.
Модули этой порции: {MINE}
Состав посчитан скриптом. `path`, `delta`, `candidates` и блок `<facts>` уже правильные:
`<facts>` — объявления и адреса, снятые с репозитория, их не нужно ни проверять, ни переписывать.
$START_WORK_CONTENT
{SKELETON}
$END_WORK_CONTENT
$END_WORK_DOCUMENT

$START_PREVIOUS_DOCUMENT
path: {STAGING}
ТВОЙ ФАЙЛ ПРОШЛОЙ ПОПЫТКИ (пусто = первая попытка).
Чини его по FEEDBACK, а не пиши заново.
$START_PREVIOUS_CONTENT
{PREVIOUS}
$END_PREVIOUS_CONTENT
$END_PREVIOUS_DOCUMENT

$START_FEEDBACK
Blockers from the last validation of the staging file (empty = first attempt).
Each blocker names a module by its path. Fix exactly those; change nothing else.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_SAMPLE_DOCUMENT
path: файлы репозитория, решающие ту же задачу
ОБРАЗЦЫ: по два кандидата на каждый твой модуль. Отсюда берутся базовый класс, аннотации и форма
объявления — не выдумывай их. Выбери ОДИН путь и впиши его в `<twin path>` своего модуля.
Слева от каждой строки — её номер в файле. Если чего-то не хватает, читай ТОЧЕЧНО и по правилам:
    read(path: <путь из первой строки образца>, offset: <номер минус 2>, limit: 12)
До ВОСЬМИ таких чтений на порцию — по одному на показанный образец. `read` без offset и limit
запрещён, других файлов нет: восемь коротких чтений по адресу дешевле одного файла целиком.
$START_SAMPLE_CONTENT
{TWIN}
$END_SAMPLE_CONTENT
$END_SAMPLE_DOCUMENT

$START_NEIGHBOURS_DOCUMENT
path: соседние порции этой же работы
УЖЕ РЕШЁННЫЕ МОДУЛИ: их типы и объявления — то, на что твои модули вправе ссылаться в `<needs>`.
Пусто — значит твоя порция первая.
$START_NEIGHBOURS_CONTENT
{NEIGHBOURS}
$END_NEIGHBOURS_CONTENT
$END_NEIGHBOURS_DOCUMENT

$START_REQUIREMENT_DOCUMENT
path: .agent/frd.xml
ТРЕБОВАНИЕ: use case твоих модулей, их шаги, ветвления, поля и коды отказов.
По нему пишется `<post>`: гарантия называет шаг требования вида UC2/3.
$START_REQUIREMENT_CONTENT
{FRD}
$END_REQUIREMENT_CONTENT
$END_REQUIREMENT_DOCUMENT

$END_DATA

$START_CONSTRAINTS
- The file contains exactly the same modules, in the same number, as the skeleton.
- `path`, `delta`, `candidates` and `<facts>` are copied character-for-character.
- `<twin path="…">` is exactly ONE path taken from the `candidates` of the same line.
- `<needs>` contains only FILE PATHS; every `<need>` has a `why`.
- `io` is one of: none · http · db · file · queue · llm.
- `<sig>` and `<owns>` are written in English; `<hides>`, `<pre>`, `<post>`, `<fail>`, `why` are written in Russian.
$END_CONSTRAINTS

$START_SELFCHECK
Before writing, answer yourself for every module in one line:
    <module path> — without which it cannot be written: <list> — and why these are DECLARATIONS, not calls
“It calls X” is not an answer: the caller depends on the callee, never the other way round.
If any answer names a module that calls YOU, remove it from `<needs>`.
$END_SELFCHECK

$START_OUTPUT
path: {STAGING}
schema:
  <tree task="…" goal="…">
    <module path="…" delta="Added" io="db">
      <hides>one design decision the module conceals</hides>
      <owns type="Loan"/>
      <twin kind="twin" path="…" candidates="…"></twin>
      <needs><need path="src/loans/ILoanStore.java" why="реализует интерфейс"/></needs>
      <contract><sig>…</sig><pre>…</pre><post>… (UC1/3)</post><fail>… or «нет»</fail></contract>
    </module>
  </tree>
check: {CHECK}
BEFORE SUBMITTING: walk every `<need>` and strike out any that point to a module that calls you.
`needs` means “without which I cannot be written”; cycles are forbidden.
return: call workflow_result according to the OUTPUT_FORMAT of your ROLE
$END_OUTPUT