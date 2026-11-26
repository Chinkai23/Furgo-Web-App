"""Exercise two real transactions against a fresh, disposable cluster.

Use the Phase 2 FURGO_TEST_PG_* variables. The private socket directory must
be named furgo-phase4-pg.* with the cluster in its data subdirectory, and
the test database must be named furgo_checkout_phase4_race.
"""
import os
from pathlib import Path
import runpy
from uuid import uuid4

warehouse_tests = runpy.run_path(str(Path(__file__).with_name("0138_warehouse_inventory_concurrency.py")))
connect_factory = warehouse_tests["connect_factory"]
race = warehouse_tests["race"]
json_sql = warehouse_tests["json_sql"]


def verify_connections(connections):
    socket = Path(os.environ["FURGO_TEST_PG_SOCKET"]).resolve(strict=True)
    port = os.environ["FURGO_TEST_PG_PORT"]
    if not socket.name.startswith("furgo-phase4-pg.") or not (socket / f".s.PGSQL.{port}").is_socket():
        raise ValueError("Use a new private Phase 4 PostgreSQL socket.")
    expected = f"furgo_checkout_phase4_race|{socket / 'data'}|{port}|true"
    for connection in connections:
        target = connection.sql("""
          select current_database() || '|' || current_setting('data_directory')
            || '|' || current_setting('port') || '|' || (inet_client_addr() is null)::text
        """)
        if target != expected:
            raise ValueError(f"Unexpected PostgreSQL test target: {target}")


def main():
    connect = connect_factory()
    observer, first, second = connections = (connect(), connect(), connect())
    try:
        verify_connections(connections)
        actors = [str(uuid4()), str(uuid4())]
        observer.sql(f"""
            insert into auth.users(id, email)
            values ('{actors[0]}', '{actors[0]}@example.test'), ('{actors[1]}', '{actors[1]}@example.test');
            insert into public.user_roles(user_id, role)
            values ('{actors[0]}', 'admin'), ('{actors[1]}', 'admin');
        """)
        key = "furgo-demo-home-service-shortcuts"
        row_id = f"shared:{key}:shared"

        def save(actor, version, payload):
            expected = "null" if version is None else f"'{version}'"
            return f"select public.save_versioned_shared_app_data('{actor}', '{key}', {expected}, {json_sql(payload)})"

        def verify_race(baseline, winner, loser):
            verify_connections(connections)
            winner_version, rejected = race(
                observer, first, second, *actors,
                save(actors[0], baseline, winner), save(actors[1], baseline, loser), "PT409",
            )
            assert winner_version and winner_version != baseline and rejected is None
            assert observer.sql(f"""
                select payload = {json_sql(winner)} and sync_version = '{winner_version}'
                from public.app_data where record_id = '{row_id}'
            """) == "t"
            return winner_version

        created = verify_race(None, ["hotel"], ["daycare"])
        print("PASS simultaneous create from a missing baseline keeps only one winner")
        verify_race(created, ["hotel", "grooming"], ["marketplace"])
        print("PASS simultaneous update from the same version keeps only one winner")
    finally:
        for connection in connections:
            connection.close()


if __name__ == "__main__":
    main()
