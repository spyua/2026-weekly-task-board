// ============================================================
// ACTIONS — User interaction handlers
// ============================================================

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
  STATE.tasks=[...seedTasks(),...STATE.tasks];
  render();
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
  STATE.slots=defaultSlots();
  if(STATE.settings.autoSeed)STATE.tasks=seedTasks();
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
