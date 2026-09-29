# Shared API contract

Default local API: 127.0.0.1:58645. JSON. GET bootstrap returns `Bootstrap` from shared/contracts.ts, never secrets. Errors use `{error: string, code?: string}` with a non-2xx status. All writes persist before responding. Frontend refreshes bootstrap after mutations and polls active tasks. Backend implementation may add fields but coordinate breaking changes.

- `GET /api/health` application identity and version; `GET /api/bootstrap`
- `POST /api/tasks` CreateTask -> Task (create queued; separate run). `GET /api/tasks/:id` -> Task
- `POST /api/tasks/:id/run` -> Task. `POST /api/tasks/:id/message` `{content}` -> Task (continues/steers with user correction). `POST /api/tasks/:id/cancel` -> Task. `POST /api/tasks/:id/approval` `{approvalId, decision:'approve'|'reject'}` -> Task.
- `PUT /api/artifacts/:id` `{content,baseVersion}` -> Artifact; 409 on stale version. `GET /api/artifacts/:id/download` attachment.
- `POST /api/sources` `{title,kind,text}` -> Source. Import is evidence, not confirmed fact.
- `POST /api/facts` `{kind,statement,sourceIds,status}` -> Fact. `PUT /api/facts/:id` `{statement,status,reason,baseVersion}` -> Fact. Preserve revisions; 409 on conflict. User explicitly confirming a candidate can set confirmed; a model cannot.
- `POST /api/people`, `PUT /api/people/:id`; `POST /api/relationships`; `POST /api/events`; `POST /api/goals`, `PUT /api/goals/:id`: entity shape from shared types (server generates id/timestamps).
- `POST /api/agents`, `PUT /api/agents/:id` -> AgentProfile. QR or pasted profile import is a preview first, same create endpoint after user review; URL content is never automatically fetched/executed.
- `POST /api/automations`, `PUT /api/automations/:id`; `POST /api/automations/:id/run` -> Task. Only enabled schedules run while computer/server is online. Source-import triggers are local events.
- `PUT /api/settings/provider` settings plus optional `apiKey` / `clearKey` -> ProviderSettings (masked). `POST /api/settings/provider/test` -> `{ok,message,latencyMs?}`.
- `GET /api/export` downloadable personal data JSON WITHOUT credentials.

Runtime: genuine Codex app-server with configurable Responses provider. UI must clearly separate live model runs from deterministic local workflow demonstration. Missing key is explicit needs-configuration, never silent mock fallback. Demo may create an actual editable file via local operations, but is labelled throughout as a demonstration, not a model result. Live provider capability validation is separate from test fixtures. Per-task workspace is constrained; arbitrary external writes, terminal/network changes require host approval. A stored approval is not a blanket permission.

Initial seed is fictional: a product designer preparing a small community audio exhibition, with conversation history, three relationships, milestones, preferences and competing goals. Sources all marked demo. No real private identity or messages are used. Provide a few coherent examples rather than filler metrics or huge dummy data.
