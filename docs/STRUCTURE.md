# OneTapDay MVP — modular structure (no functionality removed)

This refactor removes the *front-end monolith* `public/js/app/app.js` by splitting it into small, named files **without changing runtime order**.
`public/app.html` now loads the modules in the same sequence as the original monolith.

## New front-end folders

- `public/js/core/` — global config, i18n glue, helpers, state, render, navigation/events
- `public/js/ui/` — theme + inline help UI
- `public/js/services/` — sync, money/rates, storage/reliability
- `public/js/features/` — features by product area (cash, bills, docs, analytics, etc.)
- `public/js/pages/` — existing landing/accountant pages (left as-is)
- `public/js/features/ai/` — AI client/engine/tools (moved from `public/js/ai/`)

## What changed (intentionally)

- `public/js/app/app.js` **deleted** (its content moved 1:1 into modules below).
- `public/js/ai/*` → `public/js/features/ai/*` (path change only).
- `public/js/app/sync-cloud.js` → `public/js/services/sync/sync-cloud.js` (path change only).
- **Only string messages** were updated to point to the new AI paths (no logic changes).

## Module load order (exact)

The app loads these in `public/app.html`:

- `/js/core/bootstrap.js`
- `/js/core/config_api.js`
- `/js/core/i18n_helpers.js`
- `/js/core/i18n.js`
- `/js/ui/theme_state.js`
- `/js/ui/help_content.js`
- `/js/ui/help_init.js`
- `/js/core/helpers.js`
- `/js/features/transactions/import_csv.js`
- `/js/features/analytics/trend_panels.js`
- `/js/features/analytics/analytics.js`
- `/js/features/categories/spending_breakdown.js`
- `/js/features/accounts/auto_accounts_fix.js`
- `/js/features/transactions/normalize_tx_schema.js`
- `/js/features/bills/normalize_import.js`
- `/js/core/state.js`
- `/js/features/categories/spending_buttons_fix.js`
- `/js/services/sync/cloud_sync.js`
- `/js/services/sync/remote_sync.js`
- `/js/services/money/rates.js`
- `/js/features/reconcile/ai_match.js`
- `/js/services/storage/persist_local.js`
- `/js/services/storage/reliability.js`
- `/js/features/workspaces/workspaces.js`
- `/js/services/sync/autosync.js`
- `/js/features/cash/quick_examples.js`
- `/js/features/book/unified_book.js`
- `/js/core/render.js`
- `/js/features/forecast/plan_forecast.js`
- `/js/features/transactions/accept_one.js`
- `/js/features/cash/kasa_crud.js`
- `/js/core/events_navigation.js`
- `/js/features/documents/vault_mvp.js`
- `/js/features/notifications/in_app_notifications.js`
- `/js/features/documents/vault_folders.js`

## Where to patch (quick map)

- UI / theme / help: `public/js/ui/*`
- Navigation / section switching / global events: `public/js/core/events_navigation.js`
- Transactions import / normalization: `public/js/features/transactions/*`
- Bills import normalization: `public/js/features/bills/normalize_import.js`
- Cash (Kasa): `public/js/features/cash/*`
- Analytics: `public/js/features/analytics/*`
- Categories: `public/js/features/categories/*`
- Workspaces: `public/js/features/workspaces/workspaces.js`
- Vault: `public/js/features/documents/*`
- Notifications: `public/js/features/notifications/in_app_notifications.js`
- Sync / autosync: `public/js/services/sync/*`
- Storage/reliability: `public/js/services/storage/*`
