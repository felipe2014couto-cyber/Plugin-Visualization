#!/usr/bin/env python3
"""Exporta uma tabela SQLite em CSV aceito pelo PostgreSQL COPY."""

import csv
import sqlite3
import sys
from pathlib import Path


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def copy_value(value: object) -> object:
    if value is None:
        return r"\N"
    if isinstance(value, bytes):
        return r"\x" + value.hex()
    return value


def main() -> int:
    if len(sys.argv) < 5:
        print(
            "Uso: export-sqlite-table.py BANCO TABELA DESTINO COLUNA [COLUNA ...]",
            file=sys.stderr,
        )
        return 2

    database_path = Path(sys.argv[1])
    table_name = sys.argv[2]
    destination = Path(sys.argv[3])
    columns = sys.argv[4:]
    query = "SELECT {} FROM {}".format(
        ", ".join(quote_identifier(column) for column in columns),
        quote_identifier(table_name),
    )

    connection = sqlite3.connect(f"file:{database_path}?mode=ro", uri=True)
    try:
        with destination.open("w", encoding="utf-8", newline="") as output:
            writer = csv.writer(output, lineterminator="\n")
            for row in connection.execute(query):
                writer.writerow(copy_value(value) for value in row)
    finally:
        connection.close()

    destination.chmod(0o600)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
