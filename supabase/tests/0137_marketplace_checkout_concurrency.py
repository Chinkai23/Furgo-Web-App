"""Run with Python 3 and libpq against a disposable furgo_checkout_* database.

Set FURGO_TEST_PG_SOCKET to its local Unix socket directory and optionally
FURGO_TEST_PG_PORT, FURGO_TEST_PG_DATABASE, FURGO_TEST_PG_USER and FURGO_TEST_LIBPQ.
Apply the migrations first. Fixtures are committed so independent connections
can exercise contention, so use a fresh disposable database for each run.
"""

from concurrent.futures import ThreadPoolExecutor
import ctypes as ct
from ctypes.util import find_library
import json
import os
from pathlib import Path
import re
import time
from uuid import uuid4


class PostgresError(Exception):
    def __init__(self, code, message):
        self.code = code
        super().__init__(f"{code} {message}")


def connect_factory():
    socket = Path(os.environ["FURGO_TEST_PG_SOCKET"]).resolve(strict=True)
    db = os.environ.get("FURGO_TEST_PG_DATABASE", "furgo_checkout_tests")
    port = os.environ.get("FURGO_TEST_PG_PORT", "5432")
    user = os.environ.get("FURGO_TEST_PG_USER", os.environ.get("USER", "postgres"))
    if not socket.is_dir() or not re.fullmatch(r"furgo_checkout_[a-z0-9_]+", db):
        raise ValueError("Use a disposable furgo_checkout_* database on a local Unix socket.")
    libpq = ct.CDLL(os.environ.get("FURGO_TEST_LIBPQ") or find_library("pq"))
    pointer, string, integer = ct.c_void_p, ct.c_char_p, ct.c_int

    def api(name, args, result):
        function = getattr(libpq, name)
        function.argtypes, function.restype = args, result
        return function

    connect = api("PQconnectdbParams", [ct.POINTER(string), ct.POINTER(string), integer], pointer)
    connection_status = api("PQstatus", [pointer], integer)
    connection_error = api("PQerrorMessage", [pointer], string)
    backend_pid = api("PQbackendPID", [pointer], integer)
    execute = api("PQexec", [pointer, string], pointer)
    result_status = api("PQresultStatus", [pointer], integer)
    result_error = api("PQresultErrorField", [pointer, integer], string)
    rows = api("PQntuples", [pointer], integer)
    value = api("PQgetvalue", [pointer, integer, integer], string)
    clear = api("PQclear", [pointer], None)
    finish = api("PQfinish", [pointer], None)

    class Connection:
        def __init__(self):
            keys = (string * 5)(b"host", b"port", b"dbname", b"user", None)
            values = (string * 5)(str(socket).encode(), port.encode(), db.encode(), user.encode(), None)
            self.handle = connect(keys, values, 0)
            if connection_status(self.handle) != 0:
                error = connection_error(self.handle).decode()
                finish(self.handle)
                raise ConnectionError(error)
            self.pid = backend_pid(self.handle)
            self.sql("set statement_timeout = '12s'")

        def sql(self, sql):
            result = execute(self.handle, sql.encode())
            if not result:
                raise ConnectionError(connection_error(self.handle).decode())
            try:
                if result_status(result) not in (1, 2):
                    code = result_error(result, ord("C")).decode()
                    raise PostgresError(code, connection_error(self.handle).decode())
                return value(result, 0, 0).decode() if rows(result) else ""
            finally:
                clear(result)

        def close(self):
            finish(self.handle)

    return Connection


def scalar(value):
    return "'" + str(value).replace("'", "''") + "'"


def json_sql(value):
    return scalar(json.dumps(value)) + "::jsonb"


def customer(connection, user_id):
    connection.sql(f"begin; set local role authenticated; select set_config('request.jwt.claim.sub', '{user_id}', true)")


def payload(product, payment="gateway", voucher=""):
    return {
        "items": [{"productId": product, "variantId": "standard", "quantity": 1}],
        "payment": payment,
        "voucherCode": voucher,
        "address": {"name": "Test Buyer", "phone": "0123456789", "street": "Test Road", "postcode": "50000",
                    "city": "Kuala Lumpur", "state": "Kuala Lumpur"},
        "transferSlip": {"name": "bank.pdf", "data": "data:application/pdf;base64,JVBERg=="} if payment == "bank-transfer" else None,
    }


def checkout(request, checkout_payload, cents=1000):
    return f"select public.create_marketplace_order('{request}', {json_sql(checkout_payload)}, {cents})->'order'->>'id'"


def fixture(connection):
    users = [str(uuid4()) for _ in range(2)]
    for user in users:
        connection.sql(f"insert into auth.users(id,email) values ('{user}','{user}@example.test')")
    products = {}
    catalog_entries = []
    for name, available in [("duplicate", 2), ("stock", 1), ("deferred", 1), ("voucher", 4), ("wallet", 4), ("rollback", 1)]:
        warehouse, lot, product = str(uuid4()), str(uuid4()), f"race-{name}-{uuid4()}"
        products[name] = (product, lot)
        variants = [{"id": "standard", "label": "Standard", "price": 10}]
        connection.sql(f"""
            insert into public.warehouse_products(id,name,product_data,marketplace_product_id)
            values ('{warehouse}', '{name}', {json_sql({"variants": variants})}, '{product}');
            insert into public.warehouse_inventory_lots(id,warehouse_product_id,product_name,variant,quantity)
            values ('{lot}','{warehouse}','{name}','Standard',{available});
        """)
        catalog_entries.append({"id": product, "name": name, "warehouseProductId": warehouse, "variants": variants})
    settings = {"freeShippingMinimum": 0, "furgoVouchers": [
        {"id": "concurrent", "code": "CONCURRENT", "enabled": True, "discountType": "fixed", "discountValue": 1, "maxUses": 31}]}
    for key, data in [("products", catalog_entries), ("offers", settings)]:
        storage_key = f"furgo-demo-marketplace-{key}"
        connection.sql(f"""
            insert into public.app_data(record_id,scope,storage_key,payload)
            values ('shared:{storage_key}:shared','shared','{storage_key}',{json_sql(data)})
            on conflict (record_id) do update set payload = excluded.payload
        """)
    code, reward = f"FCV-RACE-{uuid4().hex.upper()}", str(uuid4())
    connection.sql(f"""
        insert into public.furgo_coin_exchange_items(id,name,coin_cost,max_redemptions)
        values ('{reward}','Concurrent voucher',1,1);
        insert into public.furgo_coin_exchange_redemptions
          (item_id,reward_name,user_id,coin_cost,voucher_code,voucher_category,voucher_discount_type,voucher_discount_value)
        values ('{reward}','Concurrent voucher','{users[0]}',1,'{code}','marketplace','fixed',1);
        insert into public.app_data(record_id,scope,storage_key,owner_id,payload)
        values ('customer:furgo-demo-credit-balance:{users[0]}','customer','furgo-demo-credit-balance','{users[0]}','"10.00"'),
          ('customer:furgo-demo-credit-balance:{users[1]}','customer','furgo-demo-credit-balance','{users[1]}','"20.00"');
    """)
    return users, products, code


def main():
    connect = connect_factory()
    observer, first, second = connect(), connect(), connect()
    try:
        users, products, owned_code = fixture(observer)
        a, b = users

        def race(name, first_user, first_sql, second_user, second_sql, expected_error=None):
            customer(first, first_user)
            customer(second, second_user)
            first_result = first.sql(first_sql)
            with ThreadPoolExecutor(max_workers=1) as pool:
                contender = pool.submit(second.sql, second_sql)
                try:
                    for _ in range(150):
                        if observer.sql(f"select {first.pid} = any(pg_blocking_pids({second.pid}))") == "t":
                            break
                        if contender.done():
                            raise AssertionError(f"{name}: contender did not wait for the first transaction")
                        time.sleep(0.02)
                    else:
                        raise AssertionError(f"{name}: no concurrent lock wait was observed")
                finally:
                    first.sql("commit")
                try:
                    second_result = contender.result(timeout=15)
                except PostgresError as error:
                    second.sql("rollback")
                    assert expected_error == error.code, (name, error)
                    second_result = None
                else:
                    second.sql("commit")
                    assert expected_error is None, (name, "both requests unexpectedly succeeded")
            print("PASS", name)
            return first_result, second_result

        def stock(product_name):
            return observer.sql(f"select quantity from public.warehouse_inventory_lots where id='{products[product_name][1]}'")

        product = products["duplicate"][0]
        request = uuid4()
        first_order, second_order = race("duplicate request returns the same order", a, checkout(request, payload(product, "bank-transfer")),
                                         a, checkout(request, payload(product, "bank-transfer")))
        assert first_order and first_order == second_order and stock("duplicate") == "1"

        product = products["stock"][0]
        losing_request = uuid4()
        race("distinct bank checkouts cannot oversell the last unit", a, checkout(uuid4(), payload(product, "bank-transfer")),
             b, checkout(losing_request, payload(product, "bank-transfer")), "PT422")
        assert stock("stock") == "0"
        assert observer.sql(f"select count(*) from public.marketplace_checkout_requests where request_id='{losing_request}'") == "0"

        product = products["deferred"][0]
        demo_orders = []
        for connection, user in [(first, a), (second, b)]:
            customer(connection, user)
            demo_orders.append(connection.sql(checkout(uuid4(), payload(product))))
            connection.sql("commit")
        race("deferred online demo completion cannot oversell the last unit",
             a, f"select public.complete_marketplace_demo_payment('{demo_orders[0]}')",
             b, f"select public.complete_marketplace_demo_payment('{demo_orders[1]}')", "P0001")
        assert stock("deferred") == "0"
        assert observer.sql(f"select payment_status from public.marketplace_orders where id='{demo_orders[1]}'") == "Pending Payment"

        product = products["voucher"][0]
        observer.sql(f"""insert into public.marketplace_voucher_uses(order_id,user_id,voucher_code,voucher_id,used_at)
            select 'historic-concurrent-'||gen_random_uuid(), '{a}', 'CONCURRENT', 'concurrent', now()
            from generate_series(1, 30)
        """)
        race("global voucher limit is enforced across customers", a, checkout(uuid4(), payload(product, voucher="CONCURRENT"), 900),
             b, checkout(uuid4(), payload(product, voucher="CONCURRENT"), 900), "PT422")
        race("one issued voucher can only be claimed once", a, checkout(uuid4(), payload(product, voucher=owned_code), 900),
             a, checkout(uuid4(), payload(product, voucher=owned_code), 900), "PT422")
        assert observer.sql(f"select count(*) from public.marketplace_voucher_uses where voucher_code='{owned_code}'") == "1"

        product = products["wallet"][0]
        race("concurrent demo-credit spends cannot double-debit", a, checkout(uuid4(), payload(product, "wallet")),
             a, checkout(uuid4(), payload(product, "wallet")), "PT402")
        assert stock("wallet") == "3"
        assert observer.sql(f"select jsonb_array_length(payload) from public.app_data where record_id='customer:furgo-demo-credit-transactions:{a}'") == "1"

        product = products["rollback"][0]
        race("late stock failure rolls back the demo debit and order", a, checkout(uuid4(), payload(product, "bank-transfer")),
             b, checkout(uuid4(), payload(product, "wallet")), "PT422")
        assert stock("rollback") == "0"
        assert observer.sql(f"select ((payload #>> '{{}}')::numeric = 20) from public.app_data where record_id='customer:furgo-demo-credit-balance:{b}'") == "t"
        assert observer.sql(f"select count(*) from public.app_data where record_id='customer:furgo-demo-credit-transactions:{b}'") == "0"
    finally:
        second.close()
        first.close()
        observer.close()


if __name__ == "__main__":
    main()
