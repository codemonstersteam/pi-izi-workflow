create | Glossary | new configuration type | dictionary of bot terms, CRUD with versioning, based on Prompt Snippet, resource type `eddi://ai.labs.glossary`
enable | substitution | prompts | as {{glossary.<term>}} alongside snippets
add | export | Glossary | travels with agent during export
add | import | Glossary | travels with agent during import, including comparison with existing and upgrade
define | versioning | Glossary | repeats Prompt Snippet mechanism, no own description
define | import merge | Glossary | merge by resource URI, new version wins (upgrade existing)
define | Term | Glossary | only key + value, no description, no category
constrain | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
add | reference | agent config | Glossary as reference, like snippets
define | REST path | Glossary | /glossarystore/glossaries, *store/* pattern
constrain | substitution scope | Glossary | only for glossaries bound to agent, no global
define | key collision | Glossary | last load wins: order in configuration set is priority
define | Glossary fields | Glossary resource | only id + version + terms
define | value length | Glossary | not limited
define | template data model key | Glossary | glossary, Qute standard syntax: {glossary.<term>}
define | caching | Glossary | Caffeine, TTL same as PromptSnippetService
define | remote glossary error | Glossary | error on prompt rendering when bound glossary is removed
define | export file name | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
