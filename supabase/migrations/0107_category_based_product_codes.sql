-- Replace the temporary FGP product-code prefix with short category prefixes.
-- Product codes stay on the warehouse record, and the existing warehouse sync
-- trigger updates each linked Marketplace listing with the same code.

do $$
declare
  warehouse_row record;
  code_prefix text;
  generated_code text;
  suffix_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  suffix_length integer;
begin
  for warehouse_row in
    select id, marketplace_product_id, product_data
    from public.warehouse_products
  loop
    code_prefix := case lower(trim(coalesce(warehouse_row.product_data->>'category', 'other')))
      when 'food' then 'FD'
      when 'snacks' then 'SN'
      when 'supplements' then 'ST'
      when 'toys' then 'TY'
      when 'grooming' then 'GR'
      else 'OT'
    end;

    if coalesce(warehouse_row.product_data->>'productCode', '') ~ ('^' || code_prefix || '-[A-Z0-9]{8}$') then
      continue;
    end if;

    loop
      generated_code := code_prefix || '-';
      for suffix_length in 1..8 loop
        generated_code := generated_code || substr(suffix_alphabet, floor(random() * length(suffix_alphabet))::integer + 1, 1);
      end loop;

      exit when not exists (
        select 1
        from public.warehouse_products other
        where other.id <> warehouse_row.id
          and other.product_data->>'productCode' = generated_code
      ) and not exists (
        select 1
        from public.app_data data,
          lateral jsonb_array_elements(case when jsonb_typeof(data.payload) = 'array' then data.payload else '[]'::jsonb end) product
        where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
          and product->>'productCode' = generated_code
          and product->>'id' <> coalesce(warehouse_row.marketplace_product_id, '')
      );
    end loop;

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

-- Re-sync linked listings even when their warehouse code already used the new
-- format, so the warehouse remains the single source of truth.
update public.warehouse_products
set product_data = product_data,
    updated_at = now()
where marketplace_product_id is not null;
