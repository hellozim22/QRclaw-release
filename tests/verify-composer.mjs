import { chromium } from 'playwright';
const browser=await chromium.launchPersistentContext('/Users/zeze/.openclaw/workspace/output/qrclaw-demo-chrome-profile',{headless:false,channel:'chrome',viewport:{width:1440,height:950}});
const page=browser.pages()[0]??await browser.newPage();
await page.goto('http://localhost:3000/chat');
await page.waitForTimeout(3000);
const info=await page.evaluate(()=>{
 const ta=document.querySelector('textarea, [contenteditable="true"]');
 if(!ta) return {found:false, body:document.body.innerText};
 const r=ta.getBoundingClientRect();
 return {found:true, rect:{x:r.x,y:r.y,w:r.width,h:r.height}, visible:r.width>0&&r.height>0&&r.y<innerHeight, innerHeight, text:document.body.innerText};
});
console.log(JSON.stringify(info,null,2));
await browser.close();
