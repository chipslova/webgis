import urllib.request
import re

req = urllib.request.Request('https://webgis-three-iota.vercel.app/', headers={'User-Agent': 'Mozilla/5.0'})
html = urllib.request.urlopen(req).read().decode('utf-8')

print('Title in production HTML:')
for title in re.findall(r'<title>(.*?)</title>', html, re.IGNORECASE):
    print(' ', title)

scripts = re.findall(r'src=["\']([^"\']+)["\']', html)
print('Script tags in production HTML:', scripts)

for s in scripts:
    if not s.startswith('http'):
        s = 'https://webgis-three-iota.vercel.app/' + s.lstrip('/')
    try:
        r = urllib.request.urlopen(urllib.request.Request(s, headers={'User-Agent': 'Mozilla/5.0'}))
        content = r.read()
        print(f'{s} -> HTTP {r.getcode()} (Size: {len(content)} bytes)')
        # Check if the bundle contains the new GEE_LST_GRID_DATA
        if 'gee-lst-fill' in content.decode('utf-8', errors='ignore'):
            print('  -> FOUND gee-lst-fill inside bundle!')
        else:
            print('  -> WARNING: gee-lst-fill NOT found inside bundle!')
    except Exception as e:
        print(f'{s} -> Error: {e}')
