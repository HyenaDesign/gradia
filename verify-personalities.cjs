const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:900}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.APP_URL || 'http://127.0.0.1:5173/') + '?debug');await page.waitForFunction(()=>window.chromelt);
 console.log('Codecs',await page.evaluate(()=>['video/mp4;codecs=avc1.42001E','video/mp4','video/webm;codecs=vp9','video/webm;codecs=vp8'].map(type=>({type,supported:MediaRecorder.isTypeSupported(type)}))));
 const report=[], fingerprints=new Set();
 for(const id of ['ink','silk','smoke','lava','chrome']){
  await page.locator(`[data-personality="${id}"]`).click();await page.evaluate(()=>chromelt.reset('Ocean'));
  for(let i=0;i<65;i++){await page.evaluate(()=>chromelt.advance(.1));if(i===31)await page.screenshot({path:`qa/${id}-melting.png`});}
  await page.screenshot({path:`qa/${id}-complete.png`});
  const density=await page.evaluate(()=>chromelt.measureDensity());assert(density>.995);
  const state=await page.evaluate(()=>chromelt.state);assert.equal(state.personality,id);assert.equal(state.palette.id,'ocean');
  fingerprints.add(await page.evaluate(()=>chromelt.fingerprint()));
  report.push({id,density});
 }
 assert.equal(fingerprints.size,5);assert.deepEqual(errors,[]);
 await page.reload();await page.waitForFunction(()=>window.chromelt);assert.equal(await page.evaluate(()=>chromelt.state.personality),'chrome');
 console.log(JSON.stringify({report,errors}));fs.writeFileSync('qa/personalities-report.json',JSON.stringify({report,errors},null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
