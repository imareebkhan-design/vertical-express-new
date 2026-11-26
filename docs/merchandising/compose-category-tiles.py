"""Compose category tiles: python3 compose-category-tiles.py <folder of background-removed PNGs named <slug>.png>
Writes <folder>/out/<slug>.webp (600x600, transparent) and a contact sheet one level up."""
from PIL import Image, ImageFilter, ImageDraw
import glob, os, sys
os.chdir(sys.argv[1]); os.makedirs('out', exist_ok=True)
W,H=600,600; PAD=0.07
fs=sorted(glob.glob('*.png'))
sheet=Image.new('RGB',(5*330,((len(fs)+4)//5)*258),(255,255,255))
for i,f in enumerate(fs):
    im=Image.open(f).convert('RGBA')
    bb=im.split()[3].point(lambda v:255 if v>24 else 0).getbbox(); im=im.crop(bb)
    s=min(W*(1-2*PAD)/im.width, H*(1-2*PAD)/im.height); im=im.resize((round(im.width*s),round(im.height*s)),Image.LANCZOS)
    c=Image.new('RGBA',(W,H),(0,0,0,0)); x=(W-im.width)//2; y=(H-im.height)//2+8
    sh=Image.new('RGBA',(W,H),(0,0,0,0)); d=ImageDraw.Draw(sh); sw=im.width*0.86; sy=y+im.height-6
    d.ellipse([W/2-sw/2,sy-10,W/2+sw/2,sy+12],fill=(40,32,20,70)); sh=sh.filter(ImageFilter.GaussianBlur(12))
    c.alpha_composite(sh); c.alpha_composite(im,(x,y)); c.save(f'out/{f[:-4]}.webp','WEBP',quality=84,method=6)
    p=Image.new('RGBA',(W,H),(242,240,236,255)); p.alpha_composite(c); sheet.paste(p.convert('RGB').resize((240,240)),((i%5)*330,(i//5)*258))
    d2=ImageDraw.Draw(sheet); d2.text(((i%5)*330+6,(i//5)*258+242),f[:-4],fill=(0,0,0))
sheet.save('../sheet-cut.jpg',quality=82); print(len(fs))
