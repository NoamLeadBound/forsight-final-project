"""Build every page twice from src/:
  - the local copy in the project folders, with contact details from private.json (not in git)
  - the site copy at the repo root for GitHub Pages: no contact details, flat English file names

In the sources:
  <!--NAV-->            the top-bar links, generated per page
  href="@key#frag"      a link to another page, resolved per copy (key = a PAGES key)
  <span data-private="name"></span>   a contact detail, filled only in the local copy

Usage: python3 build.py            (all pages)
       python3 build.py tasks      (one page by key)
Then: git add -A && git commit -m "..." && git push   (the site updates within a minute or two)
"""
import json
import os
import re
import sys
import urllib.parse
from pathlib import Path

HERE = Path(__file__).parent
SRC = HERE / 'src'
PROJECT = HERE.parent
PREP = PROJECT / '01 הכנה לאפיון'
MEET = PROJECT / '02 פגישות וסיכומים'
OUT = PROJECT / '04 תוצרים - מצגות ודוחות'

# key: (source, local output, site file, uses the shared CSS/JS)
PAGES = {
    'timeline': ('timeline.src.html', PROJECT / 'טיימליין ותוכנית הכנה.html', 'index.html', True),
    'tasks': ('tasks.src.html', PROJECT / 'משימות.html', 'tasks.html', True),
    'meetings': ('meetings.src.html', MEET / 'סיכומי פגישות.html', 'meetings.html', True),
    'notes': ('notes.src.html', PROJECT / 'כתיבה והערות.html', 'notes.html', True),
    'company': ('company.src.html', PREP / 'הכרת החברה - ForSight Robotics.html', 'company.html', True),
    'workpack': ('workpack.src.html', PREP / 'תיק עבודה - יום האפיון.html', 'workpack.html', True),
    'presentations': ('presentations.src.html', OUT / 'מצגות.html', 'presentations.html', True),
    'deck': ('deck.src.html', OUT / 'מצגת פתיחה - יום האפיון.html', 'deck-opening.html', True),
    'course': ('course.src.html', PREP / 'קורס הכנה - ניהול מלאי ו-Lean.html', 'course.html', False),
    'glossary': ('glossary.src.html', PROJECT / 'מושגים.html', 'glossary.html', True),
}
NAV = [('timeline', 'טיימליין'), ('tasks', 'משימות'), ('meetings', 'פגישות'), ('notes', 'כתיבה'),
       ('company', 'מחקר החברה'), ('workpack', 'יום האפיון'), ('presentations', 'מצגות'),
       ('course', 'קורס הכנה'), ('glossary', 'מושגים')]
NAV_HOME = {'deck': 'presentations'}  # pages that sit under another tab

PRIVATE_SPAN = re.compile(r'<span data-private="([a-z_]+)"></span>')
PAGE_LINK = re.compile(r'href="@([a-z]+)(#[^"]*)?"')
# Anything that looks like a phone number or an email must never reach the public site.
FORBIDDEN = [re.compile(p) for p in (r'0\d{1,2}-?\d{7}\b', r'\+972', r'[\w.+-]+@[\w-]+\.[a-z]{2,}')]

cfg = json.loads((HERE / 'config.json').read_text(encoding='utf-8'))
private_path = HERE / 'private.json'
private = json.loads(private_path.read_text(encoding='utf-8')) if private_path.exists() else {}
if not private:
    print('note: private.json missing, local copies will have no contact details')

css = (SRC / 'common.css').read_text(encoding='utf-8')
shared_js = '\n'.join((SRC / f).read_text(encoding='utf-8') for f in ('sync.js', 'items.js', 'common.js'))
shared_js = shared_js.replace('__SUPABASE_URL__', cfg.get('supabase_url') or '__SUPABASE_URL__')
shared_js = shared_js.replace('__SUPABASE_ANON_KEY__', cfg.get('supabase_anon_key') or '__SUPABASE_ANON_KEY__')
vendor = (SRC / 'vendor' / 'supabase.min.js').read_text(encoding='utf-8').replace('</script', '<\\/script')
# Inlined, the bundle cannot find its own URL and throws; it only needs one for lazy chunks, which it never loads.
PUBLIC_PATH_THROW = 'if(!e)throw new Error("Automatic publicPath is not supported in this browser");'
assert vendor.count(PUBLIC_PATH_THROW) == 1, 'supabase bundle changed: recheck the publicPath patch'
vendor = vendor.replace(PUBLIC_PATH_THROW, 'if(!e)e="./";')


def href(target, here, site):
    if site:
        return PAGES[target][2]
    rel = os.path.relpath(PAGES[target][1], PAGES[here][1].parent)
    return urllib.parse.quote(rel)


def nav(here, site):
    cur = NAV_HOME.get(here, here)
    out = []
    for key, label in NAV:
        if key == cur and key == here:
            out.append(f'<a class="current" href="#">{label}</a>')
        elif key == cur:
            out.append(f'<a class="current" href="{href(key, here, site)}">{label}</a>')
        else:
            out.append(f'<a href="{href(key, here, site)}">{label}</a>')
    return '\n    '.join(out)


def resolve(html, here, site):
    html = html.replace('<!--NAV-->', nav(here, site))

    def link(m):
        if m.group(1) not in PAGES:
            raise SystemExit(f'{here}: unknown page link @{m.group(1)}')
        return f'href="{href(m.group(1), here, site)}{m.group(2) or ""}"'
    return PAGE_LINK.sub(link, html)


def build(key):
    src, local_out, site_file, uses_common = PAGES[key]
    html = (SRC / src).read_text(encoding='utf-8')
    if uses_common:
        assert '/*COMMON_CSS*/' in html and '/*COMMON_JS*/' in html, f'{src}: missing placeholders'
        html = html.replace('/*COMMON_CSS*/', css).replace('/*COMMON_JS*/', shared_js)
    leftover = re.search(r'href="(?!https?:|mailto:|#|@)[^"]*\.html', html)
    if leftover:
        raise SystemExit(f'{src}: write page links as href="@key", found {leftover.group(0)}')

    site = resolve(PRIVATE_SPAN.sub('', html), key, True)
    for rx in FORBIDDEN:
        hit = rx.search(site)
        if hit:
            raise SystemExit(f'{src}: "{hit.group(0)}" would be published. Wrap it in a data-private span.')
    site = site.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">', 1)
    local = resolve(PRIVATE_SPAN.sub(lambda m: private.get(m.group(1), ''), html), key, False)
    if uses_common:  # the library goes in after the scan: its source mentions package@version strings
        tag = '<script>' + vendor + '</script>\n</head>'
        site, local = site.replace('</head>', tag, 1), local.replace('</head>', tag, 1)

    local_out.parent.mkdir(parents=True, exist_ok=True)
    local_out.write_text(local, encoding='utf-8')
    (HERE / site_file).write_text(site, encoding='utf-8')
    print(f'{key:13} local: {local_out.relative_to(PROJECT)}  ·  site: {site_file}')


for k in sys.argv[1:] or PAGES:
    build(k)
