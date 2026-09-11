from pathlib import Path
import json, math, argparse
from PIL import Image, ImageDraw, ImageFont
from fontTools.ttLib import TTFont
p=argparse.ArgumentParser();p.add_argument('font');p.add_argument('image');p.add_argument('metrics');a=p.parse_args()
characters=set(range(32,127))|set(range(160,688))|set(range(880,1280))|{0x2013,0x2014,0x2026}
characters &= set(TTFont(a.font).getBestCmap())
width=1024;x=y=2;row=0;entries=[];fonts={}
for size in [10,12,13,14,18,20,24]:
 font=ImageFont.truetype(a.font,size);ascent,descent=font.getmetrics();glyphs={}
 for code in sorted(characters):
  char=chr(code);bx,by,right,bottom=font.getbbox(char,anchor='ls');w=max(1,right-bx);h=max(1,bottom-by)
  if x+w+2>width:x=2;y+=row+2;row=0
  glyph=Image.new('RGBA',(w,h));ImageDraw.Draw(glyph).text((-bx,-by),char,font=font,fill='white',anchor='ls')
  if size<14:glyph.putalpha(glyph.getchannel('A').point(lambda v:255 if v>=128 else 0))
  entries.append((glyph,x,y));glyphs[char]=[x,y,w,h,round(font.getlength(char)),bx,ascent+by]
  x+=w+2;row=max(row,h)
 fonts[str(size)]={'height':ascent+descent,'glyphs':glyphs}
height=2**math.ceil(math.log2(y+row+2));atlas=Image.new('RGBA',(width,height))
for glyph,x,y in entries:atlas.paste(glyph,(x,y))
Path(a.image).parent.mkdir(parents=True,exist_ok=True);atlas.save(a.image,optimize=True)
Path(a.metrics).write_text(json.dumps({'width':width,'height':height,'fonts':fonts},ensure_ascii=False,separators=(',',':'))+'\n')
print(f'{len(entries)} glyphs, {width}x{height}, {Path(a.image).stat().st_size} bytes')
