R1 create | Glossary | configuration type | dictionary of bot terms
R2 provide | CRUD | Glossary | with versioning
R3 version | Glossary | same mechanism | as Prompt Snippet
R4 add | resource type | Glossary | eddi://ai.labs.glossary
R5 enable | substitution | prompts | {{glossary.<term>}} on par with snippets
R6 export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
R7 import | Glossary | agent ZIP archive | with comparison to existing and upgrade
R8 merge | Glossary | import | by resource URI, new version wins
R9 limit | Glossary resource | fields | id + version + terms only, only id + version + terms
R10 restrict | Term key | value | up to 64 characters, lowercase, alphanumeric and underscore
R11 add | reference | agent config | Glossary like snippets
R12 serve | REST path | Glossary | /glossarystore/glossaries following *store/* pattern
R13 allow | substitution | only | glossaries attached to agent, no global ones
R14 resolve | key collision | priority | last load wins, order in configuration set determines priority
R15 keep | Term value | length | unlimited
R16 set | key | template data model | glossary with Qute syntax {glossary.<term>}
R17 cache | Glossary | Caffeine | same TTL as PromptSnippetService
R18 raise | error | prompt rendering | when deleted glossary is attached to agent
analogue: PromptSnippet — files 62; the existing configuration type whose versioning mechanism, prompt substitution pattern, agent reference structure, and caching behavior the new Glossary feature will replicate
subjects[]: Glossary · substitution · collision · PromptSnippet
