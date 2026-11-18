/* Optional Playwright transport for executor sandboxes which forbid listening sockets.
 * Serves the unchanged repository files through route.fulfill. DOM, scripts, workers,
 * IndexedDB, rendering and input run in real Chromium. No application APIs are mocked.
 * Use node -r ./MVP/tests/browser/local-file-transport.cjs TEST.cjs.
 * This does not constitute an HTTP-server or production-network acceptance test.
 */
const fs=require('fs'),path=require('path');
const modulePath=process.env.PLAYWRIGHT_MODULE||'playwright';const pw=require(modulePath),launch=pw.chromium.launch.bind(pw.chromium);
const roots={'http://127.0.0.1:8770':process.cwd(),'http://127.0.0.1:8769':path.resolve(process.cwd(),'../main-en-routes-grab')};
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript','.json':'application/json','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.xml':'application/xml','.musicxml':'application/xml','.mxl':'application/vnd.recordare.musicxml','.woff2':'font/woff2','.mp3':'audio/mpeg','.wav':'audio/wav'};
async function serve(route,options){const u=new URL(route.request().url()),root=roots[u.origin];if(!root)return route.continue(options);const part=decodeURIComponent(u.pathname),file=path.resolve(root,'.'+part);if(file!==root&&!file.startsWith(root+path.sep))return route.fulfill({status:403,body:'Forbidden'});let target=file;try{if(fs.statSync(target).isDirectory()){if(!u.pathname.endsWith('/'))return route.fulfill({status:301,headers:{location:u.pathname+'/'+u.search+u.hash},body:''});target=path.join(target,'index.html');}return route.fulfill({status:200,contentType:mime[path.extname(target)]||'application/octet-stream',body:fs.readFileSync(target)});}catch(e){if(e.code==='ENOENT')return route.fulfill({status:404,body:'Not found'});throw e;}}
function wrap(page){const original=page.route.bind(page);page.route=(url,handler,options)=>original(url,(route,request)=>handler(new Proxy(route,{get(r,key){if(key==='continue')return opts=>serve(r,opts);const value=r[key];return typeof value==='function'?value.bind(r):value;}}),request),options);return page;}
pw.chromium.launch=async options=>{const browser=await launch(options),newPage=browser.newPage.bind(browser);browser.newPage=async opts=>wrap(await newPage(opts));return browser;};
