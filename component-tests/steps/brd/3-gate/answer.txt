verdict: solvable
R1 A new configuration type Glossary is added with CRUD and versioning
R2 Glossary terms are substitutable in prompts alongside snippets
R3 Glossary is exported alongside the agent
R4 Glossary is imported alongside the agent with merge and upgrade
R5 Glossary versioning repeats the Prompt Snippet mechanism
R6 Glossary import merges by resource URI with new version winning
R7 Term is defined as key-value pair without description and category
R8 Term key is constrained in format
R9 Glossary is referenced in agent config like snippets
R10 A REST endpoint for Glossary is defined
R11 Glossary substitution is restricted to agent-bound glossaries only
R12 Key conflict resolution follows load order priority
R13 Glossary resource fields are defined
R14 Term value length is unconstrained
R15 Template data model key for Glossary is defined
R16 Glossary is cached with Caffeine
R17 Removed Glossary bound to agent causes prompt rendering error
R18 Glossary is exported in agent ZIP archive
analogue: PromptSnippet — the existing configuration type with versioning, CRUD, caching, and export/import that Glossary is modelled on
subjects[]: glossary · term · agent · configuration · prompts · export
open-questions: 0