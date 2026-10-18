function show(t){let d=document.getElementById('dbg');if(!d){d=document.createElement('pre');d.id='dbg';d.style.cssText='position:fixed;left:0;right:0;bottom:0;max-height:40%;overflow:auto;margin:0;padding:8px;background:#900;color:#fff;font:12px monospace;z-index:99999;white-space:pre-wrap';document.body.appendChild(d);}d.textContent+=t+'\n';}
addEventListener('error',e=>show(e.message+' @'+(e.filename||'').split('/').pop()+':'+e.lineno));
addEventListener('unhandledrejection',e=>show(String(e.reason)));
document.addEventListener('click',e=>{if(e.target.id==='enter')show('ENTER tapped')},true);
