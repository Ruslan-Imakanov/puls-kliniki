#!/usr/bin/env python3
"""Собирает public/ в один HTML-файл (для публикации как Artifact или отправки файлом).

ES-модули склеиваются в один <script type="module">: каждый модуль оборачивается
в функцию, экспорты возвращаются объектом и разбираются в импортирующих модулях.
Использование: python3 tools/build_artifact.py <out.html> [--standalone]
  --standalone — добавить <!doctype html><html><head>…, чтобы файл открывался сам по себе.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent / 'public'
IMP = re.compile(r"^import\s*\{([^}]*)\}\s*from\s*'\./([\w-]+)\.js';\s*$", re.M)
EXP_DECL = re.compile(r"^export\s+(?:async\s+)?(function|const|let|class)\s+([\w$]+)", re.M)
EXP_LIST = re.compile(r"^export\s*\{([^}]*)\};?\s*$", re.M)

def load(name, mods, order):
    if name in mods:
        return
    src = (ROOT / 'js' / f'{name}.js').read_text(encoding='utf-8')
    deps = [m.group(2) for m in IMP.finditer(src)]
    mods[name] = None
    for d in deps:
        load(d, mods, order)
    imports = []
    for m in IMP.finditer(src):
        names = []
        for part in m.group(1).split(','):
            part = part.strip()
            if not part:
                continue
            if ' as ' in part:
                a, b = [x.strip() for x in part.split(' as ')]
                names.append(f'{a}: {b}')
            else:
                names.append(part)
        imports.append(f"const {{ {', '.join(names)} }} = __m_{m.group(2).replace('-', '_')};")
    body = IMP.sub('', src)
    exports = [m.group(2) for m in EXP_DECL.finditer(body)]
    for m in EXP_LIST.finditer(body):
        exports += [p.strip() for p in m.group(1).split(',') if p.strip()]
    body = EXP_LIST.sub('', body)
    body = re.sub(r"^export\s+(?=(async\s+)?(function|const|let|class)\b)", '', body, flags=re.M)
    if re.search(r"^(import|export)\s", body, re.M):
        raise SystemExit(f'{name}.js: неподдержанный import/export')
    var = '__m_' + name.replace('-', '_')
    mods[name] = f"const {var} = (() => {{\n{chr(10).join(imports)}\n{body}\nreturn {{ {', '.join(exports)} }};\n}})();\n"
    order.append(name)

def main():
    out = pathlib.Path(sys.argv[1])
    standalone = '--standalone' in sys.argv
    mods, order = {}, []
    load('app', mods, order)
    js = '\n'.join(mods[n] for n in order)
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    body = html.split('<!--BODY-->')[1].split('<!--/BODY-->')[0].strip()
    title = re.search(r'<title>(.*?)</title>', html).group(1)
    fonts = re.search(r'<link rel="stylesheet" href="https://fonts[^>]+>', html).group(0)
    css = (ROOT / 'styles.css').read_text(encoding='utf-8')
    page = (f'<title>{title}</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n{fonts}\n'
            f'<style>\n{css}\n</style>\n{body}\n<script type="module">\n{js}\n</script>\n')
    if standalone:
        page = ('<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
                '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
                + page.replace(body, '</head>\n<body>\n' + body, 1) + '</body>\n</html>\n')
    out.write_text(page, encoding='utf-8')
    (out.with_suffix('.bundle.mjs')).write_text(js, encoding='utf-8')
    print(f'{out}: {len(page) // 1024} КБ, модулей {len(order)}: {", ".join(order)}')

main()
