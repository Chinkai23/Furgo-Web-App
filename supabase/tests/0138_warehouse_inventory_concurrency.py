"""Run against a fresh disposable local PostgreSQL database migrated through 0138.

Uses the connection parameters and checkout helpers from the Phase 2 suite.
"""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import json
import runpy
import time
from uuid import uuid4

phase2 = runpy.run_path(str(Path(__file__).with_name("0137_marketplace_checkout_concurrency.py")))
connect_factory = phase2["connect_factory"]
begin_as = phase2["customer"]
json_sql = phase2["json_sql"]
checkout = phase2["checkout"]
payload = phase2["payload"]
PostgresError = phase2["PostgresError"]


def race(observer, first, second, actor_a, actor_b, sql_a, sql_b, expected=None):
    begin_as(first, actor_a)
    begin_as(second, actor_b)
    result_a = first.sql(sql_a)
    with ThreadPoolExecutor(max_workers=1) as pool:
        contender = pool.submit(second.sql, sql_b)
        try:
            for _ in range(150):
                if observer.sql(f"select {first.pid} = any(pg_blocking_pids({second.pid}))") == "t":
                    break
                assert not contender.done(), "The concurrent request did not wait for the warehouse lock."
                time.sleep(0.02)
            else:
                raise AssertionError("The concurrent request did not reach its lock wait.")
        finally:
            first.sql("commit")
        try:
            result_b = contender.result(timeout=15)
        except PostgresError as error:
            second.sql("rollback")
            assert error.code == expected, error
            result_b = None
        else:
            second.sql("commit")
            assert expected is None, "An expected conflict unexpectedly succeeded."
    return result_a, result_b


def main():
    connect = connect_factory()
    observer, first, second = connect(), connect(), connect()
    try:
        store, buyer, warehouse, listing = (str(uuid4()) for _ in range(4))
        variant = {"id": "standard", "label": "Standard", "price": 10}
        product = {"name": "Stock race", "variants": [variant]}
        observer.sql(f"""
            insert into auth.users(id,email) values ('{store}','{store}@example.test'), ('{buyer}','{buyer}@example.test');
            insert into public.marketplace_supplier_access(supplier_user_id,supplier_name) values ('{store}', 'Stock Race Store');
            insert into public.warehouse_products(id,name,product_data,created_by,marketplace_product_id)
            values ('{warehouse}', 'Stock race', {json_sql(product)}, '{store}', '{listing}');
            insert into public.app_data(record_id,scope,storage_key,payload)
            values ('shared:furgo-demo-marketplace-products:shared', 'shared','furgo-demo-marketplace-products',
              {json_sql([dict(product, id=listing, warehouseProductId=warehouse)])})
            on conflict (record_id) do update set payload = excluded.payload;
            insert into public.app_data(record_id,scope,storage_key,payload)
            values ('shared:furgo-demo-marketplace-offers:shared','shared','furgo-demo-marketplace-offers','{{"freeShippingMinimum":0}}')
            on conflict (record_id) do update set payload = excluded.payload;
        """)

        def intake(request_id, units, date):
            fields = dict(warehouse_product_id=warehouse, variant_id="standard", quantity=units,
                          received_on=date, created_by=store)
            return f"select public.receive_warehouse_inventory_lot('{request_id}',{json_sql(fields)})"

        def deduct(lot_id, units):
            return f"select public.adjust_warehouse_inventory_lot('{lot_id}',{units},'Stock correction',null,'{uuid4()}'::uuid)"

        intake_once = intake(uuid4(), 5, "2026-11-25")
        received, repeated = race(observer, first, second, store, store, intake_once, intake_once)
        assert received == repeated
        lot = json.loads(received)["lot_id"]
        print("PASS concurrent intake replays once")

        race(observer, first, second, store, store, deduct(lot, 4), deduct(lot, 4), "PT409")
        assert observer.sql(f"select quantity from public.warehouse_inventory_lots where id = '{lot}'") == "1"
        print("PASS concurrent deductions cannot overdraw stock")

        received = observer.sql(f"""begin; set local role authenticated;
            select set_config('request.jwt.claim.sub', '{store}', true);""" + intake(uuid4(), 2, "2026-11-26"))
        observer.sql("commit")
        second_lot = json.loads(received)["lot_id"]
        order_ids = f"array['{lot}','{second_lot}']::uuid[]"
        reverse_ids = f"array['{second_lot}','{lot}']::uuid[]"
        reorder = f"select public.reorder_active_warehouse_inventory_lots({reverse_ids},{order_ids})"
        begin_as(first, store)
        first.sql(reorder)
        first.sql("commit")
        assert observer.sql(f"select pick_order from public.warehouse_inventory_lots where id = '{second_lot}'") == "1"
        begin_as(first, store)
        first.sql(f"select public.reorder_active_warehouse_inventory_lots({order_ids},{reverse_ids})")
        first.sql("commit")
        race(observer, first, second, store, store, intake(uuid4(), 2, "2026-11-27"), reorder, "PT409")
        print("PASS intake invalidates stale reordering")

        renamed = dict(product, variants=[dict(variant, label="Renamed")])
        rename = f"select public.update_warehouse_product('{warehouse}',{json_sql(product)},{json_sql(renamed)})"
        checkout_request = checkout(uuid4(), payload(listing, "bank-transfer"))
        race(observer, first, second, store, buyer, rename, checkout_request, "PT422")
        assert observer.sql(f"select sum(quantity) from public.warehouse_inventory_lots where warehouse_product_id = '{warehouse}' and variant = 'Renamed'") == "5"
        begin_as(second, buyer)
        order_id = second.sql(checkout_request)
        second.sql("commit")
        assert order_id
        print("PASS checkout detects a concurrent rename and retry allocates against the renamed option")

        cancel = f"select public.cancel_marketplace_order('{order_id}','Synthetic race cancellation')"
        race(observer, first, second, buyer, store, cancel, deduct(lot, 1))
        assert observer.sql(f"""select sum(quantity) = 4 and sum(quantity) = (
            select sum(quantity_delta) from public.warehouse_inventory_stock_history where warehouse_product_id = '{warehouse}'
        ) from public.warehouse_inventory_lots where warehouse_product_id = '{warehouse}'""") == "t"
        print("PASS cancellation and deduction keep quantities and history consistent")

        deduction = deduct(second_lot, 1)
        adjusted, repeated = race(observer, first, second, store, store, deduction, deduction)
        assert adjusted == repeated
        assert observer.sql(f"select quantity from public.warehouse_inventory_lots where id = '{second_lot}'") == "1"
        print("PASS concurrent adjustment replay records one deduction")
    finally:
        first.close()
        second.close()
        observer.close()


if __name__ == "__main__":
    main()
