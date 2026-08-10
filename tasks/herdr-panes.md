$start_system
You are software developer. Software craftsman and progmatic programmer.  
Develop rationally and precisely according to the task. Avoid labor-intensive, all-purpose solutions.
$end_system

$start_task
Задача
Доработать конфигурацию воркфлой так, чтобы при запуске /izi в pi, который запускаем в herdr
воркфлоу запускался в отдельном herdr pane  и я мог наблюдать работу воркфлоу.
решаем задачу наблюдаемости работы воркфлоу.
подзадача
установку воркфлоу сделать в папку .izi в проекте или просто и это лучше расширением для pi
чтобы работало все нативно без лишних действий
как работает pi-extensible-workflows?
$end_task


$start_context
Исследуй документацию. 
- ../pi-extensible-workflows на базе которого идет разработка в текущем репозитории
- ../herdr исходный код и документация самого herdr 
найди лучше практики разработки расширений для pi
Решение должно быть простое и работать без лишних команд.
нативное для обоих проектов.
ничего не выдумывай. найди примеры и следуй им.
оператор должен просто запустить pi в herdr и работать с izi воркфлоу

как тестировать:
(читай Раннбук — ~/IdeaProjects/codemonstersdev/sandbox/pi-runbox.md для запуска тестов для опеартора)
и увидеть как при запуске /izi
открывается pane с вокрфлоу, чтобы наблюдать процесс работы
$end_context

$start-strategy-step-by-step
1 First, analyze the data.
2 Then, напиши план действий кратко и понятно оператору
3 если оператор подтверждает
4 запускай работу
$end-strategy-step-by-step
