-- Section: On-demand receipt PDFs
-- Function: Keep receipt fields in order records and remove previously stored
-- generated PDF data URLs. Customer downloads now render the PDF in-browser.

begin;

update public.marketplace_orders
set details = jsonb_set(details, '{receipt}', (details->'receipt') - 'data', true),
    updated_at = now()
where jsonb_typeof(details->'receipt') = 'object'
  and details->'receipt' ? 'data'
  and (
    details->'receipt' ? 'document'
    or coalesce(details->'receipt'->>'data', '') ~* '^data:application/pdf'
    or coalesce(details->'receipt'->>'name', '') ~* '\.pdf$'
  );

update public.grooming_bookings
set details = jsonb_set(details, '{receipt}', (details->'receipt') - 'data', true),
    updated_at = now()
where jsonb_typeof(details->'receipt') = 'object'
  and details->'receipt' ? 'data'
  and (
    details->'receipt' ? 'document'
    or coalesce(details->'receipt'->>'data', '') ~* '^data:application/pdf'
    or coalesce(details->'receipt'->>'name', '') ~* '\.pdf$'
  );

update public.pet_hotel_bookings
set details = jsonb_set(details, '{receipt}', (details->'receipt') - 'data', true),
    updated_at = now()
where jsonb_typeof(details->'receipt') = 'object'
  and details->'receipt' ? 'data'
  and (
    details->'receipt' ? 'document'
    or coalesce(details->'receipt'->>'data', '') ~* '^data:application/pdf'
    or coalesce(details->'receipt'->>'name', '') ~* '\.pdf$'
  );

update public.pet_daycare_bookings
set details = jsonb_set(details, '{receipt}', (details->'receipt') - 'data', true),
    updated_at = now()
where jsonb_typeof(details->'receipt') = 'object'
  and details->'receipt' ? 'data'
  and (
    details->'receipt' ? 'document'
    or coalesce(details->'receipt'->>'data', '') ~* '^data:application/pdf'
    or coalesce(details->'receipt'->>'name', '') ~* '\.pdf$'
  );

-- Older app_data deployments may also contain a JSON array mirror of orders.
update public.app_data as app_row
set payload = (
  select jsonb_agg(
    case
      when jsonb_typeof(order_row->'receipt') = 'object'
       and order_row->'receipt' ? 'data'
       and (
         order_row->'receipt' ? 'document'
         or coalesce(order_row->'receipt'->>'data', '') ~* '^data:application/pdf'
         or coalesce(order_row->'receipt'->>'name', '') ~* '\.pdf$'
       )
      then jsonb_set(order_row, '{receipt}', (order_row->'receipt') - 'data', true)
      else order_row
    end
    order by ordinal
  ) as payload
  from jsonb_array_elements(
    case when jsonb_typeof(app_row.payload) = 'array' then app_row.payload else '[]'::jsonb end
  ) with ordinality as order_data(order_row, ordinal)
), updated_at = now()
where app_row.storage_key in (
  'furgo-demo-marketplace-orders',
  'furgo-demo-grooming-bookings',
  'furgo-demo-hotel-bookings',
  'furgo-demo-daycare-bookings',
  'furgo-demo-pet-daycare-bookings',
  'furgo-demo-daycare-orders'
)
  and jsonb_typeof(app_row.payload) = 'array'
  and app_row.payload::text like '%"document"%'
  and app_row.payload::text like '%"data"%';

commit;
