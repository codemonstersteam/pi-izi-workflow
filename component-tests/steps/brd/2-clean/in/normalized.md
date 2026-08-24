create | configuration type | Glossary | dictionary of bot terms, with resource type eddi://ai.labs.glossary
provide | CRUD | Glossary | with versioning, following Prompt Snippet pattern
provide | versioning | Glossary | same mechanism as Prompt Snippet, no own implementation
add | substitution | prompt | as {{glossary.<term>}} alongside snippets
add | export | Glossary | as {id}.glossary.json plus {id}.descriptor.json in agent ZIP archive
add | import | Glossary | with merge by resource URI, new version wins, upgrade existing
define | Term | Glossary entry | only key + value, no description, no category
validate | Term key | Glossary | up to 64 characters, lowercase, alphanumeric and underscore
add | reference | Glossary | in agent config, like snippets
create | REST endpoint | Glossary | at /glossarystore/glossaries, *store/* pattern, not /glossaries
restrict | substitution | Glossary | only to glossaries bound to agent, no global substitution
resolve | key conflict | Glossary | last load wins, configuration set order is priority
define | resource fields | Glossary | only id + version + terms
define | Term value | Glossary | no length limit
map | template data model key | Glossary | as glossary with Qute syntax {glossary.<term>}
add | caching | Glossary | Caffeine, same TTL as PromptSnippetService, no own implementation
raise | error | remote glossary | when bound to agent, on prompt rendering
