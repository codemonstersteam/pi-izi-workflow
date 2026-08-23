add | Glossary | configuration type | bot terminology dictionary with resource type eddi://ai.labs.glossary
implement | CRUD | Glossary | with versioning like Prompt Snippet
substitute | terms | prompts | as {{glossary.<term>}}
export | Glossary | agent | together with agent
import | Glossary | agent | with comparison and upgrade
merge | Glossary | import | by resource URI with new version winning
define | Term | Glossary | as key + value pair
validate | key | Term | up to 64 chars, lowercase, alphanumeric and underscore
add | reference | agent config | for Glossary like snippets
expose | REST path | Glossary | as /glossarystore/glossaries
restrict | substitution | Glossary | to agent-bound only
resolve | key conflict | Glossary | last load wins based on configuration set order
define | fields | Glossary resource | id + version + terms
set | length limit | value | unlimited
register | key | template data model | as glossary with syntax {glossary.<term>}
implement | caching | Glossary | using Caffeine with TTL from PromptSnippetService
throw | error | prompt rendering | when agent-bound Glossary is removed
export | Glossary | agent ZIP archive | as {id}.glossary.json plus {id}.descriptor.json