-- Keep one product code for each warehouse product and its linked Marketplace listing.
-- Existing Marketplace codes are retained when a linked warehouse product has no code.

do $$
declare
  warehouse_row record;
  marketplace_code text;
  generated_code text;
begin
  for warehouse_row in
    select id, marketplace_product_id, product_data
    from public.warehouse_products
    where nullif(trim(coalesce(product_data->>'productCode', '')), '') is null
  loop
    marketplace_code := null;
    if nullif(trim(coalesce(warehouse_row.marketplace_product_id, '')), '') is not null then
      select nullif(trim(product->>'productCode'), '')
      into marketplace_code
      from public.app_data data,
        lateral jsonb_array_elements(case when jsonb_typeof(data.payload) = 'array' then data.payload else '[]'::jsonb end) product
      where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
        and product->>'id' = warehouse_row.marketplace_product_id
      limit 1;
    end if;

    generated_code := marketplace_code;
    if generated_code is null then
      loop
        generated_code := 'FGP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
        exit when not exists (
          select 1
          from public.warehouse_products other
          where other.id <> warehouse_row.id
            and other.product_data->>'productCode' = generated_code
        ) and not exists (
          select 1
          from public.app_data data,
            lateral jsonb_array_elements(coalesce(data.payload, '[]'::jsonb)) product
          where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
            and product->>'productCode' = generated_code
        );
      end loop;
    end if;

    update public.warehouse_products
    set product_data = jsonb_set(
          case when jsonb_typeof(product_data) = 'object' then product_data else '{}'::jsonb end,
          '{productCode}', to_jsonb(generated_code), true
        ),
        updated_at = now()
    where id = warehouse_row.id;
  end loop;
end;
$$;

-- The warehouse record is the source of truth for linked listings. The existing
-- sync trigger also aligns productCode and keeps all other linked details current.
update public.warehouse_products
set product_data = product_data,
    updated_at = now()
where marketplace_product_id is not null;
