-- Assign an internal product code only when a supplier's new product is approved and published.
create or replace function public.assign_marketplace_product_code_after_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  generated_code text;
begin
  if new.action <> 'add' or new.status <> 'Approved' or old.status = 'Approved' then
    return new;
  end if;

  loop
    generated_code := 'FGP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    exit when not exists (
      select 1
      from public.app_data data,
        lateral jsonb_array_elements(coalesce(data.payload, '[]'::jsonb)) product
      where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
        and product->>'productCode' = generated_code
    );
  end loop;

  update public.app_data data
  set payload = (
    select coalesce(jsonb_agg(
      case
        when product->>'id' = 'supplier-' || new.id::text
          then jsonb_set(product, '{productCode}', to_jsonb(generated_code), true)
        else product
      end
      order by ordinal
    ), '[]'::jsonb)
    from jsonb_array_elements(coalesce(data.payload, '[]'::jsonb)) with ordinality as entries(product, ordinal)
  ), updated_at = now()
  where data.record_id = 'shared:furgo-demo-marketplace-products:shared';

  return new;
end;
$$;

-- Give existing live products a code as well, without changing any customer-facing product fields.
update public.app_data data
set payload = (
  select coalesce(jsonb_agg(
    case
      when coalesce(product->>'productCode', '') = ''
        then jsonb_set(product, '{productCode}', to_jsonb('FGP-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))), true)
      else product
    end
    order by ordinal
  ), '[]'::jsonb)
  from jsonb_array_elements(coalesce(data.payload, '[]'::jsonb)) with ordinality as entries(product, ordinal)
)
where data.record_id = 'shared:furgo-demo-marketplace-products:shared'
  and jsonb_typeof(data.payload) = 'array';

drop trigger if exists marketplace_product_code_after_approval on public.marketplace_product_submissions;
create trigger marketplace_product_code_after_approval
after update of status on public.marketplace_product_submissions
for each row
execute function public.assign_marketplace_product_code_after_approval();
