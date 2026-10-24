const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const output = path.resolve('qa');
async function main() {
 const browser = await chromium.launch({
   ...(process.env.CHROME_PATH ? {executablePath: process.env.CHROME_PATH} : {}),
   headless:true, args:['--enable-webgl','--ignore-gpu-blocklist'],
 });
 try {
 const page = await browser.newPage({viewport:{width:1280,height:900}});
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error') errors.push(m.text());});
 const response = await page.goto((process.env.APP_URL || 'http://127.0.0.1:5173/') + '?debug');
 assert.equal(response.status(),200);
 await page.waitForFunction(()=>!!window.chromelt);
 fs.mkdirSync(output,{recursive:true});
 const canvas = page.locator('canvas');
 const advance = async seconds => {
   for(let t=0;t<seconds-0.001;t+=0.1) await page.evaluate(s=>window.chromelt.advance(s),Math.min(0.1,seconds-t));
 };
 const capture = async name => {
   const buffer = await canvas.screenshot({path:path.join(output,`${name}.png`)});
   const dimensions = await sharp(buffer).metadata();
   // Exclude the overlaid toolbar/prompt from material coverage measurements.
   const {data, info} = await sharp(buffer).extract({left:0,top:90,width:dimensions.width,height:dimensions.height-180}).removeAlpha().raw().toBuffer({resolveWithObject:true});
   let dark=0,sum=0,sumSq=0,maxSum=0; const count=info.width*info.height;
   for(let i=0;i<data.length;i+=3) {
     if(Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])<25)dark++;
     sum+=data[i];sumSq+=data[i]*data[i];maxSum+=Math.max(data[i],data[i+1],data[i+2]);
   }
   const result = {coverage:await page.evaluate(()=>window.chromelt.measureDensity()), colorfulFraction:1-dark/count,meanPeak:maxSum/count,redStd:Math.sqrt(sumSq/count-(sum/count)**2)};
   console.log(name,result);
   return {data,result};
 };
 const report={};
 await page.evaluate(()=>window.chromelt.reset('SAM'));
 report.initial=(await capture('initial')).result;
 assert(report.initial.coverage>0.08 && report.initial.coverage<0.3);
 assert(report.initial.colorfulFraction<0.001, 'The initial letter presentation must be white');
 await advance(1.6); await capture('early');
 await advance(1.65); report.midpoint=(await capture('midpoint')).result;
 assert(report.midpoint.coverage>report.initial.coverage && report.midpoint.coverage<0.9);
 await advance(3.25); report.completed=(await capture('completed')).result;
 assert(report.completed.coverage>0.995);
 assert(report.completed.redStd>25);
 // Run a matched control and drag from identical simulation states.
 await advance(1.5); const control=await capture('interaction-control');
 await page.evaluate(()=>window.chromelt.reset('SAM')); await advance(6.5);
 const box=await canvas.boundingBox();
 await page.mouse.move(box.x+box.width*0.3,box.y+box.height*0.6);
 await page.mouse.down();
 for(let i=0;i<30;i++) {
   await page.mouse.move(box.x+box.width*(0.3+i*0.015),box.y+box.height*(0.6-0.22*Math.sin(i/29*Math.PI)));
   await advance(0.05);
 }
 await page.mouse.up();
 const dragged=await capture('dragged');
 let difference=0;
 for(let i=0;i<control.data.length;i++)difference+=Math.abs(control.data[i]-dragged.data[i]);
 report.dragDifference=difference/control.data.length;
 assert(report.dragDifference>1, 'Dragging must change the evolved color field');
 // Real wall-clock persistence test, including live RAF timing.
 await page.mouse.move(1,1);
 await page.evaluate(()=>{
   window.frameDurations=[];let last=performance.now();
   const sample=now=>{window.frameDurations.push(now-last);last=now;if(window.frameDurations.length<2500)requestAnimationFrame(sample);};
   requestAnimationFrame(sample);window.chromelt.resume();
 });
 await page.waitForTimeout(30500);
 await page.evaluate(()=>window.chromelt.pause());
 report.persistence=(await capture('persistence-30s')).result;
 assert(report.persistence.coverage>0.995);
 assert(report.persistence.redStd>report.completed.redStd*0.65,'Color regions must not collapse into uniform color');
 assert(report.persistence.meanPeak>report.completed.meanPeak*0.9,'Persistent colors must retain brightness');
 report.performance=await page.evaluate(()=>{
   const times=window.frameDurations.slice(10).sort((a,b)=>a-b);
   const gl=document.querySelector('canvas').getContext('webgl2');
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {medianFrameMs:times[Math.floor(times.length/2)],p95FrameMs:times[Math.floor(times.length*0.95)],
     renderer:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'unavailable',state:window.chromelt.state};
 });
 // Exercise real input events and the actual restart button.
 await page.locator('#keyboardInput').fill('LIQUID');
 report.newInput=(await capture('new-input')).result;
 assert.equal(await page.evaluate(()=>window.chromelt.state.progress),0);
 await advance(7.4);report.newCompleted=(await capture('new-completed')).result;
 assert(report.newCompleted.coverage>0.995);
 await page.locator('#meltButton').click();
 assert.equal(await page.evaluate(()=>window.chromelt.state.progress),0);
 await page.locator('#keyboardInput').fill('');await advance(8);
 report.empty=(await capture('empty')).result;assert(report.empty.coverage<0.001);
 // Narrow portrait and short text are deliberately difficult coverage cases.
 await page.setViewportSize({width:390,height:844});
 await page.waitForTimeout(100);
 await page.evaluate(()=>window.chromelt.reset('I'));
 await capture('mobile-initial');await advance(6.5);
 report.mobileSingle=(await capture('mobile-single')).result;
 assert(report.mobileSingle.coverage>0.995);
 await page.evaluate(()=>window.chromelt.reset('CHROMELT'));
 await capture('mobile-word');await advance(6.5);
 report.mobileWord=(await capture('mobile-word-completed')).result;
 assert(report.mobileWord.coverage>0.995);
 // A resize must preserve elapsed time and colorful density.
 const before=await page.evaluate(()=>window.chromelt.state.elapsed);
 await page.setViewportSize({width:1440,height:900});await page.waitForTimeout(100);
 assert.equal(await page.evaluate(()=>window.chromelt.state.elapsed),before);
 report.resize=(await capture('resized')).result;assert(report.resize.coverage>0.995);
 // Hover remains a physical input without a button, with less force than dragging.
 await page.setViewportSize({width:1280,height:900});await page.waitForTimeout(100);
 await page.evaluate(()=>window.chromelt.reset('SAM'));await advance(6.5);
 const hoverBox=await canvas.boundingBox();
 await page.mouse.move(hoverBox.x+hoverBox.width*0.3,hoverBox.y+hoverBox.height*0.6);
 for(let i=0;i<30;i++) {
   await page.mouse.move(hoverBox.x+hoverBox.width*(0.3+i*0.015),hoverBox.y+hoverBox.height*(0.6-0.22*Math.sin(i/29*Math.PI)));
   await advance(0.05);
 }
 const hovered=await capture('hovered');
 let hoverDifference=0;
 for(let i=0;i<control.data.length;i++)hoverDifference+=Math.abs(control.data[i]-hovered.data[i]);
 report.hoverDifference=hoverDifference/control.data.length;
 assert(report.hoverDifference>0.3);
 assert(report.dragDifference>report.hoverDifference);
 for(const word of ['.', 'ABCDEFGHIJKL']) {
   await page.evaluate(text=>window.chromelt.reset(text),word);await advance(6.5);
   const result=(await capture(word==='.'?'punctuation':'maximum-length')).result;
   assert(result.coverage>0.995);report[word]=result;
 }
 assert.deepEqual(errors,[]);
 report.errors=errors;
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
 console.log('PASS',JSON.stringify(report));
 } finally { await browser.close(); }
}
main().catch(e=>{console.error(e);process.exitCode=1;});
