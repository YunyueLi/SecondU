# Computer activity and daily records

The life timeline still opens on **Milestones**. **Daily activity** presents a frontend development preview, visibly labelled **Dev / In development**. Its two days of fictional activity combine applications into ten-minute blocks, with application icons, expandable example evidence, search, and a question handoff. The handoff opens a new chat draft containing only the selected, explicitly fictional segment; it does not automatically invoke a model. It does not claim actual computer observation.

Continuous cross-application capture is **not implemented or enabled**. No native collector, permission request, capture token, capture settings, or ingest endpoint is registered. No Codex private database, other app history or screen recording is read. A macOS collector, explicit OS permissions, pause controls, app authorization/exclusion, retention/deletion, local grouping and evidence retrieval remain future work. The abandoned intermediate capture module was removed before being registered or run.

## Existing local records

The daily view's **More** menu exposes **View saved records**, **Add a manual note**, and the lower-priority JSON interoperability importer. Saved records combine one row per SecondU task (including its Agent conversation link), existing manual `LifeEvent.scope = note` records, and user-confirmed imports. Lifecycle/tool events do not each become another row. Ordinary greetings remain conversations; they never become milestones or cause automatic files. Manual records retain their year/month/day precision without inventing a time of day. All clock timestamps use the current computer's timezone for display. A task's saved start/end timestamps do not measure active working time.

## Local JSON interoperability

Choose a UTF-8 JSON file or paste JSON. Limit: 512 KiB and 500 activities. Example is fictional:

```json
{
  "format": "hither.activity.v1",
  "sourceId": "my-local-activity-export",
  "demo": true,
  "activities": [{
    "id": "activity-001",
    "title": "Review file preview feedback (fictional example)",
    "summary": "Organized two questions to validate.",
    "start": "2026-09-29T09:00:00+08:00",
    "end": "2026-09-29T09:30:00+08:00",
    "app": "Example editor",
    "sourceUrl": "https://example.com/notes/001",
    "reference": "local-export/2026-09-29/activity-001"
  }]
}
```

Required root fields: `format`, stable `sourceId`, `activities`. Each activity requires a stable `id`, nonempty `title` (300 characters), `summary` (up to 4,000 characters, may be empty), and `start`. Optional fields: `end`, `app` (200), `sourceUrl` (2,000), `reference` (2,000). `demo` defaults false; set true for fiction.

Timestamps must include seconds and explicit `Z` or numeric offset. Up to three fractional second digits are accepted. Ambiguous local times, invalid dates, and end-before-start fail validation. Instants normalize to UTC for deduplication; the exact original JSON preserves original offsets and other fields. `sourceUrl` accepts HTTP(S) without credentials. `reference` is text only: paths are not opened, read, fetched or executed.

- `GET /api/daily-activity`: combined saved records, also returned as `bootstrap.dailyActivities`.
- `POST /api/imports/activity/preview` with `{filename,content}`: returns preview ID, filename, SHA-256, source ID, counts and items. Staging remains local for 30 minutes, capped at 20 previews. No sources, activities, facts, life events or tasks are added.
- `POST /api/imports/activity/commit` with `{previewId}` after confirmation: atomically persists the exact original as a Source and activity rows in SQLite. Returns import ID, source ID, activity IDs and counts.

The source ID/activity ID pair identifies a record. Matching normalized records deduplicate across files, retaining every source association. Conflicting contents fail without overwriting; a correction requires a new activity ID. Retrying an import is idempotent. Referenced sources cannot be deleted. Import does not trigger source-import automations or model requests. Main/demo spaces have separate previews, records and originals. Export includes records and sources; no capture or model credential is included.

Backend verification uses temporary local databases and fictional input. Native computer recording has no acceptance claim. Actual frontend review is recorded separately by the main task.
