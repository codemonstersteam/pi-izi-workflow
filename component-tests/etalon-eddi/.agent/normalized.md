create | Glossary configuration | E.D.D.I | as a new config type for bot terms
implement | CRUD with versioning | Glossary | repeating Prompt Snippet mechanism
assign | resource type | Glossary | as `eddi://ai.labs.glossary`
define | Term structure | Glossary | as key + value pair without description or category
constrain | Term key | Glossary | to max 64 characters, lowercase, alphanumeric and underscore
constrain | Term value | Glossary | to unlimited length
define | Glossary resource fields | Glossary | as only id + version + terms
expose | REST endpoint | Glossary | at `/glossarystore/glossaries` following `*store/*` pattern
enable | prompt substitution | Glossary | using `{{glossary.<term>}}` syntax in Qute templates
restrict | substitution scope | Glossary | to only agent-bound glossaries without global substitution
resolve | key collisions | Glossary | by last-loaded-wins priority based on configuration set order
cache | Glossary data | Caffeine | with TTL matching PromptSnippetService
trigger | rendering error | prompt engine | when a deleted glossary is bound to an agent
export | Glossary | agent ZIP archive | as `{id}.glossary.json` plus `{id}.descriptor.json`
import | Glossary | agent ZIP archive | with merge by resource URI where new version wins
reference | Glossary | agent config | alongside snippets