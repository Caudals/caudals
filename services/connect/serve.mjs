import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('./dist/', import.meta.url));
const types = { '.html':'text/html', '.css':'text/css', '.js':'application/javascript', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.woff':'font/woff', '.vcf':'text/vcard', '.webmanifest':'application/manifest+json' };
http.createServer(async (request,response) => {
  try {
    const url=new URL(request.url,'http://localhost');
    const aliases={'/':'/es/','/mario':'/es/mario','/alonso':'/es/alonso'};
    if(aliases[url.pathname]) { response.writeHead(302,{Location:aliases[url.pathname]}); response.end(); return; }
    let file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root)) {response.writeHead(403);response.end();return;}
    if((await stat(file)).isDirectory())file=path.join(file,'index.html');
    const bytes=await readFile(file);
    response.writeHead(200,{'Content-Type':(types[path.extname(file)]||'text/plain')+'; charset=utf-8','Cache-Control':'no-cache'});
    response.end(bytes);
  } catch {response.writeHead(404);response.end('Not found');}
}).listen(4179,'127.0.0.1',()=>console.log('Connect preview: http://127.0.0.1:4179'));
