import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve('dist');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(dir,x.name)):[path.join(dir,x.name)]);}
const pages=walk(root).filter(x=>x.endsWith('.html'));
const failures=[];let links=0,images=0,graphs=0;
for(const f of pages){
 const h=fs.readFileSync(f,'utf8');const page=f.slice(root.length);
 try{
  assert.equal((h.match(/<h1(?:\s|>)/g)||[]).length,1,'one H1');
  assert.match(h,/<html lang="ar-SA" dir="rtl">/,'Arabic RTL');
  assert.match(h,/<meta name="description" content="[^\"]{25,}"/,'description');
  assert.match(h.split('</head>')[0],/<meta name="google-site-verification" content="a5AfDDI67VsUYxqSvx00gPy5bqSb1V9YoZ1DX8-GkxY">/,'Google ownership tag in head');
  const canonical=h.match(/rel="canonical" href="([^\"]+)"/)[1];assert.equal(new URL(canonical).origin,'https://wahba-carpenter-riyadh.vercel.app');
  const raw=h.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1];const data=JSON.parse(raw);graphs++;
  assert.equal(data['@context'],'https://schema.org');assert(data['@graph'].every(x=>x['@type']));
  const organization=data['@graph'].find(x=>x['@type']==='Organization');assert.equal(organization.name,'وهبة النجار');assert.equal(organization.telephone,'+966595080326');
  assert(!raw.includes('AggregateRating'),'no self-serving rating markup');assert(!raw.includes('streetAddress'),'no invented street address');assert(!raw.includes('hoursAvailable'),'no unconfirmed hours');assert(!raw.includes('sameAs'),'no unconfirmed profile association');const visibleText=h.replace(/<[^>]+>/g,'');assert(!h.includes('0556043982')&&!h.includes('966556043982')&&!visibleText.includes('4.9')&&!h.includes('26 مراجعة'),'independent business data');
  assert(!raw.includes('LocalBusiness'),'do not request address-dependent rich results without a physical address');
  for(const m of h.matchAll(/(?:href|src)="(\/[^\"]*)"/g)){
   const target=m[1].split('#')[0].split('?')[0];links++;
   const expected=target==='/'?path.join(root,'index.html'):path.join(root,target);
   assert(fs.existsSync(expected)||fs.existsSync(expected+'.html'),`missing local resource: ${target}`);
  }
  for(const m of h.matchAll(/<img\b[^>]*>/g)){images++;assert.match(m[0],/\balt="[^\"]*"/,'image alt');assert.match(m[0],/\bwidth="\d+"/,'image width');assert.match(m[0],/\bheight="\d+"/,'image height');}
  for(const m of h.matchAll(/href="([^"]*#[^"]*)"/g)){
   if(!m[1].startsWith('/')&&!m[1].startsWith('#'))continue;
   const [r,hash]=m[1].split('#');const file=!r?f:r==='/'?path.join(root,'index.html'):path.join(root,r+'.html');
   assert(fs.readFileSync(file,'utf8').includes(`id="${hash}"`),`missing anchor: ${m[1]}`);
  }
  if(page==='/contact.html')assert(h.includes('Riyadh+Saudi+Arabia'),'service area map');
 }catch(e){failures.push(`${page}: ${e.message}`);}
}
const sitemap=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');assert.equal((sitemap.match(/<loc>/g)||[]).length,pages.length-1);
assert(fs.readFileSync(path.join(root,'404.html'),'utf8').includes('noindex, follow'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'site.webmanifest'),'utf8'));assert.equal(manifest.lang,'ar-SA');
if(failures.length){console.error(failures.join('\n'));process.exit(1);}
console.log(`PASS: ${pages.length} pages, ${graphs} JSON-LD graphs, ${links} local links/resources, ${images} images; sitemap + map + contact data consistent.`);
