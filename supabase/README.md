# Furgo development backend

This folder is the starting point for moving the prototype from browser-only demo data to shared online data.

## What the first migration sets up

- Supabase Auth signup creates a customer profile and active account status.
- Roles are stored separately as customer, admin, or driver. The browser cannot grant itself an admin or driver role.
- Profile email and phone are synced from Auth; the app can edit the display name only.
- Pet profiles, remarks, photo paths, and vaccination document paths are stored in Postgres.
- Pet photos and vaccination files go into a private `pet-records` Storage bucket.
- Row-level security restricts customer access to their own records and gives administrators support access.

## Connect a development project

1. Create a Supabase project for development and keep it separate from any future production project.
2. Apply `migrations/0001_accounts_and_pets.sql`, `migrations/0002_grooming_bookings.sql`, `migrations/0003_shared_app_data.sql`, `migrations/0004_profile_contact_sync.sql`, and `migrations/0005_dedicated_service_orders.sql` using the Supabase SQL editor or Supabase CLI.
3. Configure email/password sign-in and Malaysian phone/WhatsApp OTP registration in Supabase Auth. The customer UI accepts local `01...` mobile numbers; convert them to `+60...` before sending them to Supabase Auth. WhatsApp OTP requires a supported provider (Twilio or Twilio Verify), a WhatsApp Business sender, an approved authentication template, and provider credentials.
4. The browser client is configured in `js/supabase.js` with this development project's URL and publishable key. A publishable key is safe to expose in a browser when Row Level Security is enabled. Never put a secret or service-role key in browser code.
5. Assign the prototype admin and driver roles through a trusted server-side/admin process after the matching accounts exist.
6. Replace one feature at a time from local storage with Supabase reads/writes, beginning with sign-in, customer profile, and pet profiles.

## Current connection status

- Login and email/password registration use Supabase Auth. Malaysian phone/password login remains unavailable while the Phone Provider is disabled.
- Customer names and pet profiles are synchronized with Supabase. Pet photos and vaccination files use the private `pet-records` bucket.
- The `profiles` table holds customer name, email, and phone (`display_name`, `email`, `phone_e164`). Apply `0004_profile_contact_sync.sql` to copy the registration phone from Auth metadata and backfill existing accounts. `account_controls` intentionally contains status/admin-note fields only.
- Grooming settings, booking slots, and booking records use Supabase after `0002_grooming_bookings.sql` is applied. A database uniqueness rule prevents two active bookings from taking the same outlet/date/time slot; cancellation releases the slot.
- After `0003_shared_app_data.sql` is applied, QR tokens, driver-to-admin location updates, customer addresses and masked payment-method summaries, favorites/cart, demo Furgo Credit, admin product/offers/promotions, help details, and customer enquiries sync through the `app_data` table. Admin sessions load operational records across customer accounts; customer sessions load only their own records and shared catalog/settings. Supabase Realtime updates subscribed portals when those records change.
- After `0005_dedicated_service_orders.sql` is applied, Marketplace orders and line items, Pet Hotel bookings, and Pet Daycare bookings use dedicated tables. The migration copies matching records from `app_data`; the old rows remain there as a rollback/reference copy. Customer/admin reads are scoped by row-level security, and Realtime updates subscribed portals.
- Development registration creates an email/password account and stores the entered phone number as profile metadata. Phone login is temporarily unavailable because Supabase requires an SMS provider whenever its Phone Provider is enabled. The phone is not verified in this temporary mode.
- Admin and driver portal access is read from `user_roles`; do not use the old demo email shortcuts. Grant those roles only through a trusted setup process after those Auth accounts exist.
- For this no-Twilio test stage, disable the Phone Provider in Supabase and keep Email enabled. Before production, configure Twilio or Twilio Verify, enable Phone Provider and Phone Confirmations, and restore the WhatsApp OTP registration step.

## Prototype and production boundary

`app_data` is a flexible JSON store for supporting prototype data, not a production order ledger. The three service order types now have dedicated tables, but order details and some uploaded receipt/slip files remain client-edited JSON. Hotel/daycare room capacity is not locked atomically in the database. Before accepting real payments or using check-in/status changes for operations, move sensitive transitions into server-side database functions and upload receipts/slips/banner images to Storage instead of storing their data in JSON. Furgo Credit remains demo-only and must never represent a cash balance. Payment gateways and WhatsApp OTP still need provider credentials. Customer-facing live driver location needs an order-linked location table and access policy; current live location sync is for Admin visibility only. Production QR verification should use a server-side function.
