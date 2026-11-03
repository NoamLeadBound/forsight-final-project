/* Shared lists (tasks, meetings, writing, presentation links, terms) in the Supabase table "items".
   fsItems(kinds, onData, gateEl) loads the rows of those kinds once a team member is signed in,
   keeps them live, and returns {save, remove, ok, who}. */
(function(){
  var esc=window.fsEsc=function(s){return String(s==null?'':s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})};
  window.fsToday=function(){var d=new Date();return new Date(d-d.getTimezoneOffset()*60000).toISOString().slice(0,10)};
  window.fsDate=function(d){if(!d)return'';var p=String(d).slice(0,10).split('-');return (+p[2])+'.'+(+p[1])+'.'+p[0]};
  window.fsWhen=function(ts){if(!ts)return'';var d=new Date(ts);return d.getDate()+'.'+(d.getMonth()+1)+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')};

  window.fsItems=function(kinds,onData,gateEl){
    var S=window.fsSync, sub=null;
    function ok(){return !!(S&&S.configured&&S.member())}
    function who(){var u=S.user();return u?(u.name||u.email):''}
    function gate(){
      document.body.classList.toggle('signed',ok());
      if(!gateEl) return;
      if(ok()){gateEl.hidden=true;return}
      gateEl.hidden=false;
      if(!S||!S.configured){gateEl.innerHTML='<strong>השמירה המשותפת לא מחוברת</strong>התוכן כאן יופיע אחרי חיבור מסד הנתונים.';return}
      if(S.user()){gateEl.innerHTML='<strong>המייל <bdi>'+esc(S.user().email)+'</bdi> עוד לא ברשימת הצוות</strong>בקשו מנועם להוסיף אותו, ואז רעננו את הדף.';return}
      gateEl.innerHTML='<strong>צריך להתחבר</strong>התוכן כאן גלוי רק לצוות. <button class="btn primary" type="button">התחברות</button>';
      gateEl.querySelector('button').onclick=function(){S.login()};
    }
    function load(){
      S.client().from('items').select('*').in('kind',kinds).order('created_at',{ascending:true}).then(function(r){
        if(r.error){console.error(r.error);return}
        onData(r.data||[]);
      });
    }
    var api={
      ok:ok,
      who:function(){return ok()?who():''},
      reload:load,
      save:function(kind,rec,id){
        if(!ok()) return Promise.reject(new Error('not signed in'));
        rec=Object.assign({},rec,{updated_by:who()});
        var q=id?S.client().from('items').update(rec).eq('id',id).select()
                :S.client().from('items').insert(Object.assign({kind:kind,created_by:who()},rec)).select();
        return q.then(function(r){
          if(r.error){alert('השמירה נכשלה: '+r.error.message);throw r.error}
          load(); return r.data&&r.data[0];
        });
      },
      remove:function(id){
        return S.client().from('items').delete().eq('id',id).then(function(r){
          if(r.error) alert('המחיקה נכשלה: '+r.error.message);
          load();
        });
      }
    };
    gate();
    if(S&&S.configured){
      S.onAuth(function(){
        gate();
        if(ok()){
          load();
          if(!sub) sub=S.client().channel('items:'+kinds.join('-')).on('postgres_changes',{event:'*',schema:'public',table:'items'},function(p){
            var k=(p.new&&p.new.kind)||(p.old&&p.old.kind);
            if(!k||kinds.indexOf(k)>=0) load();
          }).subscribe();
        } else onData([]);
      });
    } else onData([]);
    return api;
  };
})();
