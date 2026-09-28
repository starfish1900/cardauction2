"""Lays stills out on a contact sheet: python3 scripts/sheet.py out.png a.png b.png ... [--cols 2]"""
import sys
from PIL import Image, ImageDraw, ImageFont

args = sys.argv[1:]
cols = 2
if '--cols' in args:
    i = args.index('--cols')
    cols = int(args[i + 1])
    del args[i : i + 2]
out, files = args[0], args[1:]
images = [Image.open(f).convert('RGB') for f in files]
w, h = images[0].size
rows = (len(images) + cols - 1) // cols
label = 28
sheet = Image.new('RGB', (cols * w + (cols + 1) * 8, rows * (h + label) + (rows + 1) * 8), (40, 40, 40))
draw = ImageDraw.Draw(sheet)
try:
    font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 20)
except OSError:
    font = ImageFont.load_default()
for k, (f, im) in enumerate(zip(files, images)):
    r, c = divmod(k, cols)
    x = 8 + c * (w + 8)
    y = 8 + r * (h + label + 8)
    draw.text((x + 4, y + 2), f.rsplit('/', 1)[-1], fill=(230, 230, 230), font=font)
    sheet.paste(im, (x, y + label))
sheet.save(out)
print(out, sheet.size)
