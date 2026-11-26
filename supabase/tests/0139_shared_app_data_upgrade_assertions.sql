-- Disposable upgrade database only. Run after 0139.
do $$
begin
  if (select count(*) from public.phase4_test_upgrade_fingerprints) <> 3 or exists (
    select 1
    from public.phase4_test_upgrade_fingerprints f
    left join public.app_data a using (record_id)
    where f.previous is distinct from (to_jsonb(a) - 'sync_version')
       or (a.sync_version is not null) is distinct from (f.record_id <> 'phase4-disposable-unrelated')
  ) then
    raise exception '0139 changed or lost a fixture, or initialized the wrong version.';
  end if;
end;
$$;
