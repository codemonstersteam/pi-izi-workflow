$START_TASK
Напиши ПО-АНГЛИЙСКИ, как меняется КАЖДЫЙ модуль этой партии — так, чтобы по написанному можно было
сесть и писать код. Английский здесь не стиль: из этого текста дословной вырезкой режется наряд,
который исполняет слабая модель в английском репозитории.

Список модулей дан в MODULES: сколько путей, столько разделов. Все use case, которые эти модули
трогают, даны целиком — покажи в каждом разделе, какие их шаги он закрывает.
$END_TASK

$START_DATA
{CARD}
$END_DATA

$START_CONSTRAINTS
Закон — в твоей ROLE. Здесь только то, что относится к ЭТОМУ вызову:
- Разделы пишутся на пути из MODULES, и ни на один другой.
- DRAFT — черновик машины: в нём бывают ярлыки вместо вызовов, заменяй их сигнатурами из образца.
- Ни одного кириллического слова в файле: гардрейл называет их поимённо и возвращает файл.
$END_CONSTRAINTS

$START_PREVIOUS
$START_DOCUMENT
path: {STAGING}
ТВОЙ ПРОШЛЫЙ ОТВЕТ — тот самый файл, который забраковала проверка (пусто = первая попытка).
Это ПОЧИНКА, а не новый план: правь названные ниже места ЭТОГО текста, остальные разделы оставь
как есть. Написанное заново ломает то, что проверку уже прошло.
$END_DOCUMENT
$START_CONTENT
{PREVIOUS}
$END_CONTENT
$END_PREVIOUS

$START_FEEDBACK
Блокеры последней проверки staging-файла (пусто = первая попытка).
Чини ровно то, что названо, больше ничего не меняй.
$START_CONTENT
{FEEDBACK}
$END_CONTENT
$END_FEEDBACK

$START_SELFCHECK
Перед записью файла выпиши ответы. Ответ — таблица или список; «да» ответом не является.

1. Таблица «шаг → чем он проверяется»: на каждый шаг из «closes» назови СИГНАТУРУ ЭТОГО модуля,
   которую позовёт тест.

   ```
   UC1 step 2  →  create(Glossary) : IResourceId — rejects a key outside [a-z0-9_]
   UC5 step 3  →  ???                             ← звать нечего, шаг не мой
   ```

2. На каждый модуль партии — что у него СВОЕГО, кроме делегирования образцу. Всё уходит в `super`
   или в чужой класс — значит своего поведения нет, и «закрывает» у него пусто. Это норма: такой
   модуль проверяется компилятором того, кто его зовёт.

3. Каждая сигнатура из «signatures» — откуда взята: из образца, из USECASES или из DRAFT. Ни одной
   придуманной.

4. Каждое «declares» — откуда взято: объявление существующего модуля из NODES либо форма образца из
   SAMPLE со своим именем. Базовый класс не угадывается: он стоит в объявлении образца.

   ```
   LoanStore  →  SAMPLE: public class RentStore extends ResourceStore<Rent> implements IRentStore
   ```

Список сошёлся — пиши файл. Не сошёлся — правь раздел, а не список.
$END_SELFCHECK

$START_OUTPUT
path: {STAGING}
schema:
  # <partition name>

  ## <module path>  (new | edited)
  what: …
  fields: <name>: <type> — <what for>
  signatures: <name>(<params>) : <type>
  declares: <package · annotations · class X extends Y implements Z>
  calls: <path> — what for      (либо «none»)
  sample: <path> — what we repeat
  closes: UC1 step 1 · UC4 step 2a
  verify: <command> · <test class name>
check: {CHECK}
return: вызови workflow_result по OUTPUT_FORMAT своей ROLE
$END_OUTPUT
