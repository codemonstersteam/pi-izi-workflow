# E.D.D.I — a mini fixture of the conversational middleware

A configuration set holds the bot's types: agents, prompt snippets, behaviour rules, packages.
Every type is a REST store with CRUD and versioning; the versioning mechanism, the caching pattern
and the export/import of an agent are shared by all of them.

- `configs/` — the configuration types and their REST stores
- `backup/` — export of an agent into a ZIP archive and import back
- `modules/templating` — Qute templating of prompts
