// ============================================================
// ACTIONS — User interaction handlers
// ============================================================

// --- Touch drag state ---
let _touchDragTaskId = null;
let _touchGhost = null;

// --- Board actions ---
function dropOnSlot(e,slotId){
  e.preventDefault();
  if(!dragTaskId)return;
  STATE.slots=STATE.slots.map(s=>s.id===slotId?{...s,taskId:dragTaskId,done:false}:s);
  dragTaskId=null;
  render();
}

function toggleSlotDone(slotId){
  const slot=STATE.slots.find(s=>s.id===slotId);
  if(!slot)return;
  slot.done=!slot.done;
  if(STATE.settings.mirrorDone&&slot.taskId){
    const t=STATE.tasks.find(x=>x.id===slot.taskId);
    if(t)t.done=slot.done;
  }
  render();
}

function clearSlot(slotId){
  snapshotForUndo();
  STATE.slots=STATE.slots.map(s=>s.id===slotId?{...s,taskId:undefined,done:false}:s);
  render();
}

// --- Task actions ---
function toggleTaskDone(taskId){
  const t=STATE.tasks.find(x=>x.id===taskId);
  if(!t)return;
  t.done=!t.done;
  if(STATE.settings.mirrorDone){
    STATE.slots.forEach(s=>{if(s.taskId===taskId)s.done=t.done;});
  }
  render();
}

function deleteTask(taskId){
  snapshotForUndo();
  STATE.tasks=STATE.tasks.filter(t=>t.id!==taskId);
  STATE.slots=STATE.slots.map(s=>s.taskId===taskId?{...s,taskId:undefined,done:false}:s);
  render();
}

function addTask(){
  const title=(document.getElementById('nt_title')?.value||'').trim();
  if(!title)return;
  const cat=document.getElementById('nt_cat')?.value||'agent';
  const mins=parseInt(document.getElementById('nt_mins')?.value)||undefined;
  const notes=(document.getElementById('nt_notes')?.value||'').trim();
  STATE.tasks.unshift({id:uid(),title,category:cat,estMins:mins,notes:notes||undefined,done:false,createdAt:Date.now()});
  render();
  setTimeout(()=>{const el=document.getElementById('nt_title');if(el){el.value='';el.focus();}},50);
}

function addSeedTasks(){
  addSeedTasksDeduped();
  render();
}

// --- Keyboard assign (a11y alternative to drag) ---
function assignTaskToSlot(slotId, taskId){
  if(!slotId||!taskId) return;
  STATE.slots=STATE.slots.map(s=>s.id===slotId?{...s,taskId:taskId,done:false}:s);
  render();
}

// --- Task editing ---
function startEditTask(taskId){
  _editingTaskId = taskId;
  render();
}

function saveEditTask(taskId){
  const t=STATE.tasks.find(x=>x.id===taskId);
  if(!t) return;
  const title=(document.getElementById('edit_title_'+taskId)?.value||'').trim();
  if(!title) return;
  t.title=title;
  t.category=document.getElementById('edit_cat_'+taskId)?.value||t.category;
  t.estMins=parseInt(document.getElementById('edit_mins_'+taskId)?.value)||undefined;
  t.notes=(document.getElementById('edit_notes_'+taskId)?.value||'').trim()||undefined;
  _editingTaskId=null;
  render();
}

function cancelEditTask(){
  _editingTaskId=null;
  render();
}

// --- Touch drag implementation ---
function onTaskTouchStart(e, taskId){
  const touch=e.touches[0];
  _touchDragTaskId=taskId;
  const el=e.currentTarget;
  _touchGhost=el.cloneNode(true);
  _touchGhost.id='touch-ghost';
  _touchGhost.style.position='fixed';
  _touchGhost.style.pointerEvents='none';
  _touchGhost.style.opacity='0.8';
  _touchGhost.style.zIndex='9999';
  _touchGhost.style.width=el.offsetWidth+'px';
  _touchGhost.style.left=(touch.clientX-el.offsetWidth/2)+'px';
  _touchGhost.style.top=(touch.clientY-20)+'px';
  document.body.appendChild(_touchGhost);
}

function _onTouchMove(e){
  if(!_touchDragTaskId||!_touchGhost) return;
  e.preventDefault();
  const touch=e.touches[0];
  _touchGhost.style.left=(touch.clientX-_touchGhost.offsetWidth/2)+'px';
  _touchGhost.style.top=(touch.clientY-20)+'px';

  // Highlight target slot
  document.querySelectorAll('.slot.touch-over').forEach(s=>s.classList.remove('touch-over'));
  const target=document.elementFromPoint(touch.clientX,touch.clientY);
  if(target){
    const slot=target.closest('[data-slot-id]');
    if(slot) slot.classList.add('touch-over');
  }
}

function _onTouchEnd(e){
  if(!_touchDragTaskId) return;
  const touch=e.changedTouches[0];
  // Clean up ghost
  if(_touchGhost){ _touchGhost.remove(); _touchGhost=null; }
  document.querySelectorAll('.slot.touch-over').forEach(s=>s.classList.remove('touch-over'));

  // Find target slot
  const target=document.elementFromPoint(touch.clientX,touch.clientY);
  if(target){
    const slot=target.closest('[data-slot-id]');
    if(slot){
      const slotId=slot.getAttribute('data-slot-id');
      STATE.slots=STATE.slots.map(s=>s.id===slotId?{...s,taskId:_touchDragTaskId,done:false}:s);
      _touchDragTaskId=null;
      render();
      return;
    }
  }
  _touchDragTaskId=null;
}

// --- Monthly actions ---
function shiftMonth(offset){
  const [y,m]=selectedMonth.split('-').map(Number);
  const d=new Date(y,m-1+offset,1);
  selectedMonth=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  render();
}

function updateMetric(month,key,delta,absVal){
  if(!STATE.monthly[month]) STATE.monthly[month]={};
  if(absVal!==undefined&&absVal!==null){
    STATE.monthly[month][key]=Math.max(0,absVal);
  }else{
    STATE.monthly[month][key]=Math.max(0,(STATE.monthly[month][key]||0)+(delta||0));
  }
  render();
}

// --- Global actions ---
function doReset(){
  if(!confirm('確定重置本週排程？自訂任務不會被刪除。')) return;
  snapshotForUndo();
  STATE.slots=defaultSlots();
  if(STATE.settings.autoSeed) addSeedTasksDeduped();
  render();
}

function doClearAll(){
  STATE.tasks=[];
  STATE.slots=defaultSlots();
  render();
}

function doExport(){
  const blob=new Blob([JSON.stringify({tasks:STATE.tasks,slots:STATE.slots,settings:STATE.settings,monthly:STATE.monthly},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=`planner-${new Date().toISOString().slice(0,10)}.json`;a.click();
  URL.revokeObjectURL(url);
}

function doImport(e){
  const f=e.target.files?.[0];
  if(!f)return;
  const reader=new FileReader();
  reader.onload=()=>{
    try{
      const p=JSON.parse(reader.result);
      STATE.tasks=Array.isArray(p.tasks)?p.tasks:STATE.tasks;
      STATE.slots=Array.isArray(p.slots)?p.slots:STATE.slots;
      STATE.settings=p.settings||STATE.settings;
      STATE.monthly=p.monthly||STATE.monthly;
      render();
    }catch{}
  };
  reader.readAsText(f);
  e.target.value='';
}

// --- Sync actions ---
function saveGistConfig(){
  STATE.gist.token=(document.getElementById('gist_token')?.value||'').trim();
  STATE.gist.gistId=(document.getElementById('gist_id')?.value||'').trim();
  saveLocal();
  render();
  showSyncMsg('設定已儲存','green');
}

async function doPush(){
  showSyncMsg('推送中…','');
  const r=await gistPush();
  showSyncMsg(r.msg,r.ok?'green':'red');
  if(r.ok)render();
}

async function doPull(){
  showSyncMsg('拉取中…','');
  const r=await gistPull();
  showSyncMsg(r.msg,r.ok?'green':'red');
  if(r.ok)render();
}

function showSyncMsg(msg,color){
  const el=document.getElementById('syncMsg');
  if(el)el.innerHTML=`<span style="color:var(--${color||'tx2'})">${esc(msg)}</span>`;
}

// --- Global keyboard shortcut: Ctrl+Z / Cmd+Z ---
document.addEventListener('keydown', function(e){
  if((e.ctrlKey||e.metaKey)&&e.key==='z'&&!e.shiftKey){
    const tag=document.activeElement?.tagName;
    if(tag==='INPUT'||tag==='TEXTAREA'||tag==='SELECT') return;
    e.preventDefault();
    restoreUndo();
  }
});

// --- Touch event delegation ---
document.addEventListener('DOMContentLoaded', function(){
  const tc=document.getElementById('tabContent');
  if(tc){
    tc.addEventListener('touchmove', _onTouchMove, {passive:false});
    tc.addEventListener('touchend', _onTouchEnd);
  }
});
