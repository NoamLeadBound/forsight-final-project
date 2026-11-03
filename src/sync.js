/* Shared memory for every page.
   Signed in as a team member: state lives in Supabase and changes from others arrive live.
   Otherwise: state stays in this browser only (localStorage). Pages talk to window.fsStore either way. */
(function(){
  var CFG={url:'__SUPABASE_URL__',key:'__SUPABASE_ANON_KEY__'};
  var configured=CFG.url.indexOf('__')!==0 && !!window.supabase;
  var root=document.documentElement;
  var PAGE=root.getAttribute('data-page')||document.title;
  var LS='fs-proj:'+document.title;
  var LOCAL_ONLY={mustOnly:1};          // personal view settings, never shared
  var NESTED={checks:1,fields:1};       // stored one row per checkbox / field

  function clone(o){return JSON.parse(JSON.stringify(o||{}))}
  function same(a,b){return JSON.stringify(a)===JSON.stringify(b)}
  function lsGet(){try{return JSON.parse(localStorage.getItem(LS))||{}}catch(e){return {}}}
  function lsSet(o){try{localStorage.setItem(LS,JSON.stringify(o))}catch(e){}}
  function leaves(o){
    var out={};
    Object.keys(o).forEach(function(k){
      if(LOCAL_ONLY[k]) return;
      var v=o[k];
      if(NESTED[k]&&v&&typeof v==='object') Object.keys(v).forEach(function(s){out[k+'.'+s]=v[s]});
      else out[k]=v;
    });
    return out;
  }
  function setLeaf(o,k,v){
    var i=k.indexOf('.'),a=k.slice(0,i);
    if(i>0&&NESTED[a]){o[a]=o[a]||{};o[a][k.slice(i+1)]=v} else o[k]=v;
  }

  var cache=lsGet(), synced={}, listeners=[], authListeners=[];
  var sb=null, me=null, member=false, known=false, timer=null, state='local', stateMsg='';

  function notify(){var s=clone(cache);listeners.forEach(function(cb){try{cb(s)}catch(e){console.error(e)}})}

  window.fsStore={
    load:function(){return clone(cache)},
    save:function(o){cache=clone(o);lsSet(cache);schedule()},
    onChange:function(cb){listeners.push(cb)}
  };

  function schedule(){if(!member)return;clearTimeout(timer);timer=setTimeout(push,350)}
  function push(){
    var cur=leaves(cache),rows=[];
    Object.keys(cur).forEach(function(k){if(!same(cur[k],synced[k]))rows.push({page:PAGE,k:k,v:cur[k],updated_by:me.email})});
    if(!rows.length) return;
    rows.forEach(function(r){synced[r.k]=r.v});
    setState('saving');
    sb.from('kv').upsert(rows).then(function(res){
      if(res.error){rows.forEach(function(r){delete synced[r.k]});setState('error',res.error.message)}
      else setState('shared');
    });
  }
  function pull(){
    return sb.from('kv').select('k,v').eq('page',PAGE).then(function(res){
      if(res.error) throw res.error;
      var local=leaves(cache), remote={};
      res.data.forEach(function(r){remote[r.k]=r.v});
      Object.keys(remote).forEach(function(k){setLeaf(cache,k,remote[k])});
      synced=remote; lsSet(cache); notify();
      // whatever was filled in here before signing in, and is not shared yet, goes up now
      var pending=Object.keys(local).some(function(k){var v=local[k];return !(k in remote)&&v!==''&&v!==false&&v!=null});
      if(pending) push();
    });
  }
  function subscribe(){
    sb.channel('kv:'+PAGE).on('postgres_changes',{event:'*',schema:'public',table:'kv',filter:'page=eq.'+PAGE},function(p){
      var r=p.new; if(!r||!r.k||same(synced[r.k],r.v)) return;
      synced[r.k]=r.v; setLeaf(cache,r.k,r.v); lsSet(cache); notify();
    }).subscribe();
  }

  /* ---------- sign-in UI ---------- */
  var esc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  var btn=null, dlg=null, bar=null;
  function setState(s,msg){state=s;stateMsg=msg||'';render()}
  function label(){
    if(!me) return 'התחברות';
    if(!member) return '⚠ לא מורשה';
    var dot={shared:'●',saving:'◌',error:'⚠'}[state]||'●';
    return dot+' '+(me.name||me.email.split('@')[0]);
  }
  function render(){
    if(!btn) return;
    btn.textContent=label();
    btn.className='btn fs-auth'+(member?(state==='error'?' err':' on'):'');
    btn.title=member?(state==='error'?'השמירה נכשלה: '+stateMsg:'שמירה משותפת פעילה'):(me?'המייל לא ברשימת הצוות':'התחברו כדי לשתף את הסימונים עם הצוות');
    if(bar) bar.hidden=!known || member || sessionStorage.getItem('fs-bar-off')==='1';
    if(bar&&me&&!member) bar.querySelector('span').textContent='החשבון '+me.email+' עוד לא ברשימת הצוות. בקשו מנועם להוסיף אותו, ועד אז הסימונים נשמרים רק אצלכם.';
  }
  function openDialog(){
    var body;
    if(!me){
      body='<h3>התחברות לאתר הפרויקט</h3>'+
        '<p class="muted small">אחרי ההתחברות, כל סימון ושדה בדפים נשמר אצל כל הצוות ומתעדכן אצל כולם.</p>'+
        '<label>מייל<input type="email" id="fsEmail" autocomplete="email" dir="ltr"></label>'+
        '<label>סיסמה<input type="password" id="fsPass" autocomplete="current-password" dir="ltr"></label>'+
        '<p class="fs-msg" id="fsMsg"></p>'+
        '<div class="fs-row"><button class="btn primary" id="fsIn" type="button">כניסה</button><button class="btn" id="fsUp" type="button">הרשמה בפעם הראשונה</button><button class="btn" id="fsClose" type="button">ביטול</button></div>';
    } else {
      body='<h3>'+(member?'מחובר':'מחובר, אבל לא מורשה')+'</h3>'+
        '<p>'+esc(me.name?me.name+' · ':'')+'<bdi>'+esc(me.email)+'</bdi></p>'+
        '<p class="muted small">'+(member?(state==='error'?'השמירה האחרונה נכשלה: '+esc(stateMsg):'השמירה המשותפת פעילה. מה שמסמנים כאן מופיע אצל כל הצוות.'):'המייל הזה לא ברשימת הצוות, ולכן הסימונים נשמרים רק בדפדפן הזה. בקשו מנועם להוסיף אותו.')+'</p>'+
        '<div class="fs-row"><button class="btn" id="fsOut" type="button">יציאה</button><button class="btn" id="fsClose" type="button">סגירה</button></div>';
    }
    dlg.innerHTML=body; dlg.showModal();
    var q=function(id){return dlg.querySelector('#'+id)};
    q('fsClose').onclick=function(){dlg.close()};
    if(!me){
      var msg=q('fsMsg');
      var back=location.protocol==='file:'?'https://noamleadbound.github.io/forsight-final-project/':location.href.split('#')[0];
      var say=function(text,resend){
        msg.textContent=text;
        if(resend){
          var b=document.createElement('button'); b.type='button'; b.className='btn'; b.style.marginTop='8px'; b.textContent='שליחת מייל האישור שוב';
          b.onclick=function(){
            var email=q('fsEmail').value.trim().toLowerCase(); if(!email){msg.textContent='צריך מייל.';return}
            msg.textContent='שולח…';
            sb.auth.resend({type:'signup',email:email,options:{emailRedirectTo:back}}).then(function(r){
              say(r.error?explain(r.error):'נשלח מייל אישור חדש ל-'+email+'. אם לא הגיע תוך כמה דקות, בדקו בספאם.',!!r.error);
            });
          };
          msg.appendChild(document.createElement('br')); msg.appendChild(b);
        }
      };
      var explain=function(err){
        var m=(err&&err.message)||'', c=(err&&err.code)||'';
        if(/Invalid login/i.test(m)) return 'מייל או סיסמה שגויים. בפעם הראשונה צריך קודם "הרשמה".';
        if(/not confirmed/i.test(m)||c==='email_not_confirmed') return 'המייל עוד לא אושר. פתחו את מייל האישור (בדקו גם בספאם), או שלחו אותו שוב.';
        if(/rate limit|over_email_send_rate_limit/i.test(m+' '+c)) return 'נשלחו יותר מדי מיילים מהאתר בשעה האחרונה. נסו שוב בעוד שעה, או בקשו מנועם לאשר אתכם ידנית.';
        if(/security purposes|after \d+ seconds/i.test(m)) return 'צריך לחכות דקה לפני ניסיון נוסף.';
        if(/already registered/i.test(m)) return 'המייל כבר רשום. נסו "כניסה".';
        if(/at least 6|weak/i.test(m)) return 'הסיסמה צריכה לפחות 6 תווים.';
        return 'שגיאה: '+m;
      };
      var go=function(up){
        var email=q('fsEmail').value.trim().toLowerCase(), pass=q('fsPass').value;
        if(!email||!pass){msg.textContent='צריך מייל וסיסמה.';return}
        msg.textContent='רגע…';
        var call=up?sb.auth.signUp({email:email,password:pass,options:{emailRedirectTo:back}}):sb.auth.signInWithPassword({email:email,password:pass});
        call.then(function(res){
          if(res.error){var e=explain(res.error);say(e,/לא אושר|יותר מדי/.test(e));return}
          if(up&&!res.data.session){say('נשלח מייל לאישור החשבון אל '+email+'. לוחצים על הקישור במייל (בדקו גם בספאם), ואז חוזרים לכאן ונכנסים.',true);return}
          dlg.close();
        });
      };
      q('fsIn').onclick=function(){go(false)};
      q('fsUp').onclick=function(){go(true)};
      q('fsPass').onkeydown=function(e){if(e.key==='Enter')go(false)};
      setTimeout(function(){q('fsEmail').focus()},50);
    } else {
      q('fsOut').onclick=function(){sb.auth.signOut();dlg.close()};
    }
  }
  function mountUI(){
    var top=document.querySelector('.topbar'); if(!top) return;
    btn=document.createElement('button'); btn.type='button'; btn.id='authBtn';
    btn.addEventListener('click',openDialog);
    var anchor=document.getElementById('printBtn');
    if(anchor) top.insertBefore(btn,anchor); else top.appendChild(btn);
    dlg=document.createElement('dialog'); dlg.className='fs-dialog'; document.body.appendChild(dlg);
    bar=document.createElement('div'); bar.className='fs-bar no-print'; bar.hidden=true;
    bar.innerHTML='<span>הסימונים בדף הזה נשמרים כרגע רק בדפדפן שלך. כדי לשתף אותם עם הצוות צריך להתחבר.</span><button class="btn" type="button">התחברות</button><button class="fs-x" type="button" aria-label="סגירה">×</button>';
    bar.querySelector('.btn').onclick=openDialog;
    bar.querySelector('.fs-x').onclick=function(){sessionStorage.setItem('fs-bar-off','1');bar.hidden=true};
    top.insertAdjacentElement('afterend',bar);
    render();
  }

  /* ---------- session ---------- */
  var seenUser;
  function onSession(session){
    var u=session?session.user:null, id=u?u.id:null;
    if(id===seenUser) return; seenUser=id;
    me=u?{id:u.id,email:(u.email||'').toLowerCase()}:null; member=false; synced={};
    if(!me){known=true;setState('local');fire();return}
    sb.from('members').select('name').eq('email',me.email).maybeSingle().then(function(res){
      member=!!res.data; known=true; if(res.data) me.name=res.data.name;
      setState(member?'shared':'local'); fire();
      if(member) pull().then(subscribe).catch(function(e){setState('error',e.message)});
    });
  }
  function fire(){authListeners.forEach(function(cb){try{cb()}catch(e){console.error(e)}})}

  window.fsSync={
    configured:configured,
    client:function(){return sb},
    user:function(){return me},
    member:function(){return member},
    onAuth:function(cb){authListeners.push(cb)},
    login:function(){if(configured)openDialog()}
  };

  if(configured){
    sb=window.supabase.createClient(CFG.url,CFG.key,{auth:{persistSession:true,storageKey:'fs-proj-auth'}});
    mountUI();
    sb.auth.onAuthStateChange(function(ev,session){
      if(ev==='INITIAL_SESSION'||ev==='SIGNED_IN'||ev==='SIGNED_OUT') setTimeout(function(){onSession(session)},0);
    });
  }
})();
