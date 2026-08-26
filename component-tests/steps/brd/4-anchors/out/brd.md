R1 create | Glossary | new configuration type | dictionary of bot terms, CRUD with versioning, based on Prompt Snippet, resource type `eddi://ai.labs.glossary`
R2 enable | substitution | prompts | as {{glossary.<term>}} alongside snippets
R3 add | export | Glossary | travels with agent during export
R4 add | import | Glossary | travels with agent during import, including comparison with existing and upgrade
R5 define | versioning | Glossary | repeats Prompt Snippet mechanism, no own description
R6 define | import merge | Glossary | merge by resource URI, new version wins (upgrade existing)
R7 define | Term | Glossary | only key + value, no description, no category
R8 constrain | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
R9 add | reference | agent config | Glossary as reference, like snippets
R10 define | REST path | Glossary | /glossarystore/glossaries, *store/* pattern
R11 constrain | substitution scope | Glossary | only for glossaries bound to agent, no global
R12 define | key collision | Glossary | last load wins: order in configuration set is priority
R13 define | Glossary fields | Glossary resource | only id + version + terms
R14 define | value length | Glossary | not limited
R15 define | template data model key | Glossary | glossary, Qute standard syntax: {glossary.<term>}
R16 define | caching | Glossary | Caffeine, TTL same as PromptSnippetService
R17 define | remote glossary error | Glossary | error on prompt rendering when bound glossary is removed
R18 define | export file name | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
analogue: PromptSnippet — files 62; the existing configuration type whose versioning mechanism, prompt substitution pattern, agent reference structure, and caching behavior the new Glossary feature will replicate
subjects[]: Glossary · substitution · versioning · collision · PromptSnippet
