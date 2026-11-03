(function(){
  var root=document.documentElement;
  function load(k){try{var v=localStorage.getItem(k);return v?JSON.parse(v):null}catch(e){return null}}
  function save(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}
  // sync.js normally provides fsStore; this fallback keeps a page working on its own.
  if(!window.fsStore){
    var STORE='fs-proj:'+document.title;
    window.fsStore={load:function(){return load(STORE)||{}},save:function(o){save(STORE,o)},onChange:function(){}};
  }

  var theme=load('fs-proj:theme'); if(theme) root.setAttribute('data-theme',theme);
  var tb=document.getElementById('themeBtn');
  if(tb) tb.addEventListener('click',function(){
    var dark=window.matchMedia&&matchMedia('(prefers-color-scheme: dark)').matches;
    var cur=root.getAttribute('data-theme')||(dark?'dark':'light');
    var next=cur==='dark'?'light':'dark'; root.setAttribute('data-theme',next); save('fs-proj:theme',next);
  });
  var pb=document.getElementById('printBtn'); if(pb) pb.addEventListener('click',function(){window.print()});

  // Every checkbox inside .check[data-group] remembers its state (shared when signed in).
  var boxes=[];
  document.querySelectorAll('.check[data-group]').forEach(function(list){
    var g=list.getAttribute('data-group');
    list.querySelectorAll('input[type=checkbox]').forEach(function(cb,i){
      var id=g+':'+i; boxes.push([id,cb]);
      cb.addEventListener('change',function(){
        var s=window.fsStore.load(); s.checks=s.checks||{}; s.checks[id]=cb.checked; window.fsStore.save(s);
      });
    });
  });
  function applyChecks(s){
    var c=(s&&s.checks)||{};
    boxes.forEach(function(p){ var v=!!c[p[0]]; if(p[1].checked!==v) p[1].checked=v; });
  }
  applyChecks(window.fsStore.load());
  window.fsStore.onChange(applyChecks);
})();
