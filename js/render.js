// ============================================================
// RENDERING — All UI render functions
// ============================================================
let currentTab = 'board';
let filterCat = 'all';
let searchQuery = '';
let dragTaskId = null;
let selectedMonth = (() => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; })();
let _editingTaskId = null;
let _editingTargets = false;
let _newTaskCat = 'agent';
let _editingCat = null;

function icon(name,cls=''){return `<svg class="${cls}" width="16" height="16"><use href="#ico-${name}"/></svg>`}

function renderMetricSelect(cat, selectedKey, idAttr){
  const metrics=getMetricsForCategory(cat);
  if(metrics.length===0) return `<input type="hidden" id="${idAttr}" value="">`;
  if(metrics.length===1) return `<div class="form-group" style="margin-bottom:.5rem"><label>對應指標</label><span class="badge ${metrics[0].color}">${metrics[0].label}</span><input type="hidden" id="${idAttr}" value="${metrics[0].key}"></div>`;
  return `<div class="form-group" style="margin-bottom:.5rem"><label>對應指標</label><select id="${idAttr}">${metrics.map(m=>`<option value="${m.key}" ${m.key===selectedKey?'selected':''}>${m.label}</option>`).join('')}</select></div>`;
}

function renderEditTaskForm(t){
  const editCat=_editingCat||t.category;
  return `<div class="task-item editing">
    <div class="form-group" style="margin-bottom:.5rem"><label class="sr-only">標題</label><input type="text" id="edit_title_${t.id}" value="${esc(t.title)}" placeholder="標題"></div>
    <div class="form-row" style="margin-bottom:.5rem">
      <div class="form-group" style="margin-bottom:0"><label class="sr-only">分類</label><select id="edit_cat_${t.id}" onchange="_editingCat=this.value;render()">${CATEGORIES.map(c=>`<option value="${c.key}" ${editCat===c.key?'selected':''}>${c.label}</option>`).join('')}</select></div>
      <div class="form-group" style="margin-bottom:0"><label class="sr-only">預估分鐘</label><input type="number" id="edit_mins_${t.id}" value="${t.estMins||''}" placeholder="分鐘"></div>
    </div>
    ${renderMetricSelect(editCat, t.metricKey, 'edit_metric_'+t.id)}
    <div class="form-group" style="margin-bottom:.5rem"><label class="sr-only">備註</label><textarea id="edit_notes_${t.id}" placeholder="備註">${esc(t.notes||'')}</textarea></div>
    <div class="flex gap-1">
      <button class="btn sm primary" onclick="saveEditTask('${t.id}')">儲存</button>
      <button class="btn sm" onclick="cancelEditTask()">取消</button>
    </div>
  </div>`;
}

// --- Focus save / restore (fixes search defocus bug) ---
let _savedFocus = null;
function saveFocus(){
  const el = document.activeElement;
  if(!el || el===document.body) { _savedFocus=null; return; }
  _savedFocus = {
    id: el.id || null,
    selStart: el.selectionStart ?? null,
    selEnd: el.selectionEnd ?? null,
  };
}
function restoreFocus(){
  if(!_savedFocus) return;
  const f = _savedFocus;
  _savedFocus = null;
  if(!f.id) return;
  requestAnimationFrame(()=>{
    const el = document.getElementById(f.id);
    if(!el) return;
    el.focus();
    if(f.selStart!==null && typeof el.setSelectionRange==='function'){
      try{ el.setSelectionRange(f.selStart,f.selEnd); }catch(e){}
    }
  });
}

// --- Computed helpers ---
function computeProgress(){
  const assigned=STATE.slots.filter(s=>s.taskId);
  const total=assigned.length;
  if(!total)return{total:0,done:0,pct:0};
  const done=assigned.filter(s=>{
    const t=STATE.tasks.find(x=>x.id===s.taskId);
    return(s.done||false)||(t?.done||false);
  }).length;
  return{total,done,pct:Math.round(done/total*100)};
}

function getFiltered(){
  const q=searchQuery.trim().toLowerCase();
  return STATE.tasks
    .filter(t=>filterCat==='all'||t.category===filterCat)
    .filter(t=>!q||t.title.toLowerCase().includes(q)||(t.notes||'').toLowerCase().includes(q))
    .sort((a,b)=>Number(!!a.done)-Number(!!b.done)||b.createdAt-a.createdAt);
}

function getUnassigned(){
  const assignedIds=new Set(STATE.slots.map(s=>s.taskId).filter(Boolean));
  return getFiltered().filter(t=>!assignedIds.has(t.id));
}

function getMonthData(m){return STATE.monthly[m]||{};}

function getYearlyTotal(metricKey,year){
  let sum=0;
  for(let m=1;m<=12;m++){
    const key=`${year}-${String(m).padStart(2,'0')}`;
    sum+=(STATE.monthly[key]?.[metricKey]||0);
  }
  return sum;
}

// --- Main render ---
function render(){
  saveFocus();
  saveLocal();
  renderHeader();
  renderTabs();
  renderContent();
  restoreFocus();
}

function renderHeader(){
  const prog = computeProgress();
  document.getElementById('headerActions').innerHTML = `
    <div class="flex items-center gap-1 flex-wrap">
      <button class="btn sm" onclick="toggleTheme()" id="themeBtn" title="切換亮/暗色" aria-label="切換亮色或暗色主題">${document.documentElement.getAttribute('data-theme')==='light'?'🌙 暗色':'☀️ 亮色'}</button>
      <div aria-live="polite"><span class="badge green">${prog.done}/${prog.total}（${prog.pct}%）</span></div>
      <div style="width:120px"><div class="progress-bar"><div class="fill" style="width:${prog.pct}%"></div></div></div>
      <button class="btn sm" onclick="doExport()" aria-label="匯出資料">${icon('download')} 匯出</button>
      <button class="btn sm" onclick="document.getElementById('importFile').click()" aria-label="匯入資料">${icon('upload')} 匯入</button>
      <input type="file" id="importFile" accept=".json" class="hidden" onchange="doImport(event)">
      <button class="btn sm" onclick="doReset()" aria-label="重置本週排程">${icon('refresh')} 重置</button>
      <button class="btn sm" onclick="restoreUndo()" aria-label="復原上一步操作">${icon('refresh')} 復原</button>
    </div>`;
}

function renderTabs(){
  const tabs = [
    {id:'board',label:'📅 週排程'},
    {id:'monthly',label:'📆 月紀錄'},
    {id:'plan',label:'🎯 年度計畫'},
    {id:'tasks',label:'📋 任務池'},
    {id:'sync',label:'☁️ 同步'},
    {id:'settings',label:'⚙️ 設定'},
  ];
  document.getElementById('tabNav').innerHTML = `<div role="tablist">${tabs.map(t=>
    `<button class="tab ${currentTab===t.id?'active':''}" role="tab" aria-selected="${currentTab===t.id}" aria-controls="tabContent" tabindex="${currentTab===t.id?'0':'-1'}" onclick="switchTab('${t.id}')">${t.label}</button>`
  ).join('')}</div>`;
}

function switchTab(id){currentTab=id;render();}

function renderContent(){
  const el=document.getElementById('tabContent');
  let html='';
  if(currentTab==='board') html=renderBoard();
  else if(currentTab==='monthly') html=renderMonthlyPanel();
  else if(currentTab==='plan') html=renderPlanPanel();
  else if(currentTab==='tasks') html=renderTasksPanel();
  else if(currentTab==='sync') html=renderSyncPanel();
  else if(currentTab==='settings') html=renderSettingsPanel();
  el.innerHTML=`<div role="tabpanel" aria-labelledby="tab-${currentTab}">${html}</div>`;
}

// --- Board ---
function renderBoard(){
  const unassigned = getUnassigned();
  return `<div class="board-grid fade-in">
    <div class="card">
      <div class="card-header"><h2>📦 任務池</h2><span class="badge">未排：${unassigned.length}</span></div>
      <div class="card-body">
        <div class="form-group"><input type="text" id="search-input" placeholder="搜尋任務…" value="${esc(searchQuery)}" oninput="searchQuery=this.value;render()"></div>
        <div class="form-group">
          <select onchange="filterCat=this.value;render()">
            <option value="all" ${filterCat==='all'?'selected':''}>全部（${STATE.tasks.length}）</option>
            ${CATEGORIES.map(c=>`<option value="${c.key}" ${filterCat===c.key?'selected':''}>${c.label}（${STATE.tasks.filter(t=>t.category===c.key).length}）</option>`).join('')}
          </select>
        </div>
        <hr class="sep">
        <div style="max-height:500px;overflow-y:auto;display:flex;flex-direction:column;gap:.5rem">
          ${unassigned.length===0?'<div class="tip">所有任務都已排入時段 ✓</div>':unassigned.map(t=>renderTaskCard(t,true)).join('')}
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>📅 週排程</h2><span class="badge">拖曳任務到時段</span></div>
      <div class="card-body">
        ${renderStats()}
        <div class="week-grid">${DAYS.map(d=>renderDayCol(d)).join('')}</div>
        <hr class="sep">
        <div class="tip"><strong>策略提醒：</strong>早上＝高認知（Agent閱讀/寫作）· 中午＝累積型（TOEIC/LeetCode）· 晚上＝彈性深化 · 週末＝深度整合</div>
      </div>
    </div>
  </div>`;
}

function renderStats(){
  const prog=computeProgress();
  const catDone={};
  CATEGORIES.forEach(c=>{catDone[c.key]={total:0,done:0}});
  STATE.slots.forEach(s=>{
    if(!s.taskId)return;
    const t=STATE.tasks.find(x=>x.id===s.taskId);
    if(!t)return;
    catDone[t.category].total++;
    if(s.done||t.done)catDone[t.category].done++;
  });
  return `<div class="stats-row">
    <div class="stat-card"><div class="val" style="color:var(--accent)">${prog.pct}%</div><div class="label">完成率</div></div>
    ${CATEGORIES.slice(0,4).map(c=>{
      const d=catDone[c.key];
      return `<div class="stat-card"><div class="val" style="font-size:1.1rem">${d.done}/${d.total}</div><div class="label">${c.label}</div></div>`;
    }).join('')}
  </div>`;
}

function renderDayCol(day){
  const slots=STATE.slots.filter(s=>s.day===day).sort((a,b)=>{
    const order={morning:0,noon:1,evening:2,sat:3,sun:4};
    return (order[a.zoneId]||0)-(order[b.zoneId]||0);
  });
  return `<div class="day-col">
    <h3>${day}<span class="count">${slots.length} 時段</span></h3>
    <div class="slots">${slots.map(s=>renderSlot(s)).join('')}</div>
  </div>`;
}

function renderSlot(slot){
  const task=slot.taskId?STATE.tasks.find(t=>t.id===slot.taskId):null;
  const isDone=(slot.done||false)||(task?.done||false);
  const zi=zoneInfo(slot.zoneId);
  const cls=`slot ${task?'has-task':''} ${isDone?'done':''}`;
  const unassigned = getUnassigned();
  return `<div class="${cls}" data-slot-id="${esc(slot.id)}" ondragover="event.preventDefault();this.classList.add('drag-over')" ondragleave="this.classList.remove('drag-over')" ondrop="dropOnSlot(event,'${esc(slot.id)}');this.classList.remove('drag-over')">
    <div class="zone-label">${zi.emoji} ${zi.label}</div>
    ${task?`
      <div style="margin-top:.35rem">
        <span class="badge ${catInfo(task.category).color}">${catInfo(task.category).label}</span>
        ${task.estMins?`<span class="text-xs text-muted" style="margin-left:.3rem">約${task.estMins}分</span>`:''}
        <div class="task-title" style="${isDone?'text-decoration:line-through;opacity:.5':''}">${esc(task.title)}</div>
      </div>
      <div class="slot-actions">
        <button class="icon-btn ${isDone?'done-active':''}" onclick="toggleSlotDone('${esc(slot.id)}')" aria-label="標記完成">${icon('check')}</button>
        <button class="icon-btn" onclick="clearSlot('${esc(slot.id)}')" aria-label="清空時段">${icon('trash')}</button>
      </div>
    `:`<div class="slot-placeholder">拖曳任務到這裡</div>
      ${unassigned.length>0?`<select class="slot-assign-select" aria-label="選擇任務指派到此時段" onchange="if(this.value)assignTaskToSlot('${esc(slot.id)}',this.value)">
        <option value="">鍵盤指派…</option>
        ${unassigned.map(t=>`<option value="${t.id}">${esc(t.title)}</option>`).join('')}
      </select>`:''}`}
  </div>`;
}

function renderTaskCard(t,draggable=false){
  const ci=catInfo(t.category);
  if(_editingTaskId===t.id) return renderEditTaskForm(t);
  return `<div class="task-item ${t.done?'done':''}" ${draggable?`draggable="true" ondragstart="dragTaskId='${t.id}'" ontouchstart="onTaskTouchStart(event,'${t.id}')"`:''}>
    <div class="task-meta">
      <span class="badge ${ci.color}">${ci.label}</span>
      ${t.estMins?`<span class="text-xs text-muted">約${t.estMins}分</span>`:''}
    </div>
    <div class="task-title">${esc(t.title)}</div>
    ${t.notes?`<div class="task-notes">${esc(t.notes)}</div>`:''}
    <div class="task-actions">
      <button class="icon-btn" onclick="startEditTask('${t.id}')" aria-label="編輯任務">${icon('edit')}</button>
      <button class="icon-btn" onclick="toggleTaskDone('${t.id}')" aria-label="標記完成">${icon('check')}</button>
      <button class="icon-btn" onclick="deleteTask('${t.id}')" aria-label="刪除任務">${icon('trash')}</button>
    </div>
  </div>`;
}

// --- Monthly Panel ---
function renderMonthlyPanel(){
  const activeMetrics = getActiveMetrics();
  const [year,mon]=selectedMonth.split('-').map(Number);
  const data=getMonthData(selectedMonth);
  const monthLabel=`${year} 年 ${mon} 月`;

  return `<div class="fade-in" style="max-width:1060px;margin:0 auto">
    <div class="month-nav">
      <button class="btn sm" onclick="shiftMonth(-1)">◀</button>
      <div class="current-month">${monthLabel}</div>
      <button class="btn sm" onclick="shiftMonth(1)">▶</button>
      <button class="btn sm" onclick="toggleEditTargets()" style="margin-left:auto">✏️ 編輯目標</button>
    </div>

    ${_editingTargets?`<div class="card" style="margin-bottom:1rem">
      <div class="card-header"><h2>🎯 編輯指標目標</h2></div>
      <div class="card-body" style="overflow-x:auto">
        <table class="plan-table" style="width:100%">
          <thead><tr><th>指標</th><th>週目標</th><th>年目標</th></tr></thead>
          <tbody>
            ${activeMetrics.map(met=>{
              const targets=getMetricTargets(met.key);
              return `<tr>
                <td><span class="badge ${met.color}">${met.label}</span> <span class="text-xs text-muted">${met.unit}</span></td>
                <td><input type="number" id="mt_week_${met.key}" value="${targets.weekTarget}" min="0" style="width:80px" onfocus="this.select()"></td>
                <td><input type="number" id="mt_year_${met.key}" value="${targets.yearTarget}" min="0" style="width:80px" onfocus="this.select()"></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        <div class="flex gap-1 flex-wrap" style="margin-top:.75rem">
          <button class="btn primary sm" onclick="saveMetricTargets()">儲存</button>
          <button class="btn sm" onclick="cancelEditTargets()">取消</button>
          <button class="btn sm danger" onclick="if(confirm('確定重置所有目標為預設值？'))resetMetricTargets()" style="margin-left:auto">重置為預設</button>
        </div>
      </div>
    </div>`:''}

    ${activeMetrics.length===0?'<div class="tip">目前沒有任何指標。請先在任務池新增帶有指標的任務。</div>':''}

    <div class="metric-grid">
      ${activeMetrics.map(met=>{
        const val=data[met.key]||0;
        const targets=getMetricTargets(met.key);
        const monthTarget=Math.round(targets.weekTarget*4.33);
        const pct=monthTarget>0?Math.min(100,Math.round(val/monthTarget*100)):0;
        const barColor=`var(--${met.color})`;
        return `<div class="metric-card">
          <div class="mc-header">
            <div class="mc-label"><span class="badge ${met.color}">${met.label}</span></div>
            <div class="mc-target">月目標 ~${monthTarget} ${met.unit}</div>
          </div>
          <div class="mc-input-row">
            <button class="icon-btn" onclick="updateMetric('${selectedMonth}','${met.key}',-1)">−</button>
            <input type="number" value="${val}" min="0"
              onchange="updateMetric('${selectedMonth}','${met.key}',null,parseInt(this.value)||0)"
              onfocus="this.select()">
            <button class="icon-btn" onclick="updateMetric('${selectedMonth}','${met.key}',1)">＋</button>
            <span class="mc-unit">${met.unit}</span>
          </div>
          <div class="mc-bar">
            <div class="mc-bar-label"><span>${pct}%</span><span>${val}/${monthTarget}</span></div>
            <div class="progress-bar"><div class="fill" style="width:${pct}%;background:${barColor}"></div></div>
          </div>
        </div>`;
      }).join('')}
    </div>

    <div class="yearly-summary">
      <h3>📊 ${year} 年度累積進度</h3>
      ${activeMetrics.map(met=>{
        const total=getYearlyTotal(met.key,year);
        const targets=getMetricTargets(met.key);
        const pct=targets.yearTarget>0?Math.min(100,Math.round(total/targets.yearTarget*100)):0;
        const barColor=`var(--${met.color})`;
        return `<div class="yearly-row">
          <div class="yr-label"><span class="badge ${met.color}">${met.label}</span></div>
          <div class="yr-bar"><div class="yr-fill" style="width:${pct}%;background:${barColor}"></div></div>
          <div class="yr-nums">${total} / ${targets.yearTarget} ${met.unit}</div>
        </div>`;
      }).join('')}
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><h2>🗓️ ${year} 年各月一覽</h2></div>
      <div class="card-body">
        ${activeMetrics.map(met=>{
          const targets=getMetricTargets(met.key);
          return `<div style="margin-bottom:1rem">
            <div style="font-size:.85rem;font-weight:600;margin-bottom:.35rem;display:flex;align-items:center;gap:.4rem">
              <span class="badge ${met.color}">${met.label}</span>
              <span class="text-xs text-muted">年目標 ${targets.yearTarget} ${met.unit}</span>
            </div>
            <div class="month-history">
              ${MONTH_LABELS.map((ml,i)=>{
                const mKey=`${year}-${String(i+1).padStart(2,'0')}`;
                const v=STATE.monthly[mKey]?.[met.key]||0;
                const monthTarget=Math.round(targets.weekTarget*4.33);
                const ratio=monthTarget>0?v/monthTarget:0;
                const bg=ratio>=1?'rgba(61,214,140,.15)':ratio>=0.5?'rgba(240,152,62,.1)':'transparent';
                const isActive=mKey===selectedMonth;
                return `<div class="mh-cell ${isActive?'active':''}" style="background:${bg}" onclick="selectedMonth='${mKey}';render()">
                  <div class="mh-month">${ml}</div>
                  <div class="mh-val" style="color:${v>0?'var(--'+met.color+')':'var(--tx3)'}">${v}</div>
                </div>`;
              }).join('')}
            </div>
          </div>`;
        }).join('')}
      </div>
    </div>

    <div class="tip"><strong>使用方式：</strong>每天或每週更新數值（用 ＋/− 按鈕或直接輸入），月底回顧。資料會跟著 Gist 同步到其他裝置。</div>
  </div>`;
}

// --- Annual Plan Panel ---
function renderPlanPanel(){
  const now=new Date();
  const month=now.getMonth()+1;
  const currentQ=month<=3?1:month<=6?2:month<=9?3:4;

  return `<div class="fade-in" style="max-width:960px;margin:0 auto">
    <div class="plan-hero">
      <h2>📌 2026 年度計畫</h2>
      <div class="tagline">從「會寫程式的人」→「能定義 AI Agent 系統的技術作者與工程師」</div>
      <div style="margin-top:1rem;display:flex;justify-content:center;gap:.5rem;flex-wrap:wrap">
        <span class="badge ${currentQ===1?'blue':''}">Q1${currentQ===1?' ← 現在':''}</span>
        <span class="badge ${currentQ===2?'blue':''}">Q2${currentQ===2?' ← 現在':''}</span>
        <span class="badge ${currentQ===3?'blue':''}">Q3${currentQ===3?' ← 現在':''}</span>
        <span class="badge ${currentQ===4?'blue':''}">Q4${currentQ===4?' ← 現在':''}</span>
      </div>
    </div>

    <div class="card mb-1" style="margin-bottom:1rem">
      <div class="card-header"><h2>🎯 年度三大目標</h2></div>
      <div class="card-body">
        <table class="plan-table">
          <thead><tr><th>#</th><th>目標</th><th>關鍵結果</th><th>截止</th></tr></thead>
          <tbody>
            <tr><td><span class="badge blue">1</span></td><td><strong>出版 AI Agent 技術書</strong></td><td>完成初稿 → 進入出版流程</td><td>Q2</td></tr>
            <tr><td><span class="badge green">2</span></td><td><strong>英語能力突破</strong></td><td>TOEIC 達標</td><td>Q3</td></tr>
            <tr><td><span class="badge purple">3</span></td><td><strong>工程面試力</strong></td><td>LeetCode 150+ 題 ＋ 系統設計 20+ 案例</td><td>Q4</td></tr>
          </tbody>
        </table>
        <div style="margin-top:.5rem"><span class="badge cyan">輔助</span> <span class="text-sm text-muted">體態管理 — 全年維持運動習慣，體脂達標</span></div>
      </div>
    </div>

    ${renderQuarter(1,'Q1（1–3月）：打地基','知識吸收 ＋ 書目錄定稿','blue',[
      'Agent 書籍：讀完 6–8 本，建立筆記庫',
      '出書：完成目錄 V1 ＋ 10 篇核心觀點草稿',
      'TOEIC：單字量打底（每日 30–50 個）＋ 聽力訓練',
      'LeetCode：累積 30 題（Easy 為主）',
      '系統設計：看 12 部影片，每部 1 頁筆記',
      '運動：建立每週 4 次的固定節奏',
    ],['書目錄 V1 完成','LeetCode 30 題'],currentQ)}

    ${renderQuarter(2,'Q2（4–6月）：章節輸出 ＋ 初稿完成','90 天出書衝刺（Phase 2 & 3）','green',[
      '出書：每週 2 章 → 8–10 章初稿 → 重構 → 完整初稿',
      'Agent：持續追蹤最新論文與工具更新',
      'TOEIC：開始做閱讀題型 ＋ 模擬考',
      'LeetCode：累積至 70 題（Medium 比重拉高）',
      '系統設計：累積至 10 個案例',
    ],['完整書稿初稿','書封定位句'],currentQ)}

    ${renderQuarter(3,'Q3（7–9月）：出版推進 ＋ 英語衝刺','書稿校稿與投稿 ＋ TOEIC 考試','orange',[
      '出書：校稿、找推薦序、與出版社/自出版平台對接',
      'TOEIC：密集練習 → 報名考試 → 達標',
      'LeetCode：累積至 110 題（加入 Hard）',
      '系統設計：累積至 15 個案例，開始模擬面試',
    ],['TOEIC 達標','書稿送審'],currentQ)}

    ${renderQuarter(4,'Q4（10–12月）：面試準備 ＋ 品牌收割','工程面試全力衝刺 ＋ 書籍上市宣傳','purple',[
      'LeetCode：累積至 150+ 題，每週模擬面試',
      '系統設計：累積至 20+ 案例，能完整白板講解',
      '出書：配合出版節奏做宣傳（技術社群、文章、演講）',
      '建立「AI Agent 技術作者」的個人品牌',
    ],['LeetCode 150 題','書籍上市或定稿'],currentQ)}

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><h2>🔁 每週執行結構</h2></div>
      <div class="card-body" style="overflow-x:auto">
        <table class="plan-table" style="min-width:700px">
          <thead><tr><th>時段</th><th>週一</th><th>週二</th><th>週三</th><th>週四</th><th>週五</th><th>週六</th><th>週日</th></tr></thead>
          <tbody>
            <tr>
              <td><strong>早上 8–9</strong></td>
              <td><span class="badge blue">Agent 閱讀</span></td>
              <td><span class="badge blue">Agent 閱讀</span></td>
              <td><span class="badge blue">Agent 閱讀</span></td>
              <td><span class="badge green">章節筆記</span></td>
              <td><span class="badge green">架構優化</span></td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
            </tr>
            <tr>
              <td><strong>中午 11:40–13</strong></td>
              <td><span class="badge orange">TOEIC 單字</span></td>
              <td><span class="badge orange">TOEIC 閱讀</span></td>
              <td><span class="badge orange">TOEIC 聽力</span></td>
              <td><span class="badge red">LeetCode</span></td>
              <td><span class="badge red">LeetCode</span></td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
            </tr>
            <tr>
              <td><strong>晚上 21–22:30</strong></td>
              <td><span class="badge">自由排程</span></td>
              <td><span class="badge">自由排程</span></td>
              <td><span class="badge">自由排程</span></td>
              <td><span class="badge">自由排程</span></td>
              <td><span class="badge">自由排程</span></td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
            </tr>
            <tr>
              <td><strong>週末晚上</strong></td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
              <td class="text-muted">—</td>
              <td><span class="badge red">LC×2</span> <span class="badge purple">系統×1</span> <span class="badge green">書</span></td>
              <td><span class="badge purple">系統×2</span> <span class="badge blue">整合</span> <span class="badge">規劃</span></td>
            </tr>
          </tbody>
        </table>
        <div class="tip mt-1"><strong>原則：</strong>早上做高認知 → 中午做累積型 → 晚上彈性深化 → 週末做深度整合</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:1rem">
      <div class="card-header"><h2>📊 追蹤指標</h2></div>
      <div class="card-body" style="overflow-x:auto">
        <table class="plan-table">
          <thead><tr><th>指標</th><th>每週目標</th><th>每月累積</th><th>年度目標</th></tr></thead>
          <tbody>
            <tr><td><span class="badge blue">Agent 閱讀</span></td><td>5 次</td><td>~20 次</td><td>讀完 8–12 本</td></tr>
            <tr><td><span class="badge green">書章節產出</span></td><td>2 次整理 + 1 次優化</td><td>4–8 章</td><td>完整書稿</td></tr>
            <tr><td><span class="badge orange">TOEIC</span></td><td>單字 5 天 + 聽力 2 + 閱讀 2</td><td>—</td><td>達標分數</td></tr>
            <tr><td><span class="badge red">LeetCode</span></td><td>3 題</td><td>~12 題</td><td>150+ 題</td></tr>
            <tr><td><span class="badge purple">系統設計</span></td><td>3 影片 + 3 頁筆記</td><td>~12 案例</td><td>20+ 案例</td></tr>
            <tr><td><span class="badge cyan">運動</span></td><td>4 次</td><td>~16 次</td><td>全年不中斷</td></tr>
            <tr><td><span class="badge pink">飲食紀錄</span></td><td>7 天</td><td>30 天</td><td>全年持續</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="plan-grid-2" style="margin-bottom:1rem">
      <div class="belief-card">
        <div class="quote">「你不是在寫書，你是在寫未來三年的定位。」</div>
        每一章都是你對 AI Agent 領域的理解宣言。不是在交作業，是在建立權威。
      </div>
      <div class="belief-card">
        <div class="quote">「你要的是週完成率，不是某天爆發。」</div>
        每一週的微小累積，就是最強大的複利。先完成，再完美。
      </div>
    </div>
  </div>`;
}

function renderQuarter(num,title,focus,color,items,milestones,currentQ){
  const isCurrent=num===currentQ;
  return `<div class="quarter" style="margin-bottom:1rem;${isCurrent?'border-color:var(--'+color+');box-shadow:0 0 20px rgba(108,140,255,.08)':''}">
    <div class="quarter-header" onclick="this.parentElement.querySelector('.quarter-body').style.display=this.parentElement.querySelector('.quarter-body').style.display==='none'?'block':'none'">
      <h3><span class="q-badge badge ${color}">Q${num}</span> ${esc(title)} ${isCurrent?'<span class="badge green" style="margin-left:.5rem">← 目前</span>':''}</h3>
    </div>
    <div class="quarter-body">
      <div class="focus">主軸：${esc(focus)}</div>
      <ul>${items.map(i=>`<li>${esc(i)}</li>`).join('')}</ul>
      <div style="margin-top:.75rem;display:flex;flex-wrap:wrap;gap:.25rem">
        ${milestones.map(m=>`<span class="milestone">🏁 ${esc(m)}</span>`).join('')}
      </div>
    </div>
  </div>`;
}

// --- Tasks Panel ---
function renderTasksPanel(){
  const filtered=getFiltered();
  const assignedIds=new Set(STATE.slots.map(s=>s.taskId).filter(Boolean));
  return `<div class="board-grid fade-in">
    <div class="card">
      <div class="card-header"><h2>➕ 新增任務</h2></div>
      <div class="card-body">
        <div class="form-group"><label>標題</label><input type="text" id="nt_title" placeholder="例如：Agent閱讀（30-60頁）" onkeydown="if(event.key==='Enter')addTask()"></div>
        <div class="form-row">
          <div class="form-group"><label>分類</label><select id="nt_cat" onchange="_newTaskCat=this.value;render()">${CATEGORIES.map(c=>`<option value="${c.key}" ${_newTaskCat===c.key?'selected':''}>${c.label}</option>`).join('')}</select></div>
          <div class="form-group"><label>預估分鐘</label><input type="number" id="nt_mins" placeholder="45"></div>
        </div>
        ${renderMetricSelect(_newTaskCat, null, 'nt_metric')}
        <div class="form-group"><label>備註</label><textarea id="nt_notes" placeholder="可空"></textarea></div>
        <div class="flex gap-1">
          <button class="btn primary" onclick="addTask()">${icon('plus')} 新增</button>
          <button class="btn" onclick="addSeedTasks()">加入預設任務包</button>
        </div>
        <div class="tip mt-2"><strong>建議：</strong>任務標題要「可檢核」。例如：<em>LeetCode 1題（medium）</em></div>
      </div>
    </div>
    <div class="card">
      <div class="card-header"><h2>📋 全部任務</h2><span class="badge">${STATE.tasks.length} 個</span></div>
      <div class="card-body">
        <div class="form-row mb-1">
          <input type="text" id="search-input" placeholder="搜尋…" value="${esc(searchQuery)}" oninput="searchQuery=this.value;render()">
          <select onchange="filterCat=this.value;render()">
            <option value="all">全部</option>
            ${CATEGORIES.map(c=>`<option value="${c.key}" ${filterCat===c.key?'selected':''}>${c.label}</option>`).join('')}
          </select>
        </div>
        <hr class="sep">
        <div style="max-height:600px;overflow-y:auto;display:flex;flex-direction:column;gap:.5rem">
          ${filtered.map(t=>{
            const ci=catInfo(t.category);
            const scheduled=assignedIds.has(t.id);
            if(_editingTaskId===t.id) return renderEditTaskForm(t);
            return `<div class="task-item ${t.done?'done':''}">
              <div class="task-meta">
                <span class="badge ${ci.color}">${ci.label}</span>
                ${t.estMins?`<span class="text-xs text-muted">約${t.estMins}分</span>`:''}
                ${scheduled?'<span class="badge green">已排程</span>':'<span class="badge">未排程</span>'}
              </div>
              <div class="task-title">${esc(t.title)}</div>
              ${t.notes?`<div class="task-notes">${esc(t.notes)}</div>`:''}
              <div class="task-actions">
                <button class="icon-btn" onclick="startEditTask('${t.id}')" aria-label="編輯任務">${icon('edit')}</button>
                <button class="icon-btn" onclick="toggleTaskDone('${t.id}')" aria-label="標記完成">${icon('check')}</button>
                <button class="icon-btn" onclick="deleteTask('${t.id}')" aria-label="刪除任務">${icon('trash')}</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
  </div>`;
}

// --- Sync Panel ---
function renderSyncPanel(){
  const hasToken=!!STATE.gist.token;
  const hasId=!!STATE.gist.gistId;
  return `<div class="fade-in" style="max-width:640px">
    <div class="card">
      <div class="card-header"><h2>☁️ GitHub Gist 同步</h2></div>
      <div class="card-body">
        <div class="sync-panel">
          <div class="sync-status"><span class="dot ${hasToken&&hasId?'connected':'disconnected'}"></span>
            ${hasToken&&hasId?'已連線（Gist ID: '+STATE.gist.gistId.slice(0,8)+'…）':'未連線'}
          </div>
        </div>
        <div class="form-group"><label>GitHub Personal Access Token</label>
          <input type="password" id="gist_token" value="${esc(STATE.gist.token)}" placeholder="ghp_xxxx…（需要 gist scope）">
          <div class="text-xs text-muted mt-1">到 GitHub → Settings → Developer settings → Personal access tokens → 勾選 <code>gist</code> scope</div>
        </div>
        <div class="form-group"><label>Gist ID（首次留空，會自動建立）</label>
          <input type="text" id="gist_id" value="${esc(STATE.gist.gistId)}" placeholder="首次同步會自動產生">
        </div>
        <div class="flex gap-1 flex-wrap">
          <button class="btn primary" onclick="saveGistConfig()">儲存設定</button>
          <button class="btn" onclick="doPush()">⬆️ 推送到 Gist</button>
          <button class="btn" onclick="doPull()">⬇️ 從 Gist 拉取</button>
        </div>
        <div id="syncMsg" class="mt-2 text-sm"></div>
        <hr class="sep">
        <div class="tip">
          <strong>跨裝置同步流程：</strong><br>
          1. 在裝置 A 設定 Token → 推送<br>
          2. 在裝置 B 設定同一個 Token + Gist ID → 拉取<br>
          3. 之後只要「推送」/「拉取」就能同步
        </div>
      </div>
    </div>
  </div>`;
}

// --- Settings Panel ---
function renderSettingsPanel(){
  return `<div class="fade-in" style="max-width:640px">
    <div class="card">
      <div class="card-header"><h2>⚙️ 行為設定</h2></div>
      <div class="card-body">
        <div class="setting-row">
          <div class="info"><div class="title">時段完成 ＝ 任務完成（同步）</div><div class="desc">勾選時段完成時，同步把任務標記完成</div></div>
          <label class="toggle"><input type="checkbox" aria-label="時段完成同步任務完成" ${STATE.settings.mirrorDone?'checked':''} onchange="STATE.settings.mirrorDone=this.checked;saveLocal()"><span class="slider"></span></label>
        </div>
        <div class="setting-row">
          <div class="info"><div class="title">重置本週時，自動補預設任務</div><div class="desc">適合每週重新排一次，保持節奏</div></div>
          <label class="toggle"><input type="checkbox" aria-label="重置時自動補預設任務" ${STATE.settings.autoSeed?'checked':''} onchange="STATE.settings.autoSeed=this.checked;saveLocal()"><span class="slider"></span></label>
        </div>
        <hr class="sep">
        <h3 style="font-size:.95rem;font-weight:600;margin-bottom:.75rem">🕐 時段時間設定</h3>
        <div class="zone-label-settings">
          ${ZONES.map(z=>`<div class="zone-label-row">
            <span>${z.emoji}</span>
            <input type="text" value="${esc(STATE.settings.zoneLabels?.[z.id]||z.label)}" onchange="updateZoneLabel('${z.id}',this.value)">
          </div>`).join('')}
        </div>
        <hr class="sep">
        <div class="flex gap-1 flex-wrap">
          <button class="btn" onclick="doReset()">${icon('refresh')} 重置本週</button>
          <button class="btn danger" onclick="if(confirm('確定清空全部？'))doClearAll()">🗑️ 清空全部</button>
        </div>
        <hr class="sep">
        <div class="tip">
          <strong>建議用法：</strong><br>
          ① 週日晚上重置 → 把最重要任務先排進「早上」<br>
          ② 平日照表執行，不要臨時加太多<br>
          ③ 週六集中清掉高認知任務
        </div>
      </div>
    </div>
  </div>`;
}
