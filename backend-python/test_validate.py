import re

COMMENT_RE = re.compile(r"(--[^\n]*\n)|(/\*.*?\*/)", re.DOTALL)
LEADING_SPACE_RE = re.compile(r"^\s+", re.DOTALL)

def strip_comments(sql: str) -> str:
    sql2 = COMMENT_RE.sub("\n", sql)
    sql2 = LEADING_SPACE_RE.sub("", sql2)
    return sql2.strip()

def normalize_sql(sql: str) -> str:
    normalized = sql.strip()
    if normalized.endswith(";"):
        normalized = normalized[:-1].rstrip()
    return normalized

def is_read_only_sql(sql: str) -> bool:
    normalized = normalize_sql(sql)
    if ";" in normalized:
        print("FAILED: Semicolon found in normalized")
        return False
        
    cleaned = strip_comments(normalized)
    low = cleaned.lower()
    
    if not (low.startswith("select") or low.startswith("with")):
        print(f"FAILED: Does not start with select or with. Starts with: {low[:20]}")
        return False
        
    return True

sql = """-- Unidades: Temperaturas em °C;
SELECT * FROM test;"""

print(is_read_only_sql(sql))
