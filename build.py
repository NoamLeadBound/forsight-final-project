"""Build every page twice from src/:
  - the local copy in the project folders, with contact details from private.json (not in git)
  - the site copy at the repo root for GitHub Pages: no contact details, flat English file names

Usage: python3 build.py            (all pages)
       python3 build.py workpack   (one page by key)
Then: git add -A && git commit -m "..." && git push   (the site updates within a minute or two)
"""
import json
import re
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / 'src'
PROJECT = HERE.parent
PREP = PROJECT / '01 הכנה לאפיון'

# key: (source, local output, site file, uses the shared CSS/JS)
PAGES = {
    'hub': ('hub.src.html', PROJECT / 'ניהול הפרויקט.html', 'index.html', True),
    'timeline': ('timeline.src.html', PROJECT / 'טיימליין ותוכנית הכנה.html', 'timeline.html', True),
    'company': ('company.src.html', PREP / 'הכרת החברה - ForSight Robotics.html', 'company.html', True),
    'workpack': ('workpack.src.html', PREP / 'תיק עבודה - יום האפיון.html', 'workpack.html', True),
    'deck': ('deck.src.html', PREP / 'מצגת פתיחה - יום האפיון.html', 'deck.html', True),
    'course': ('course.src.html', PREP / 'קורס הכנה - ניהול מלאי ו-Lean.html', 'course.html', False),
}
SITE_NAME = {local.name: site for _, local, site, _ in PAGES.values()}

PRIVATE_SPAN = re.compile(r'<span data-private="([a-z_]+)"></span>')
LOCAL_LINK = re.compile(r'href="([^"#:?]+\.html)')
# Anything that looks like a phone number or an email must never reach the public site.
FORBIDDEN = [re.compile(p) for p in (r'0\d{1,2}-?\d{7}\b', r'\+972', r'[\w.+-]+@[\w-]+\.[a-z]{2,}')]

cfg = json.loads((HERE / 'config.json').read_text(encoding='utf-8'))
private_path = HERE / 'private.json'
private = json.loads(private_path.read_text(encoding='utf-8')) if private_path.exists() else {}
if not private:
    print('note: private.json missing, local copies will have no contact details')

css = (SRC / 'common.css').read_text(encoding='utf-8')
common_js = (SRC / 'common.js').read_text(encoding='utf-8')
sync_js = (SRC / 'sync.js').read_text(encoding='utf-8')
sync_js = sync_js.replace('__SUPABASE_URL__', cfg.get('supabase_url') or '__SUPABASE_URL__')
sync_js = sync_js.replace('__SUPABASE_ANON_KEY__', cfg.get('supabase_anon_key') or '__SUPABASE_ANON_KEY__')
vendor = (SRC / 'vendor' / 'supabase.min.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
# Inlined, the bundle cannot find its own URL and throws; it only needs one for lazy chunks, which it never loads.
PUBLIC_PATH_THROW = 'if(!e)throw new Error("Automatic publicPath is not supported in this browser");'
assert vendor.count(PUBLIC_PATH_THROW) == 1, 'supabase bundle changed: recheck the publicPath patch'
vendor = vendor.replace(PUBLIC_PATH_THROW, 'if(!e)e="./";')


def site_links(html):
    def repl(m):
        name = Path(urllib.parse.unquote(m.group(1))).name
        if name not in SITE_NAME:
            raise SystemExit(f'unknown page link: {m.group(1)}')
        return f'href="{SITE_NAME[name]}'
    return LOCAL_LINK.sub(repl, html)


def build(key):
    src, local_out, site_file, uses_common = PAGES[key]
    html = (SRC / src).read_text(encoding='utf-8')
    if uses_common:
        assert '/*COMMON_CSS*/' in html and '/*COMMON_JS*/' in html, f'{src}: missing placeholders'
        html = html.replace('/*COMMON_CSS*/', css).replace('/*COMMON_JS*/', sync_js + '\n' + common_js)

    site = site_links(PRIVATE_SPAN.sub('', html))
    for rx in FORBIDDEN:
        hit = rx.search(site)
        if hit:
            raise SystemExit(f'{src}: "{hit.group(0)}" would be published. Wrap it in a data-private span.')
    site = site.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">', 1)

    local = PRIVATE_SPAN.sub(lambda m: private.get(m.group(1), ''), html)
    if uses_common:  # the library goes in after the scan: its source mentions package@version strings
        tag = '<script>' + vendor + '</script>\n</head>'
        site, local = site.replace('</head>', tag, 1), local.replace('</head>', tag, 1)

    local_out.write_text(local, encoding='utf-8')
    (HERE / site_file).write_text(site, encoding='utf-8')
    print(f'{key:9} local: {local_out.relative_to(PROJECT)}  ·  site: {site_file}')


for k in sys.argv[1:] or PAGES:
    build(k)
