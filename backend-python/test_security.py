import unittest

from sip_sql_policy import validate_read_only_sql


class ReadOnlySqlPolicyTests(unittest.TestCase):
    def assert_allowed(self, sql: str) -> None:
        self.assertEqual(validate_read_only_sql(sql), sql.strip().rstrip(";").rstrip())

    def assert_rejected(self, sql: str) -> None:
        with self.assertRaises(ValueError):
            validate_read_only_sql(sql)

    def test_allows_select_cte_and_binds(self):
        self.assert_allowed("SELECT COL FROM APPROVED_VIEW")
        self.assert_allowed("WITH dados AS (SELECT COL FROM APPROVED_VIEW) SELECT * FROM dados")
        self.assert_allowed("SELECT * FROM APPROVED_VIEW WHERE COD = :codigo")
        self.assert_allowed("/* report */\nSeLeCt '-- not a comment' AS value FROM DUAL;")

    def test_rejects_writes_ddl_plsql_and_session_changes(self):
        statements = [
            "INSERT INTO T VALUES (1)", "UPDATE T SET A=1", "DELETE FROM T", "MERGE INTO T USING X ON (1=1)",
            "CREATE TABLE T(A NUMBER)", "ALTER TABLE T ADD A NUMBER", "DROP TABLE T", "TRUNCATE TABLE T",
            "GRANT SELECT ON T TO U", "REVOKE SELECT ON T FROM U", "COMMIT", "ROLLBACK", "BEGIN NULL; END",
            "DECLARE X NUMBER; BEGIN NULL; END", "CALL PROC()", "EXECUTE PROC", "LOCK TABLE T IN EXCLUSIVE MODE",
            "ALTER SESSION SET NLS_DATE_FORMAT='x'", "SELECT * FROM T FOR UPDATE",
        ]
        for statement in statements:
            with self.subTest(statement=statement):
                self.assert_rejected(statement)

    def test_rejects_cte_comment_and_multiple_statement_bypasses(self):
        attempts = [
            "WITH x AS (DELETE FROM T RETURNING A INTO :a) SELECT * FROM x",
            "WITH x AS (SELECT 1 A FROM DUAL) UPDATE T SET A=1",
            "SELECT 1 FROM DUAL; DELETE FROM T",
            "SELECT 1 FROM DUAL;;",
            "/* hidden */ UPDATE T SET A=1",
            "SELECT UTL_HTTP.REQUEST('https://db.example.internal') FROM DUAL",
            "SELECT DBMS_RANDOM.VALUE FROM DUAL",
        ]
        for statement in attempts:
            with self.subTest(statement=statement):
                self.assert_rejected(statement)

    def test_semicolon_in_string_is_not_a_second_statement(self):
        self.assert_allowed("SELECT 'safe;data' AS VALUE FROM DUAL")


if __name__ == "__main__":
    unittest.main()
