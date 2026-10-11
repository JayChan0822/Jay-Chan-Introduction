"""Sync the continuous home experience from the standalone HTML pages."""
from pathlib import Path
import re
root=Path(__file__).resolve().parent.parent
p=root/'index.html'; home=p.read_text()
hero=re.search(r'<section class="hero"[^>]*>.*?</section>',home,re.S).group()
attrs=re.search(r'<body[^>]*>',home).group()
meta=' '.join(re.findall(r'data-(?:title|description)-(?:zh|en)="[^"]*"',attrs))
# Home metadata comes from the existing cover, since body metadata is static.
hero=re.sub(r'<section[^>]*>', '<section class="hero" data-scroll-page="home" '+meta+'>', hero, count=1)
parts=[hero]
for slug,id in [('about','about'),('music','portfolio'),('scoring','visual'),('notation','notation'),('projects','work')]:
    text=(root/(slug+'.html')).read_text()
    section=re.search(r'<section id="'+id+r'">.*?</section>',text,re.S).group()
    section=re.sub(r'\n<div class="page-intro">.*?</div>','',section,count=1)
    section=section.replace('<h1','<h2').replace('</h1>','</h2>')
    metadata=' '.join(re.findall(r'data-(?:title|description)-(?:zh|en)="[^"]*"',re.search(r'<body[^>]*>',text).group()))
    section=section.replace('<section id="'+id+'">','<section id="'+id+'" data-scroll-page="'+slug+'" '+metadata+'>')
    parts.append(section)
contact=re.search(r'<section id="contact">.*?</section>',home,re.S).group()
home=re.sub(r'<main id="main-content">.*?</main>','<main id="main-content" class="scroll-flow">\n'+'\n\n'.join(parts)+'\n\n'+contact+'\n</main>',home,flags=re.S)
if 'src="scroll-pages.js"' not in home:
    home=home.replace('<script type="module" src="site.js"></script>','<script type="module" src="site.js"></script>\n<script type="module" src="scroll-pages.js"></script>')
p.write_text(home)
