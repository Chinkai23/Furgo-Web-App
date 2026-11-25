# Phase 3 — Warehouse & Inventory Security

## Known Test Data Exception (owner approved, 25 November 2026)

The following three Furgo Dev orders are disposable test records with no real payment or fulfillment obligation. The owner confirmed they will never require cancellation, return, refund, or inventory restoration:

- `FG-261119-BN4Q` (`order-1795048918886`)
- `FG-261119-XRZ6` (`order-1795051035231`)
- `FG-261120-YSR6` (`order-1795134983612`)

Their six allocation entries reference two deleted warehouse lots (`493f8c85-ecbf-4ae8-90a1-0badad5125ca`, `4a155541-1003-4509-ba06-216b9a6c3236`) and two deleted products (`e743026c-28c8-4e19-9552-89e9b80ad879`, `015d738a-9fe8-47dd-8a0d-a90f0c9a5575`). Leave these historical records unchanged. Read-only preflight found no purchasable catalog option using either missing product. Restoration of one of these orders could fail; do not process those test orders. Migration 0138 guards future deletion of lots and products referenced by active orders or returns.

## Release scope

Deploy together: `supabase/migrations/0138_warehouse_inventory_security.sql`, `js/app.js`, `js/app-data-sync.js`, `js/pages/seller-portal.js`, and `js/warehouse-stock.js`. This note and the preflight/postflight SQL scripts are review artifacts, not runtime assets.

## Cutover checkpoints

Preflight: `supabase/tests/0138_live_preflight_readonly.sql` returned no missing prerequisites, no pending Seller edits, no ambiguous variant identities, and baseline inventory, catalog-price, and fee values. Postflight: manually run `supabase/tests/0138_live_postflight_readonly.sql` and compare inventory, price, and commercial baselines; verify 0138 schema and direct-write protections. Pause affected warehouse/catalog writes between manual migration application and matching frontend publication. Independent QA remains required after cutover.
