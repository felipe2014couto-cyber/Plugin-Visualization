"""Dependency-free, fail-closed SQL policy for the SIP read-only service."""

from typing import List, Tuple


FORBIDDEN_KEYWORDS = {
    "INSERT", "UPDATE", "DELETE", "MERGE", "CREATE", "ALTER", "DROP", "TRUNCATE", "RENAME",
    "GRANT", "REVOKE", "COMMIT", "ROLLBACK", "SAVEPOINT", "BEGIN", "DECLARE", "CALL", "EXEC",
    "EXECUTE", "LOCK", "SET",
}
DANGEROUS_ORACLE_PREFIXES = ("UTL_", "DBMS_", "OWA_", "HTP", "HTF", "JAVA")


def lex_sql(sql: str) -> Tuple[List[Tuple[str, int]], int]:
    """Tokenize outside strings/comments and retain parenthesis depth."""
    tokens: List[Tuple[str, int]] = []
    depth, statements, i, length = 0, 1, 0, len(sql)
    while i < length:
        char = sql[i]
        nxt = sql[i + 1] if i + 1 < length else ""
        if char == "-" and nxt == "-":
            i += 2
            while i < length and sql[i] not in "\r\n":
                i += 1
            continue
        if char == "/" and nxt == "*":
            end = sql.find("*/", i + 2)
            if end < 0:
                raise ValueError("unterminated comment")
            i = end + 2
            continue
        if char in {"'", '"'}:
            quote = char
            i += 1
            while i < length:
                if sql[i] == quote:
                    if i + 1 < length and sql[i + 1] == quote:
                        i += 2
                        continue
                    i += 1
                    break
                i += 1
            else:
                raise ValueError("unterminated string")
            continue
        if char == "(":
            depth += 1
        elif char == ")":
            depth -= 1
            if depth < 0:
                raise ValueError("unbalanced parenthesis")
        elif char == ";":
            statements += 1
        elif char.isalpha() or char in {"_", "$", "#"}:
            start = i
            i += 1
            while i < length and (sql[i].isalnum() or sql[i] in {"_", "$", "#"}):
                i += 1
            tokens.append((sql[start:i].upper(), depth))
            continue
        i += 1
    if depth != 0:
        raise ValueError("unbalanced parenthesis")
    return tokens, statements


def validate_read_only_sql(sql: str, max_sql_bytes: int = 65536) -> str:
    if not isinstance(sql, str) or not sql.strip() or len(sql.encode("utf-8")) > max_sql_bytes:
        raise ValueError("invalid SQL size")
    normalized = sql.strip()
    if normalized.endswith(";"):
        normalized = normalized[:-1].rstrip()
    tokens, statements = lex_sql(normalized)
    words = [token for token, _ in tokens]
    if statements != 1 or not tokens or words[0] not in {"SELECT", "WITH"}:
        raise ValueError("not a single read-only statement")
    if any(token in FORBIDDEN_KEYWORDS for token in words):
        raise ValueError("forbidden keyword")
    if any(token.startswith(DANGEROUS_ORACLE_PREFIXES) for token in words):
        raise ValueError("forbidden package")
    if any(words[index:index + 2] == ["FOR", "UPDATE"] for index in range(len(words) - 1)):
        raise ValueError("select for update")
    if words[0] == "WITH" and not any(token == "SELECT" and depth == 0 for token, depth in tokens[1:]):
        raise ValueError("CTE must end in SELECT")
    return normalized
