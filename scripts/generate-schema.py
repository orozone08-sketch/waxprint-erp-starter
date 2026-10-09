"""One-time port helper: preserve the legacy SQLAlchemy model schema in SQLite."""
import ast
from pathlib import Path

tree = ast.parse(Path('backend/app/models.py').read_text())
statements = ['-- Initial schema preserves the legacy ERP tables. Never edit applied migrations.', 'PRAGMA foreign_keys = ON;']
metadata = {}
for cls in tree.body:
    if not isinstance(cls, ast.ClassDef):
        continue
    table = next((n.value.value for n in cls.body if isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == '__tablename__' for t in n.targets)), None)
    if not table:
        continue
    columns, indexes, fields = [], [], {}
    for n in cls.body:
        if not isinstance(n, ast.AnnAssign) or not isinstance(n.value, ast.Call) or ast.unparse(n.value.func) != 'mapped_column':
            continue
        name = n.target.id
        kw = {k.arg: k.value for k in n.value.keywords}
        annotation = ast.unparse(n.annotation)
        typ = 'INTEGER' if 'int' in annotation or 'bool' in annotation else 'REAL' if 'float' in annotation else 'TEXT'
        sql = f'"{name}" {typ}'
        nullable = 'None' in annotation or ast.literal_eval(kw.get('nullable', ast.Constant(False)))
        if name == 'id':
            sql += ' PRIMARY KEY AUTOINCREMENT'
        else:
            if not nullable:
                sql += ' NOT NULL'
            if 'unique' in kw and ast.literal_eval(kw['unique']):
                sql += ' UNIQUE'
            default = kw.get('default')
            if default is not None:
                if isinstance(default, ast.Constant):
                    val = default.value
                    sql += ' DEFAULT ' + (str(int(val)) if isinstance(val, bool) else str(val) if isinstance(val, (int, float)) else "'" + str(val).replace("'", "''") + "'")
                elif 'datetime.utcnow' == ast.unparse(default):
                    sql += " DEFAULT (strftime('%Y-%m-%dT%H:%M:%f','now'))"
                elif 'date.today' == ast.unparse(default):
                    sql += " DEFAULT (date('now'))"
            for arg in n.value.args:
                if isinstance(arg, ast.Call) and ast.unparse(arg.func) == 'ForeignKey':
                    ref = ast.literal_eval(arg.args[0]).split('.')
                    sql += f' REFERENCES "{ref[0]}"("{ref[1]}")'
            if 'index' in kw and ast.literal_eval(kw['index']):
                indexes.append(f'CREATE INDEX "ix_{table}_{name}" ON "{table}"("{name}");')
        columns.append(sql)
        fields[name] = {'type': 'boolean' if 'bool' in annotation else 'number' if typ in ('INTEGER', 'REAL') else 'string', 'nullable': bool(nullable)}
    if table == 'platform_files':
        columns.append('UNIQUE(platform_id, job_file_id)')
    statements.append(f'CREATE TABLE "{table}" (\n  ' + ',\n  '.join(columns) + '\n);')
    statements.extend(indexes)
    metadata[table] = fields
statements.append('CREATE TABLE integration_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);')
statements.append('CREATE TABLE login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL);')
Path('migrations').mkdir(exist_ok=True)
Path('worker').mkdir(exist_ok=True)
Path('migrations/0001_initial.sql').write_text('\n\n'.join(statements) + '\n')
import json
Path('worker/schema.ts').write_text('// Generated from the preserved legacy models.\nexport const schema = ' + json.dumps(metadata, indent=2) + ' as const;\n')
