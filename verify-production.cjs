const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve('dist');
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
 if(!pathname.startsWith('/gradia/')){res.writeHead(404).end();return;}
 const file=path.resolve(root,pathname.slice('/gradia/'.length)||'index.html');
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.readFile(file,(err,bytes)=>{if(err){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(bytes);});
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const url=`http://127.0.0.1:${server.address().port}/gradia/`;
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||undefined,headless:true,args:process.env.CI?['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[],failures=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)failures.push(r.url());});
 await page.goto(url+'?debug');await page.waitForFunction(()=>window.chromelt);await page.evaluate(()=>chromelt.pause());
 assert.match(await page.title(),/Gradia/);assert(await page.locator('.brand-logo').evaluate(img=>img.complete&&img.naturalWidth>0));
 assert(await page.locator('#startupStatus').isHidden());
 await page.keyboard.type('Ocean');assert.equal(await page.evaluate(()=>chromelt.state.palette.id),'ocean');
 for(const id of ['ink','silk','smoke','lava','chrome']){
   await page.locator(`[data-personality="${id}"]`).click();await page.evaluate(()=>chromelt.reset('Ocean'));await page.evaluate(()=>chromelt.advance(.15));assert.equal(await page.evaluate(()=>chromelt.state.personality),id);
 }
 await page.locator('[data-personality="ink"]').click();await page.evaluate(()=>chromelt.reset('Ocean'));
 for(let i=0;i<65;i++)await page.evaluate(()=>chromelt.advance(.1));
 assert((await page.evaluate(()=>chromelt.measureDensity()))>.995);
 await page.locator('#exportToggle').click();await page.locator('#exportSize').selectOption('custom');await page.locator('#exportWidth').fill('320');await page.locator('#exportHeight').fill('320');
 const saved=await page.evaluate(()=>chromelt.fingerprint()),download=page.waitForEvent('download');await page.locator('#exportStart').click();const file=await download;assert.match(file.suggestedFilename(),/^gradia-ink-320x320\.png$/);
 await page.waitForFunction(()=>!document.body.classList.contains('exporting'));assert.equal(await page.evaluate(()=>chromelt.fingerprint()),saved);
 await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:844});await page.evaluate(()=>chromelt.reset('SAM'));
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 fs.mkdirSync('qa',{recursive:true});await page.screenshot({path:'qa/production-mobile.png'});
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[]);
 const fallback=await browser.newPage();await fallback.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){return /webgl/.test(type)?null:original.call(this,type,...args);};});await fallback.goto(url);await fallback.locator('#startupStatus').waitFor({state:'visible'});assert(await fallback.getByRole('button',{name:'Reload canvas'}).isVisible());
 const normal=await browser.newPage();await normal.goto(url);await normal.waitForFunction(()=>document.querySelector('#canvas-container canvas'));assert.equal(await normal.evaluate(()=>typeof window.chromelt),'undefined');
 console.log('PASS: production subpath, bundled assets/logo, typing, materials, fluid coverage, PNG export, exact restoration, mobile layout, unsupported-GPU fallback, no normal-mode debug API.');
 }finally{await browser.close();}
 if(process.env.FULL_QA==='1')for(const script of ['verify-ui.cjs','verify-semantic.cjs','verify-personalities.cjs','verify-timing.cjs','verify.cjs','verify-exports.cjs','verify-export-edge.cjs']){
   console.log(`Running ${script} against the production build…`);
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[script],{env:{...process.env,APP_URL:url},stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`${script} failed (${code})`)));});
 }
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
