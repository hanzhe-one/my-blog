import os, sys, glob
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

chars = set()

# Only scan specific directories, skip node_modules
for root in ['src', 'public']:
    for dirpath, dirnames, filenames in os.walk(root):
        for f in filenames:
            if f.endswith(('.jsx', '.md', '.css', '.html')):
                with open(os.path.join(dirpath, f), 'r', encoding='utf-8', errors='ignore') as fp:
                    chars.update(fp.read())

# Also check index.html
for f in glob.glob('*.html'):
    with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
        chars.update(fp.read())

text = ''.join(c for c in sorted(chars) if c.strip())
print(f"Found {len(text)} unique characters", flush=True)

src_dir = 'node_modules/@fontsource/lxgw-wenkai/files'
dst_dir = 'public/fonts'

for weight in ['300', '500', '700']:
    src = os.path.join(src_dir, f'lxgw-wenkai-latin-{weight}-normal.woff2')
    dst = os.path.join(dst_dir, f'lxgw-wenkai-latin-{weight}-normal.woff2')

    if not os.path.exists(src):
        print(f"Warning: {src} not found, skipping", flush=True)
        continue

    print(f"Processing weight {weight}...", flush=True)
    font = TTFont(src)

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

print("Done!", flush=True)
