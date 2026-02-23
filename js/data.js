// ============================================================
// DATA LAYER — Constants, State, Persistence
// ============================================================
const DAYS = ['週一','週二','週三','週四','週五','週六','週日'];

const ZONES = [
  {id:'morning',label:'早上 8:00–9:00',emoji:'🌅'},
  {id:'noon',label:'中午 11:40–13:00',emoji:'☀️'},
  {id:'evening',label:'晚上 21:00–22:30',emoji:'🌙'},
  {id:'sat',label:'週六 20:00–00:00',emoji:'🧠'},
  {id:'sun',label:'週日 20:00–23:00',emoji:'🔄'},
];

const CATEGORIES = [
  {key:'agent',label:'Agent閱讀',color:'blue'},
  {key:'writing',label:'寫作/出書',color:'green'},
  {key:'toeic',label:'TOEIC',color:'orange'},
  {key:'leetcode',label:'LeetCode',color:'red'},
  {key:'sysdesign',label:'系統設計',color:'purple'},
  {key:'fitness',label:'瘦身/運動',color:'cyan'},
];

const METRICS = [
  {key:'agent_read',   label:'Agent 閱讀',    unit:'次', weekTarget:5,  yearTarget:240, color:'blue',   cat:'agent'},
  {key:'writing',      label:'書章節整理/優化', unit:'次', weekTarget:3,  yearTarget:144, color:'green',  cat:'writing'},
  {key:'toeic_word',   label:'TOEIC 單字',    unit:'天', weekTarget:5,  yearTarget:240, color:'orange', cat:'toeic'},
  {key:'toeic_listen', label:'TOEIC 聽力',    unit:'次', weekTarget:2,  yearTarget:96,  color:'orange', cat:'toeic'},
  {key:'toeic_read',   label:'TOEIC 閱讀',    unit:'回', weekTarget:2,  yearTarget:96,  color:'orange', cat:'toeic'},
  {key:'leetcode',     label:'LeetCode',      unit:'題', weekTarget:3,  yearTarget:150, color:'red',    cat:'leetcode'},
  {key:'sysdesign',    label:'系統設計',       unit:'部', weekTarget:3,  yearTarget:144, color:'purple', cat:'sysdesign'},
  {key:'fitness',      label:'運動',           unit:'次', weekTarget:4,  yearTarget:192, color:'cyan',   cat:'fitness'},
  {key:'diet_log',     label:'飲食紀錄',       unit:'天', weekTarget:7,  yearTarget:365, color:'pink',   cat:'fitness'},
];

const MONTH_LABELS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];

const LOCAL_KEY = 'spyua_planner_v2';

// --- Utilities ---
const uid = () => Math.random().toString(36).slice(2,10) + Date.now().toString(36);
const catInfo = k => CATEGORIES.find(c=>c.key===k)||{label:k,color:''};
const zoneInfo = id => {
  const z = ZONES.find(z=>z.id===id)||{label:id,emoji:''};
  const custom = STATE.settings.zoneLabels?.[id];
  return custom ? {...z, label: custom} : z;
};
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function getCurrentMonth(){
  const d=new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}
function getMetricsForCategory(cat){
  return METRICS.filter(m=>m.cat===cat);
}

function getMetricTargets(metricKey){
  const met=METRICS.find(m=>m.key===metricKey);
  if(!met) return {weekTarget:0, yearTarget:0};
  const custom=STATE.settings.metricTargets?.[metricKey];
  return {
    weekTarget: custom?.weekTarget ?? met.weekTarget,
    yearTarget: custom?.yearTarget ?? met.yearTarget
  };
}

function getActiveMetrics(){
  const usedByTasks = new Set(STATE.tasks.map(t=>t.metricKey).filter(Boolean));
  const usedInMonthly = new Set();
  for(const month of Object.keys(STATE.monthly)){
    for(const key of Object.keys(STATE.monthly[month])){
      if(STATE.monthly[month][key] > 0) usedInMonthly.add(key);
    }
  }
  return METRICS.filter(m => usedByTasks.has(m.key) || usedInMonthly.has(m.key));
}

// --- Default Data ---
function defaultSlots(){
  const s=[];
  for(const d of DAYS.slice(0,5)){
    s.push({id:`${d}|morning`,day:d,zoneId:'morning'});
    s.push({id:`${d}|noon`,day:d,zoneId:'noon'});
    s.push({id:`${d}|evening`,day:d,zoneId:'evening'});
  }
  s.push({id:'週六|sat',day:'週六',zoneId:'sat'});
  s.push({id:'週日|sun',day:'週日',zoneId:'sun'});
  return s;
}

function seedTasks(){
  const now=Date.now();
  const mk=(title,category,estMins,metricKey)=>({id:uid(),title,category,estMins,done:false,notes:'',createdAt:now,metricKey:metricKey||null});
  return [
    mk('Agent閱讀（30-60頁）','agent',60,'agent_read'),
    mk('章節筆記整理（1頁）','writing',60,'writing'),
    mk('章節架構優化','writing',60,'writing'),
    mk('TOEIC 單字（30-50個）','toeic',30,'toeic_word'),
    mk('TOEIC 聽力','toeic',30,'toeic_listen'),
    mk('TOEIC 閱讀題型','toeic',40,'toeic_read'),
    mk('LeetCode（easy）','leetcode',45,'leetcode'),
    mk('LeetCode（medium）','leetcode',60,'leetcode'),
    mk('系統設計影片＋1頁筆記','sysdesign',45,'sysdesign'),
    mk('運動（重訓/有氧）','fitness',45,'fitness'),
  ];
}

function emptyMonthly(){return {};}

function emptyState(){
  return {
    tasks: seedTasks(),
    slots: defaultSlots(),
    settings: { mirrorDone:true, autoSeed:true, zoneLabels:{}, metricTargets:{} },
    gist: { token:'', gistId:'' },
    monthly: emptyMonthly()
  };
}

// --- State ---
let STATE = emptyState();
let _undoSnapshot = null;

function snapshotForUndo(){
  _undoSnapshot = JSON.parse(JSON.stringify(STATE));
}

function restoreUndo(){
  if(!_undoSnapshot) return;
  STATE = _undoSnapshot;
  _undoSnapshot = null;
  render();
}

function addSeedTasksDeduped(){
  const existingTitles = new Set(STATE.tasks.map(t => t.title));
  const newTasks = seedTasks().filter(t => !existingTitles.has(t.title));
  STATE.tasks = [...newTasks, ...STATE.tasks];
}

// --- Persistence ---
function loadLocal(){
  try{
    const raw=localStorage.getItem(LOCAL_KEY);
    if(!raw) return emptyState();
    const p=JSON.parse(raw);
    return {
      tasks:Array.isArray(p.tasks)?p.tasks.map(t=>({metricKey:null,...t})):seedTasks(),
      slots:Array.isArray(p.slots)?p.slots:defaultSlots(),
      settings:{mirrorDone:true,autoSeed:true,zoneLabels:{},metricTargets:{},...p.settings},
      gist:p.gist||{token:'',gistId:''},
      monthly:p.monthly||emptyMonthly()
    };
  }catch{return emptyState();}
}

function saveLocal(){
  localStorage.setItem(LOCAL_KEY,JSON.stringify(STATE));
}
