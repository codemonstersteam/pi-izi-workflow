R1 add | configuration type | Glossary | dictionary of bot terms, CRUD with versioning, pattern Prompt Snippet, resource type `eddi://ai.labs.glossary`
R2 substitute | terms | prompts | as `{glossary.<term>}` same as snippets
R3 export | Glossary | agent ZIP archive | as `{id}.glossary.json` plus `{id}.descriptor.json`
R4 import | Glossary | agent import | merge by resource URI, new version wins (upgrade existing)
R5 define | versioning | Glossary | repeats Prompt Snippet mechanism
R6 define | Term | Glossary | key + value only, no description, no category
R7 validate | Term key | Glossary | up to 64 chars, lowercase, alphanumeric and underscore
R8 reference | Glossary | agent config | like snippets
R9 define | REST path | Glossary | `/glossarystore/glossaries`, *store/* pattern, not /glossaries
R10 restrict | substitution | Glossary terms | only to glossaries bound to agent, no global
R11 resolve | key collision | Glossary | last loaded wins, configuration set order is priority
R12 define | Glossary resource fields | Glossary | only id + version + terms
R13 define | Term value length | Glossary | unlimited
R14 define | template data model key | Glossary | glossary, Qute syntax: `{glossary.<term>}`
R15 cache | Glossary | Caffeine | TTL same as PromptSnippetService
R16 error | removed Glossary | prompt rendering | error when rendering prompt
analogue: PromptSnippet — files 62; the existing configuration type whose pattern, versioning mechanism, caching, and agent config reference the Glossary repeats
subjects[]: terms · Glossary · versioning · substitution · collision · PromptSnippet
