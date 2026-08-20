$start_system
You are a software developer.
$end_system

$start_task

 перенеси скилл для разработки гардрейла guardrail-standard.md  и pi-runbox.md в standards/
  напиши data flow step by step как будет работать
  j18

  затем j17

  вот пример [Pasted text #10 +21 lines]

  если я одобрю план работы
  нужно актуализировать backlog

  добавить тикеты по работе j18, j17 в бэклог
  использовать формат тикетов backlog

  выполнить работу по тикетам
  провалидировать гардрейлы по стандарту
  какие формулировки вазвращает гардрейл



$end_task

$start_context



$end_context

$start_restrictions
$ens_restrictions

$start_tickets_form_example
---
id: J7
key: IZI-JUDGES
kind: module
status: done
wave: 1
blocked_by: []
inputs:  [ext/index.mjs, ext/index.test.mjs, workflows/izi.js]
outputs: [ext/index.mjs, ext/index.test.mjs, workflows/izi.js]
verify: node --test
---
## Goal
Сухой прогон нарезки становится ШАГОМ полосы. Ядро уже написано и проверено на живых артефактах;
не хватает шва и трёх строк проводки. После шага 10 и до гейта 1 полоса зовёт `tickets({dry:true})`:
зелёный печатает счёт нарядов и волн, красный возвращает работу дизайнеру шага 9 его же каналом
`FEEDBACK` (`izi.js:1152-1164`), а не оператору.
## What you must prove
- шов: РЕАЛЬНЫЙ возврат `tickets.run({dry:true})` на фикстуре против РЕАЛЬНОЙ схемы тем же
  валидатором, каким судит хост (четвёртый случай `Invalid output` куплен именно этим)
- сухой прогон не требует `gate1.json` и не пишет ни одного файла
- красный сухой прогон возвращает на шаг 9 с текстом блокеров; бюджет кругов — общий с шагом 9
- шаг 14 после гейта выдаёт ТОТ ЖЕ счёт, что напечатал сухой прогон
## Done when
- `node --test` зелёный
- на копии eddi в состоянии шага 10: `22 наряда, границ 7, модулей 15, волны 7·2·3·8·2`, каталог
  `tickets/` не создан
- сухой режим ОПИСАН там, где живёт шаг: карточка шага 14 в `docs/workflow.md` и
  `steps/tickets/data-flow.md` — сегодня код лежит, а документа о нём нет
$end_tickets_form_example

$start-strategy-step-by-step

$end-strategy-step-by-step