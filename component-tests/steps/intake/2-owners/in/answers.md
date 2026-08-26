1. Список URI glossaries в самой модели конфига агента (AgentConfiguration), правится штатным агентным REST. Отдельного эндпоинта и UI не заводить; порядок списка = приоритет.
2. ID генерирует система. Оператор его не передаёт: тело POST только terms, готовый id приходит в Location заголовке.
1. Владельцы привязки: штатный агентный REST RestAgentStore (существующий) + поле glossaries в модели AgentConfiguration (её тоже объяви владельцем шагов поля). Отдельного эндпоинта не заводить.
2. Новый GlossaryService — читает ссылки глоссариев из конфига агента через агентный стор, по образцу PromptSnippetService.
3. Новый GlossaryService — коллизия ключей: порядок списка glossaries в AgentConfiguration и есть приоритет, последний побеждает.
4. RestExportService — генерирует {id}.glossary.json + {id}.descriptor.json и кладёт в ZIP агента; механизм файлов из AbstractBackupService.
5. RestImportService — извлечение из ZIP и первичная запись; UpgradeExecutor — merge по resource URI и upgrade существующего (новая версия побеждает).
1. Новый GlossaryStore (Mongo) по образцу PromptSnippetStore — у каждого типа конфигурации свой Mongo-стор (configs/glossaries/mongo/GlossaryStore.java, new=yes after=PromptSnippetStore).
2. Тот же GlossaryStore (Mongo) — удаление это операция стора, не отдельный модуль.
