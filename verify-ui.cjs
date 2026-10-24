const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp=require(process.env.SHARP_MODULE || 'sharp');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH,headless:true});
 try {
 const page=await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto((process.env.APP_URL || 'http://127.0.0.1:5173/') + '?debug');await page.waitForFunction(()=>window.chromelt);
 await page.evaluate(()=>window.chromelt.pause());
 assert.equal(await page.locator('input:visible').count(),0);
 await page.screenshot({path:'qa/ui-empty.png'});
 await page.keyboard.type('SAM');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'SAM');
 await page.screenshot({path:'qa/ui-white.png'});
 const inspect = async () => {
   const hideUI = await page.addStyleTag({content:'main > :not(#canvas-container) { visibility: hidden !important; }'});
   const buffer = await page.locator('canvas').screenshot();
   await hideUI.evaluate(el=>el.remove());
   const dimensions = await sharp(buffer).metadata();
   const {data,info}=await sharp(buffer).extract({left:0,top:90,width:dimensions.width,height:dimensions.height-180}).removeAlpha().raw().toBuffer({resolveWithObject:true});
   let colored=0,shadow=0;
   for(let i=0;i<data.length;i+=3){const hi=Math.max(data[i],data[i+1],data[i+2]),lo=Math.min(data[i],data[i+1],data[i+2]);if(hi-lo>25)colored++;if(hi<253)shadow++;}
   return {colored:colored/(info.width*info.height),shadow:shadow/(info.width*info.height)};
 };
 const white=await inspect();assert(white.colored<.001);assert(white.shadow>.001);console.log('white',white);
 const advance=async seconds=>{for(let t=0;t<seconds-.001;t+=.1)await page.evaluate(s=>window.chromelt.advance(s),Math.min(.1,seconds-t));};
 await advance(1.3);await page.screenshot({path:'qa/ui-color-emerging.png'});
 const emerging=await inspect();assert(emerging.colored>.02);console.log('emerging',emerging);
 await advance(2.75);await page.screenshot({path:'qa/ui-midpoint.png'});
 await advance(3.3);await page.screenshot({path:'qa/ui-completed.png'});
 const completed=await inspect();assert(completed.colored>.99);console.log('completed',completed);
 await page.keyboard.type('NEW');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'NEW');
 await page.keyboard.press('Backspace');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'NE');
 await page.keyboard.press('Control+a');await page.keyboard.type('LIQUID');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'LIQUID');
 await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'');
 await page.locator('#typePrompt').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboardInput');
 await page.keyboard.type('abcdefghijklmnop');assert.equal(await page.evaluate(()=>window.chromelt.state.text),'abcdefghijkl');
 await page.keyboard.press('Enter');await advance(1);assert((await page.evaluate(()=>window.chromelt.state.progress))>0);
 await page.locator('#meltButton').click();assert.equal(await page.evaluate(()=>window.chromelt.state.progress),0);
 await page.keyboard.press('Escape');
 await page.setViewportSize({width:390,height:844});await page.waitForTimeout(100);
 await page.locator('#typePrompt').click();await page.keyboard.type('SAM');
 await page.screenshot({path:'qa/ui-mobile-white.png'});
 assert.equal(await page.evaluate(()=>document.activeElement.id),'keyboardInput');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth),false);
 await advance(7.4);await page.screenshot({path:'qa/ui-mobile-completed.png'});
 assert((await inspect()).colored>.99);
 assert.deepEqual(errors,[]);console.log('PASS: direct typing, white shadow, color reveal, editing, replay, empty reset, character limit, mobile focus/layout, completed coverage.');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
