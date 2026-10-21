/* DriveShare – frontend tĩnh cho GitHub Pages, gọi Apps Script qua JSON API */
'use strict';
var BASE = (typeof PUBLIC_BASE_URL === 'string' && PUBLIC_BASE_URL) || (location.origin + location.pathname);
var token = sessionStorage.getItem('ds_token'), chosen = null;

// ---------- Tiện ích ----------
function $(id){ return document.getElementById(id); }
function show(){ [].forEach.call(arguments,function(id){ $(id).classList.remove('hidden'); }); }
function hide(){ [].forEach.call(arguments,function(id){ $(id).classList.add('hidden'); }); }
function showMsg(el,t,ok){ el.textContent=t; el.className='msg '+(ok?'ok':'err'); }
function fmtSize(b){ b=Number(b)||0; var u=['B','KB','MB','GB'],i=0; while(b>=1024&&i<3){b/=1024;i++;} return (i?b.toFixed(1):b)+' '+u[i]; }
function fmtDate(ms){ return new Date(Number(ms)).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',day:'2-digit',month:'2-digit',year:'numeric'}); }
function left(ms){ var d=Number(ms)-Date.now(); if(d<=0) return 'đã hết hạn'; var h=Math.floor(d/3600000); return h>=24?('còn '+Math.floor(h/24)+' ngày '+(h%24)+' giờ'):('còn '+h+' giờ '+Math.floor(d%3600000/60000)+' phút'); }
function copyText(t,btn){ var done=function(){ var o=btn.textContent; btn.textContent='✓ Đã chép'; setTimeout(function(){btn.textContent=o},1500); };
  function fb(){ var a=document.createElement('textarea'); a.value=t; document.body.appendChild(a); a.select(); try{document.execCommand('copy');done();}catch(e){} a.remove(); }
  if(navigator.clipboard&&navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done,fb); else fb(); }
function linkFor(id){ return BASE+'?id='+encodeURIComponent(id); }
function codeLink(c){ return BASE+'?c='+c; }

// ---------- Gọi API Apps Script ----------
// POST text/plain = "simple request" -> không có preflight CORS. Apps Script trả 302 sang
// script.googleusercontent.com, nơi có Access-Control-Allow-Origin: *.
function run(action){
  var args=[].slice.call(arguments,1);
  if(window.MOCK_API) return new Promise(function(res){ setTimeout(function(){ res(window.MOCK_API[action].apply(null,args)); },10); });
  return fetch(APPS_SCRIPT_URL,{ method:'POST', redirect:'follow', headers:{'Content-Type':'text/plain;charset=utf-8'},
                                 body: JSON.stringify({action:action,args:args}) })
    .then(function(r){ if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(function(j){ if(!j.ok) throw new Error(j.error||'Lỗi không xác định'); return j.data; });
}

// ---------- Định tuyến ----------
function parseCode(v){ v=String(v||'').trim(); if(!v) return '';
  if(/^#?[0-9]{4}$/.test(v)) return {c:v.replace('#','')};
  var mc=v.match(/[?&]c=([0-9]{4})(?![0-9])/); if(mc) return {c:mc[1]};
  var mh=v.match(/#([0-9]{4})$/); if(mh) return {c:mh[1]};
  var m=v.match(/[?&]id=([^&#\s]+)/); if(m) v=decodeURIComponent(m[1]);
  else { var mh2=v.match(/^https?:\/\/[^#]*#([a-z0-9_-]{3,50})$/i); if(mh2) v=mh2[1]; else if(/^https?:\/\//i.test(v)) return null; }
  v=v.toLowerCase().replace(/^#/,''); return /^[a-z0-9_-]{3,50}$/.test(v)?v:null; }
function route(){
  var q=new URLSearchParams(location.search), h=decodeURIComponent(location.hash.slice(1));
  if(q.has('admin')) return initAdmin();
  if(q.get('c')) return initDownload({c:q.get('c')});
  if(q.get('id')) return initDownload(q.get('id'));
  if(/^[0-9]{4}$/.test(h)) return initDownload({c:h});
  if(/^[a-z0-9_-]{3,50}$/i.test(h)) return initDownload(h.toLowerCase());
  initUpload();
}
$('gotoBtn').onclick=function(){ var c=parseCode($('gotoIn').value);
  if(!c){ showMsg($('gotoMsg'),'Link hoặc mã không hợp lệ.'); return; }
  location.href = c.c ? codeLink(c.c) : linkFor(c); };
$('gotoIn').onkeydown=function(e){ if(e.key==='Enter') $('gotoBtn').click(); };
window.addEventListener('hashchange',function(){ location.reload(); });
[].forEach.call(document.querySelectorAll('.logout'),function(a){ a.onclick=function(e){ e.preventDefault(); sessionStorage.removeItem('ds_token'); location.reload(); }; });

// ---------- Đăng nhập ----------
function requireLogin(next){
  function ask(){ show('loginCard');
    $('loginBtn').onclick=function(){ var b=this; b.disabled=true; b.textContent='Đang kiểm tra…';
      run('login',$('pw').value).then(function(t){ token=t; sessionStorage.setItem('ds_token',t); $('pw').value=''; hide('loginCard'); next(); })
        .catch(function(e){ showMsg($('loginMsg'),e.message); }).then(function(){ b.disabled=false; b.textContent='Đăng nhập'; }); };
    $('pw').onkeydown=function(e){ if(e.key==='Enter') $('loginBtn').click(); }; }
  if(!token) return ask();
  run('checkToken',token).then(function(ok){ if(ok) next(); else { sessionStorage.removeItem('ds_token'); token=null; ask(); } }).catch(function(e){ ask(); showMsg($('loginMsg'),e.message); });
}
function authErr(e){ if(/AUTH/.test(e.message)){ sessionStorage.removeItem('ds_token'); setTimeout(function(){ location.reload(); },1500); } }

// ---------- Upload ----------
function initUpload(){ requireLogin(function(){ show('upCard'); }); }
var drop=$('drop');
drop.onclick=function(){ $('file').click(); };
$('file').onchange=function(){ if(this.files[0]) pick(this.files[0]); };
['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.add('over'); }); });
['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev,function(e){ e.preventDefault(); drop.classList.remove('over'); }); });
drop.addEventListener('drop',function(e){ if(e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); });
function pick(f){ chosen=f; var fi=$('fileinfo'); fi.style.display='block'; fi.textContent='📄 '+f.name+' — '+fmtSize(f.size); $('upBtn').disabled=false; }
function setProg(done,total,label){ var p=total?Math.min(100,done/total*100):0; $('bar').style.display='block'; $('bar').firstElementChild.style.width=p.toFixed(1)+'%'; $('ptxt').textContent=(label||'')+' '+p.toFixed(0)+'% ('+fmtSize(done)+' / '+fmtSize(total)+')'; }

var slugTimer=null;
function slugState(t,cls){ var e=$('slugSt'); e.textContent=t; e.className='slugst '+(cls||'small'); }
function checkSlugNow(){
  var v=$('slug').value.trim().toLowerCase(); clearTimeout(slugTimer);
  if(!v){ slugState('Để trống: hệ thống tạo mã ngẫu nhiên.'); return Promise.resolve(true); }
  if(!/^[a-z0-9_-]{3,50}$/.test(v)){ slugState('✗ Chỉ a-z, 0-9, “-”, “_”, dài 3–50 ký tự.','err'); return Promise.resolve(false); }
  if(/^[0-9]{4}$/.test(v)){ slugState('✗ Mã link không được là đúng 4 chữ số.','err'); return Promise.resolve(false); }
  slugState('Đang kiểm tra…');
  return run('checkSlug',token,v).then(function(r){ slugState((r.ok?'✓ ':'✗ ')+r.message+(r.ok?'  → ?id='+v:''), r.ok?'ok':'err'); return r.ok; })
    .catch(function(e){ slugState('Lỗi: '+e.message,'err'); return false; });
}
$('slug').addEventListener('input',function(){ this.value=this.value.toLowerCase().replace(/\s+/g,'-'); clearTimeout(slugTimer); slugTimer=setTimeout(checkSlugNow,600); });
$('slugBtn').onclick=checkSlugNow;

function putChunk(url,blob,start,total,onp){
  return new Promise(function(res,rej){
    var x=new XMLHttpRequest(); x.open('PUT',url,true);
    x.setRequestHeader('Content-Range','bytes '+start+'-'+(start+blob.size-1)+'/'+total);
    x.upload.onprogress=function(e){ if(e.lengthComputable) onp(e.loaded); };
    x.onload=function(){ if(x.status===308) res({done:false}); else if(x.status===200||x.status===201){ var id=null; try{ id=JSON.parse(x.responseText).id; }catch(e){} res({done:true,fileId:id}); } else rej(new Error('HTTP '+x.status)); };
    x.onerror=function(){ rej(new Error('CORS/mạng')); };
    x.send(blob);
  });
}
async function directUpload(f,s){
  var pos=0, r={};
  while(pos<f.size){ var blob=f.slice(pos,Math.min(pos+s.chunkSize,f.size)), p0=pos;
    r=await putChunk(s.sessionUrl,blob,pos,f.size,function(l){ setProg(p0+l,f.size,'Đang tải lên'); }); pos+=blob.size; }
  return r.fileId||'';
}
function readB64(blob){ return new Promise(function(res,rej){ var fr=new FileReader(); fr.onload=function(){ res(String(fr.result).split(',')[1]||''); }; fr.onerror=rej; fr.readAsDataURL(blob); }); }
async function fallbackUpload(f,s){
  var pos=0, r={};
  while(pos<f.size){
    var blob=f.slice(pos,Math.min(pos+s.chunkSize,f.size)), b64=await readB64(blob), tries=0;
    while(true){ try{ r=await run('uploadChunk',token,s.uploadId,b64,pos); break; }
      catch(e){ if(++tries>=3||/AUTH/.test(e.message)) throw e; await new Promise(function(z){ setTimeout(z,2000*tries); }); } }
    pos = r.done ? f.size : (r.next||pos+blob.size);
    setProg(pos,f.size,'Đang tải lên (qua máy chủ)');
  }
  return r.fileId||'';
}
$('upBtn').onclick=async function(){
  if(!chosen) return; var b=this; b.disabled=true; $('upMsg').className='msg';
  if(!(await checkSlugNow())){ showMsg($('upMsg'),'Mã link không hợp lệ hoặc đã được dùng.'); b.disabled=false; return; }
  var meta={ name:chosen.name, size:chosen.size, mime:chosen.type||'application/octet-stream',
    days:Number(document.querySelector('input[name=days]:checked').value), note:$('note').value,
    slug:$('slug').value.trim().toLowerCase(), origin:location.origin };
  try{
    setProg(0,chosen.size,'Đang chuẩn bị');
    var s=await run('startUpload',token,meta), fileId=null;
    try{ fileId=await directUpload(chosen,s); }
    catch(e){ console.warn('Upload trực tiếp thất bại, chuyển sang fallback:',e);
      delete meta.origin; s=await run('startUpload',token,meta); fileId=await fallbackUpload(chosen,s); }
    $('ptxt').textContent='Đang hoàn tất…';
    showDone(await run('finishUpload',token,s.uploadId,fileId||''));
  }catch(e){ showMsg($('upMsg'),'Lỗi: '+e.message); authErr(e); }
  finally{ b.disabled=false; }
};
function showDone(r){
  hide('upCard'); show('doneCard');
  var url=linkFor(r.id);
  $('rCode').textContent=r.code; $('rName').textContent=r.name; $('rSize').textContent=fmtSize(r.size);
  $('rExp').textContent=fmtDate(r.expiresAt)+' ('+left(r.expiresAt)+')'; $('rLink').value=url;
  $('rCodeLink').textContent=$('rCodeLink').href=codeLink(r.code);
  $('slugWarn').classList.toggle('hidden',!r.slugTaken); $('privWarn').classList.toggle('hidden',r.isPublic!==false);
  var q=$('qr'); q.innerHTML='';
  if(window.qrcode){ var qr=qrcode(0,'M'); qr.addData(url); qr.make(); q.innerHTML=qr.createSvgTag({cellSize:5,margin:2}); }
  else { var img=document.createElement('img'); img.alt='QR'; img.src='https://api.qrserver.com/v1/create-qr-code/?size=200x200&data='+encodeURIComponent(url); q.appendChild(img); }
}
$('copyCode').onclick=function(){ copyText($('rCode').textContent,this); };
$('copyBtn').onclick=function(){ copyText($('rLink').value,this); };
$('againBtn').onclick=function(){ location.href=BASE; };

// ---------- Tải file ----------
var info=null;
function initDownload(key){
  $('title').firstChild.textContent='📥 Tải file'; $('subtitle').textContent='File được chia sẻ qua DriveShare';
  show('loadingCard');
  var p = key.c ? run('lookupCode',key.c).then(function(id){ return id ? run('getFileInfo',id) : null; }) : run('getFileInfo',key);
  p.then(function(r){
    hide('loadingCard');
    if(!r){ $('gotoIn').value=key.c||key; show('notfound'); return; }
    info=r; show('infoCard'); document.title=r.name+' – DriveShare';
    $('fName').textContent=r.name; $('fCode').textContent=r.code||'—'; $('fId').textContent=r.id;
    $('fSize').textContent=fmtSize(r.size); $('fCreated').textContent=fmtDate(r.createdAt);
    $('fExp').textContent=fmtDate(r.expiresAt)+' ('+left(r.expiresAt)+')'; $('fDl').textContent=r.downloads;
    if(r.note){ show('noteWrap'); $('fNote').textContent=r.note; }
    if(r.url) $('dlBtn').href=r.url;
    else if(!r.canProxy){ hide('dlBtn'); showMsg($('dlMsg'),'Chủ sở hữu chưa bật chia sẻ công khai cho file này. Vui lòng liên hệ người gửi.'); }
  }).catch(function(e){ hide('loadingCard'); $('nfText').textContent='Lỗi: '+e.message; show('notfound'); });
}
$('dlBtn').addEventListener('click',function(e){
  if(!info) return e.preventDefault();
  if(info.url){ run('registerDownload',info.id).catch(function(){}); $('fDl').textContent=info.downloads+1; return; }
  e.preventDefault(); var b=this; b.textContent='Đang chuẩn bị…';
  run('proxyDownload',info.id).then(function(d){
    var bin=atob(d.b64), arr=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++) arr[i]=bin.charCodeAt(i);
    var a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([arr],{type:d.mime})); a.download=d.name; document.body.appendChild(a); a.click(); a.remove();
  }).catch(function(err){ showMsg($('dlMsg'),'Lỗi: '+err.message); }).then(function(){ b.textContent='⬇️ Tải xuống'; });
});

// ---------- Admin ----------
function el(tag,cls,txt){ var e=document.createElement(tag); if(cls) e.className=cls; if(txt!=null) e.textContent=txt; return e; }
function initAdmin(){
  $('wrap').classList.add('wide'); $('title').firstChild.textContent='🛠️ Quản trị DriveShare'; $('subtitle').textContent='Danh sách file đang chia sẻ';
  hide('gotoCard'); requireLogin(loadAdmin);
}
function loadAdmin(){
  return run('adminList',token).then(function(list){
    show('listCard'); var tb=$('tb'); tb.innerHTML=''; var total=0;
    if(!list.length){ var tr=el('tr'), td=el('td','small','Chưa có file nào.'); td.colSpan=6; tr.appendChild(td); tb.appendChild(tr); }
    list.forEach(function(f){
      total+=f.size; var tr=el('tr'), c1=el('td');
      c1.appendChild(el('div','fname',f.name));
      var cl=el('div','small','🔗 ?id='+f.id+'  ·  mã số '); cl.appendChild(el('span','code4sm',f.code||'—')); c1.appendChild(cl);
      if(f.note) c1.appendChild(el('div','small',f.note));
      c1.appendChild(el('span','tag'+(f.isPublic?'':' warn'),f.isPublic?'công khai':'không công khai'));
      tr.appendChild(c1); tr.appendChild(el('td',null,fmtSize(f.size))); tr.appendChild(el('td','small',fmtDate(f.createdAt)));
      var c4=el('td','small',fmtDate(f.expiresAt)); c4.appendChild(el('div',null,left(f.expiresAt))); tr.appendChild(c4);
      tr.appendChild(el('td',null,String(f.downloads)));
      var c6=el('td'); c6.style.whiteSpace='nowrap';
      var cp=el('button','btn ghost sm','📋 Link'); cp.onclick=function(){ copyText(linkFor(f.id),cp); };
      var del=el('button','btn danger sm','🗑 Xóa'); del.onclick=function(){ if(!confirm('Xóa file "'+f.name+'"?')) return; del.disabled=true; run('adminDelete',token,f.id).then(loadAdmin).catch(adminErr); };
      c6.appendChild(cp); c6.appendChild(document.createTextNode(' ')); c6.appendChild(del); tr.appendChild(c6); tb.appendChild(tr);
    });
    $('stats').textContent=list.length+' file · tổng '+fmtSize(total);
  }).catch(adminErr);
}
function adminErr(e){ if(/AUTH/.test(e.message)){ authErr(e); showMsg($('listMsg'),e.message.replace('AUTH: ','')); } else showMsg($('listMsg'),'Lỗi: '+e.message); }
$('refresh').onclick=loadAdmin;
$('cleanup').onclick=function(){ run('adminCleanup',token).then(function(n){ showMsg($('listMsg'),'Đã dọn '+n+' file.',true); loadAdmin(); }).catch(adminErr); };

if(!window.NO_ROUTE) route();
