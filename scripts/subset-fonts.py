import os, hashlib, json, glob

CACHE_FILE = 'public/fonts/.subset_cache'
SRC_DIR = 'node_modules/@fontsource/lxgw-wenkai/files'
DST_DIR = 'public/fonts'

def get_sources_hash():
    text = ''
    for root in ['src', 'public']:
        for dirpath, dirnames, filenames in os.walk(root):
            for f in filenames:
                if f.endswith(('.jsx', '.md', '.css', '.html')):
                    with open(os.path.join(dirpath, f), 'rb') as fp:
                        text += str(hashlib.md5(fp.read()).hexdigest())
    for f in glob.glob('*.html'):
        with open(f, 'rb') as fp:
            text += str(hashlib.md5(fp.read()).hexdigest())
    return hashlib.md5(text.encode()).hexdigest()

current_hash = get_sources_hash()
if os.path.exists(CACHE_FILE):
    with open(CACHE_FILE) as f:
        if f.read().strip() == current_hash:
            print("Content unchanged, skipping font subsetting", flush=True)
            exit(0)

chars = set()
for root, dirs, files in os.walk('src'):
    for f in files:
        if f.endswith(('.jsx', '.md', '.css', '.html')):
            with open(os.path.join(root, f), 'r', encoding='utf-8', errors='ignore') as fp:
                chars.update(fp.read())
for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
        chars.update(fp.read())

text = ''.join(c for c in sorted(chars) if c.strip())
print(f"Found {len(text)} unique characters", flush=True)

for weight in ['300', '500', '700']:
    src = os.path.join(SRC_DIR, f'lxgw-wenkai-latin-{weight}-normal.woff2')
    dst = os.path.join(DST_DIR, f'lxgw-wenkai-latin-{weight}-normal.woff2')
    if not os.path.exists(src):
        print(f"Warning: {src} not found, skipping", flush=True)
        continue
    print(f"Processing weight {weight}...", flush=True)
    with open(src, 'rb') as f:
        raw = f.read()

    from fontTools.ttLib import TTFont
    from fontTools.subset import Subsetter, Options

    font = TTFont(ttBytes=raw)
    opts = Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']
    opts.notdef_outline = True
    opts.recalc_bounds = True

    subsetter = Subsetter(options=opts)
    subsetter.populate(text=text)
    subsetter.subset(font)
    font.save(dst)
    font.close()
    sz = os.path.getsize(dst)
    print(f"  weight {weight}: {sz/1024:.1f} KB", flush=True)

with open(CACHE_FILE, 'w') as f:
    f.write(current_hash)
print("Done!", flush=True)
