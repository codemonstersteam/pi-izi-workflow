create | Glossary | configuration type | dictionary of bot terms
provide | CRUD | Glossary | with versioning
version | Glossary | same mechanism | as Prompt Snippet
add | resource type | Glossary | eddi://ai.labs.glossary
enable | substitution | prompts | {{glossary.<term>}} on par with snippets
export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json
import | Glossary | agent ZIP archive | with comparison to existing and upgrade
merge | Glossary | import | by resource URI, new version wins
limit | Term | key value | key + value only, no description and no category
restrict | Term key | value | up to 64 characters, lowercase, alphanumeric and underscore
add | reference | agent config | Glossary like snippets
serve | REST path | Glossary | /glossarystore/glossaries following *store/* pattern
allow | substitution | only | glossaries attached to agent, no global ones
resolve | key collision | priority | last load wins, order in configuration set determines priority
limit | Glossary resource | fields | id + version + terms only
keep | Term value | length | unlimited
set | key | template data model | glossary with Qute syntax {glossary.<term>}
cache | Glossary | Caffeine | same TTL as PromptSnippetService
raise | error | prompt rendering | when deleted glossary is attached to agent
