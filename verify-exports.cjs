const { chromium }=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const sharp=require(process.env.SHARP_MODULE||'sharp');
const fs=require('fs'),assert=require('node:assert/strict'),crypto=require('crypto');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900},acceptDownloads:true}),errors=[],report=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.APP_URL || 'http://127.0.0.1:5173/') + '?debug');await page.waitForFunction(()=>window.chromelt);
 await page.evaluate(()=>chromelt.reset('Ocean'));
 for(let i=0;i<20;i++)await page.evaluate(()=>chromelt.advance(.1));
 const fingerprint=()=>page.evaluate(()=>({hash:chromelt.fingerprint(),elapsed:chromelt.state.elapsed,text:chromelt.state.text}));
 const before=await fingerprint();await page.locator('#exportToggle').click();
 async function save(name){
  const pending=page.waitForEvent('download',{timeout:180000});await page.locator('#exportStart').click();
  const download=await pending;await download.saveAs(`qa/${name}`);
  await page.waitForFunction(()=>!document.body.classList.contains('exporting'));
  assert.deepEqual(await fingerprint(),before,'Export must preserve exact field and timeline');
  return fs.readFileSync(`qa/${name}`);
 }
 let file=await save('export-2k.png'), meta=await sharp(file).metadata();
 assert.equal(meta.width,2048);report.push({file:'2k',width:meta.width,height:meta.height});
 await page.locator('#exportSize').selectOption('3840');file=await save('export-4k.png');meta=await sharp(file).metadata();
 assert.equal(meta.width,3840);report.push({file:'4k',width:meta.width,height:meta.height});
 await page.locator('#exportSize').selectOption('custom');await page.locator('#exportWidth').fill('800');await page.locator('#exportHeight').fill('1000');await page.locator('#exportAlpha').check();
 file=await save('export-transparent.png');meta=await sharp(file).metadata();assert.equal(meta.width,800);assert.equal(meta.height,1000);
 const rgba=await sharp(file).raw().toBuffer();let clear=0,partial=0,solid=0;
 for(let i=3;i<rgba.length;i+=4){if(rgba[i]===0)clear++;else if(rgba[i]===255)solid++;else partial++;}
 assert(clear>10000&&solid>1000&&partial>1000);report.push({file:'transparent',clear,partial,solid});
 await page.screenshot({path:'qa/export-desktop.png'});
 await page.locator('#exportWidth').fill('9000');await page.locator('#exportStart').click();assert.match(await page.locator('#exportStatus').textContent(),/Choose whole/);
 for(const format of ['mp4','webm']){
  await page.locator('#exportFormat').selectOption(format);file=await save(`export-loop.${format}`);assert(file.length>10000);
  const route=new URL(`__qa_${format}`, process.env.APP_URL || 'http://127.0.0.1:5173/').href;
  await page.route(route,r=>r.fulfill({status:200,contentType:`video/${format}`,body:file}));
  const decoded=await page.evaluate(async url=>{
   const v=document.createElement('video');v.muted=true;v.preload='auto';v.src=URL.createObjectURL(await (await fetch(url)).blob());
   await new Promise((r,j)=>{v.onloadedmetadata=r;v.onerror=()=>j(new Error('decode error'));});
   const seek=async t=>{v.currentTime=t;await new Promise((r,j)=>{v.onseeked=r;v.onerror=j;});};
   if(!Number.isFinite(v.duration))await seek(1e10);
   const duration=v.duration,w=v.videoWidth,h=v.videoHeight;
   const c=document.createElement('canvas');c.width=160;c.height=Math.round(160*h/w);const ctx=c.getContext('2d');
   async function sample(t){await seek(t);ctx.drawImage(v,0,0,c.width,c.height);return [...ctx.getImageData(0,0,c.width,c.height).data];}
   const first=await sample(.001),middle=await sample(duration/2),last=await sample(Math.max(0,duration-.045));
   const diff=(a,b)=>a.reduce((n,v,i)=>n+Math.abs(v-b[i]),0)/a.length;
   URL.revokeObjectURL(v.src);return {duration,w,h,seamDifference:diff(first,last),motionDifference:diff(first,middle)};
  },route);
  assert(decoded.duration>5.5&&decoded.duration<7.5);assert.equal(decoded.w,1280);assert(decoded.seamDifference<4);assert(decoded.motionDifference>1);
  report.push({file:format,bytes:file.length,...decoded});console.log(format,decoded);
 }
 await page.locator('#exportFormat').selectOption('sequence');file=await save('export-sequence.zip');
 const entries=new Map();let offset=0;
 while(file.readUInt32LE(offset)===0x04034b50){const size=file.readUInt32LE(offset+18),len=file.readUInt16LE(offset+26),extra=file.readUInt16LE(offset+28);const name=file.subarray(offset+30,offset+30+len).toString();const start=offset+30+len+extra;entries.set(name,file.subarray(start,start+size));offset=start+size;}
 assert.equal(entries.size,181);assert.deepEqual(entries.get('frame-0000.png'),entries.get('frame-0179.png'),'Seam must have identical source frames');
 assert(!entries.get('frame-0000.png').equals(entries.get('frame-0090.png')));assert.match(entries.get('README.txt').toString(),/30 fps/);
 report.push({file:'sequence',bytes:file.length,entries:entries.size,identicalSeam:true});
 await page.locator('#exportStart').click();await page.waitForFunction(()=>document.querySelector('#exportProgress').value>.03);await page.locator('#exportCancel').click();
 await page.waitForFunction(()=>!document.body.classList.contains('exporting'));assert.match(await page.locator('#exportStatus').textContent(),/cancelled/);assert.deepEqual(await fingerprint(),before);
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'qa/export-mobile.png'});
 assert(await page.locator('#palettePanel').isHidden());
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log(JSON.stringify({report,errors},null,2));fs.writeFileSync('qa/exports-report.json',JSON.stringify({report,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
