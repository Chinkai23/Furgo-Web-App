-- Provide Directors with privacy-preserving product and service aggregates.
-- No customer names, contact details, addresses, or user IDs are returned.
create or replace function public.get_director_product_service_insights(
  p_days integer default 365,
  p_granularity text default 'month'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
  days_back integer;
  bucket_unit text := lower(coalesce(p_granularity, 'month'));
  result jsonb;
begin
  if public.current_portal_level(caller) <> 3 then
    raise exception 'Product and service insights are available to Directors only.';
  end if;
  if bucket_unit not in ('day', 'month', 'year') then bucket_unit := 'month'; end if;
  days_back := greatest(1, least(coalesce(p_days, 365), 3650));
  if bucket_unit = 'day' then days_back := least(days_back, 90); end if;

  with catalog as (
    select product.value as data
    from public.app_data source
    cross join lateral jsonb_array_elements(
      case when jsonb_typeof(source.payload) = 'array' then source.payload else '[]'::jsonb end
    ) as product(value)
    where source.scope = 'shared'
      and source.storage_key = 'furgo-demo-marketplace-products'
  ),
  paid_marketplace_orders as (
    select order_row.id, order_row.created_at, order_row.total, order_row.details
    from public.marketplace_orders order_row
    where order_row.created_at >= now() - (days_back || ' days')::interval
      and lower(order_row.status) not in ('cancelled', 'canceled', 'refunded')
      and lower(order_row.payment_status) not like '%pending%'
      and lower(order_row.payment_status) not like '%awaiting%'
  ),
  service_events as (
    select 'Grooming'::text as service, booking.created_at, booking.outlet,
      booking.details, booking.status
    from public.grooming_bookings booking
    where booking.created_at >= now() - (days_back || ' days')::interval
      and lower(booking.status) <> 'cancelled'
    union all
    select 'Pet Hotel', booking.created_at, booking.outlet, booking.details, booking.status
    from public.pet_hotel_bookings booking
    where booking.created_at >= now() - (days_back || ' days')::interval
      and lower(booking.status) not in ('cancelled', 'canceled')
    union all
    select 'Pet Daycare', booking.created_at, booking.outlet, booking.details, booking.status
    from public.pet_daycare_bookings booking
    where booking.created_at >= now() - (days_back || ' days')::interval
      and lower(booking.status) not in ('cancelled', 'canceled')
  ),
  eligible_service_events as (
    select * from service_events
    where lower(coalesce(details->>'paymentStatus', '')) not like '%pending%'
      and lower(coalesce(details->>'paymentStatus', '')) not like '%awaiting%'
      and lower(coalesce(status, '')) not like '%pending payment%'
  ),
  marketplace_items as (
    select order_row.id as order_id, order_row.created_at,
      coalesce(nullif(line.item->>'productId', ''), 'unknown') as product_id,
      coalesce(nullif(line.item->>'name', ''), catalog.data->>'name', 'Unknown product') as product_name,
      coalesce(nullif(line.item->>'category', ''), catalog.data->>'category', 'Uncategorised') as category,
      coalesce(nullif(line.item->>'nutrition', ''), catalog.data->>'nutrition', 'Not recorded') as nutrition,
      coalesce(nullif(line.item->>'ingredients', ''), catalog.data->>'ingredients', 'Not recorded') as ingredients,
      case when coalesce(line.item->>'quantity', '') ~ '^[0-9]+([.][0-9]+)?$' then (line.item->>'quantity')::numeric else 0 end as quantity,
      case when coalesce(line.item->>'total', '') ~ '^[0-9]+([.][0-9]+)?$' then (line.item->>'total')::numeric
        when coalesce(line.item->>'unitPrice', '') ~ '^[0-9]+([.][0-9]+)?$' then (line.item->>'unitPrice')::numeric *
          case when coalesce(line.item->>'quantity', '') ~ '^[0-9]+([.][0-9]+)?$' then (line.item->>'quantity')::numeric else 0 end
        else 0 end as line_total,
      order_row.details
    from paid_marketplace_orders order_row
    join public.marketplace_order_items line on line.order_id = order_row.id
    left join catalog on catalog.data->>'id' = line.item->>'productId'
  ),
  all_events as (
    select created_at, 'Marketplace'::text as service, 1::integer as order_count,
      total as amount, coalesce((select sum(line.quantity) from marketplace_items line where line.order_id = order_row.id), 0) as units
    from paid_marketplace_orders order_row
    union all
    select created_at, service, 1, case when coalesce(details->>'total', '') ~ '^[0-9]+([.][0-9]+)?$' then (details->>'total')::numeric else 0 end, 0
    from eligible_service_events
  ),
  product_rows as (
    select product_id, product_name, category, nutrition, ingredients,
      sum(quantity) as units_sold, count(distinct order_id)::integer as order_count,
      sum(line_total) as sales_value
    from marketplace_items
    group by product_id, product_name, category, nutrition, ingredients
  ),
  pet_weight_groups as (
    select case
        when weight_kg is null then 'Weight not recorded'
        when weight_kg < 5 then 'Under 5 kg'
        when weight_kg < 10 then '5–9.9 kg'
        when weight_kg < 25 then '10–24.9 kg'
        else '25 kg and above'
      end as weight_band,
      count(*)::integer as pet_count
    from public.pet_profiles
    group by 1
  ),
  pet_breeds as (
    select coalesce(nullif(btrim(breed), ''), 'Breed not recorded') as breed,
      count(*)::integer as pet_count
    from public.pet_profiles
    group by 1
  ),
  service_pet_rows as (
    select service,
      coalesce(nullif(btrim(details->>'petBreed'), ''), 'Breed not recorded') as breed,
      coalesce(nullif(btrim(details->>'weightTier'), ''),
        case
          when coalesce(details->>'petWeight', '') !~ '^[0-9]+([.][0-9]+)?$' then 'Weight not recorded'
          when (details->>'petWeight')::numeric < 5 then 'Under 5 kg'
          when (details->>'petWeight')::numeric < 10 then '5–9.9 kg'
          when (details->>'petWeight')::numeric < 25 then '10–24.9 kg'
          else '25 kg and above'
        end) as weight_band,
      case when coalesce(details->>'total', '') ~ '^[0-9]+([.][0-9]+)?$' then (details->>'total')::numeric else 0 end as amount
    from eligible_service_events
  ),
  service_locations as (
    select service, coalesce(nullif(btrim(outlet), ''), 'Outlet not recorded') as location, count(*)::integer as bookings
    from eligible_service_events group by service, 2
  ),
  marketplace_locations as (
    select coalesce(nullif(btrim(details->'address'->>'city'), ''), 'City not recorded') as city,
      coalesce(nullif(btrim(details->'address'->>'state'), ''), 'State not recorded') as state,
      count(*)::integer as orders
    from paid_marketplace_orders group by 1, 2
  )
  select jsonb_build_object(
    'days', days_back,
    'granularity', bucket_unit,
    'totals', jsonb_build_object(
      'marketplace_orders', (select count(*)::integer from paid_marketplace_orders),
      'product_units', (select coalesce(sum(quantity), 0) from marketplace_items),
      'marketplace_sales', (select coalesce(sum(total), 0) from paid_marketplace_orders),
      'service_bookings', (select count(*)::integer from eligible_service_events),
      'service_sales', (select coalesce(sum(amount), 0) from service_pet_rows),
      'pet_profiles', (select count(*)::integer from public.pet_profiles)
    ),
    'timeline', coalesce((
      select jsonb_agg(jsonb_build_object(
        'period', bucket::date,
        'marketplace_orders', marketplace_orders,
        'product_units', product_units,
        'marketplace_sales', marketplace_sales,
        'grooming_bookings', grooming_bookings,
        'hotel_bookings', hotel_bookings,
        'daycare_bookings', daycare_bookings,
        'service_sales', service_sales
      ) order by bucket desc)
      from (
        select date_trunc(bucket_unit, created_at) as bucket,
          count(*) filter (where service = 'Marketplace')::integer as marketplace_orders,
          coalesce(sum(units) filter (where service = 'Marketplace'), 0) as product_units,
          coalesce(sum(amount) filter (where service = 'Marketplace'), 0) as marketplace_sales,
          count(*) filter (where service = 'Grooming')::integer as grooming_bookings,
          count(*) filter (where service = 'Pet Hotel')::integer as hotel_bookings,
          count(*) filter (where service = 'Pet Daycare')::integer as daycare_bookings,
          coalesce(sum(amount) filter (where service <> 'Marketplace'), 0) as service_sales
        from all_events group by 1
      ) trend
    ), '[]'::jsonb),
    'products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_id', product_id, 'name', product_name, 'category', category,
        'nutrition', nutrition, 'ingredients', ingredients, 'units_sold', units_sold,
        'orders', order_count, 'sales', sales_value
      ) order by units_sold desc, product_name)
      from product_rows
    ), '[]'::jsonb),
    'pet_breeds', coalesce((
      select jsonb_agg(jsonb_build_object('breed', breed, 'pets', pet_count) order by pet_count desc, breed)
      from pet_breeds
    ), '[]'::jsonb),
    'pet_weight_bands', coalesce((
      select jsonb_agg(jsonb_build_object('weight_band', weight_band, 'pets', pet_count) order by weight_band)
      from pet_weight_groups
    ), '[]'::jsonb),
    'service_pet_segments', coalesce((
      select jsonb_agg(jsonb_build_object('service', service, 'breed', breed, 'weight_band', weight_band,
        'bookings', bookings, 'sales', sales) order by bookings desc, service, breed)
      from (
        select service, breed, weight_band, count(*)::integer as bookings, sum(amount) as sales
        from service_pet_rows group by service, breed, weight_band
      ) segments
    ), '[]'::jsonb),
    'service_locations', coalesce((
      select jsonb_agg(jsonb_build_object('service', service, 'location', location, 'bookings', bookings)
        order by bookings desc, service, location)
      from service_locations
    ), '[]'::jsonb),
    'marketplace_locations', coalesce((
      select jsonb_agg(jsonb_build_object('city', city, 'state', state, 'orders', orders) order by orders desc, state, city)
      from marketplace_locations
    ), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.get_director_product_service_insights(integer, text) from public, anon;
grant execute on function public.get_director_product_service_insights(integer, text) to authenticated;
notify pgrst, 'reload schema';
