# Patch discipline (so you don't suffer)

## Rules
1. Patch the smallest file that owns the feature.
2. If you change UI text → likely in `core/events_navigation.js` or feature file for that screen.
3. If you change data shape/import → `features/transactions/*` or `features/bills/*`.
4. If you change storage/sync → `services/*`.

## Typical edits
- Add a new button on Home → `core/render.js` (markup) + `core/events_navigation.js` (handler)
- Fix Cash CRUD → `features/cash/kasa_crud.js`
- Fix Vault upload/move/rename → `features/documents/vault_folders.js`
- Fix AI chat behavior → `features/ai/ai-client.js` + `features/ai/ai-engine.js`
