import { PhpNode } from 'php-wasm/PhpNode';
const php = new PhpNode();
let out = '';
php.addEventListener('output', e => { out += String(e.detail); });
await php.run('<?php @mkdir("/app/x",0777,true); file_put_contents("/app/x/a.txt","AAA"); echo "written\n"; exit;');
console.log('after exit out=', JSON.stringify(out));
try { const b = await php.readFile('/app/x/a.txt', {encoding:'utf8'}); console.log('read after exit:', b); } catch(e) { console.log('read failed', e.message); }
await php.refresh();
out='';
await php.run('<?php echo "alive=", 1+1, " file=", (is_file("/app/x/a.txt")?"yes":"no"), "\n";');
console.log('after refresh out=', JSON.stringify(out));
out='';
await php.run('<?php echo "second-run-ok\n"; exit;');
console.log('after second exit out=', JSON.stringify(out));
await php.refresh();
out='';
await php.run('<?php echo "third-run-alive\n";');
console.log('after second refresh out=', JSON.stringify(out));
