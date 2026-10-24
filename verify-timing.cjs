const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.APP_URL || 'http://127.0.0.1:5173/') + '?debug');await page.waitForFunction(()=>window.chromelt);
 for(const duration of [5,7]) {
   await page.evaluate(d=>{window.chromelt.settings.duration=d;window.chromelt.reset('SAM');},duration);
   for(let t=0;t<duration*10;t++)await page.evaluate(()=>window.chromelt.advance(.1));
   const hideUI=await page.addStyleTag({content:'main > :not(#canvas-container) { visibility: hidden !important; }'});
   const buffer=await page.locator('canvas').screenshot({path:`qa/duration-${duration}s.png`});
   await hideUI.evaluate(el=>el.remove());
   const density=await page.evaluate(()=>chromelt.measureDensity());assert(density>.995);
   const dimensions=await sharp(buffer).metadata();
   const {data,info}=await sharp(buffer).extract({left:0,top:90,width:dimensions.width,height:dimensions.height-180}).removeAlpha().raw().toBuffer({resolveWithObject:true});
   let dark=0;for(let i=0;i<data.length;i+=3)if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<25)dark++;
   const coverage=1-dark/(info.width*info.height);
   assert(coverage>.995);console.log({duration,coverage,state:await page.evaluate(()=>window.chromelt.state)});
 }
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
