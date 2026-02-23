// ============================================================
// GIST SYNC — Push / Pull to GitHub Gist
// ============================================================
async function gistPush(){
  const {token,gistId}=STATE.gist;
  if(!token) return {ok:false,msg:'未設定 Token'};
  const payload={tasks:STATE.tasks,slots:STATE.slots,settings:STATE.settings,monthly:STATE.monthly};
  const body={description:'SpyUA Weekly Planner Data',files:{'planner.json':{content:JSON.stringify(payload,null,2)}}};
  try{
    let url='https://api.github.com/gists';
    let method='POST';
    if(gistId){url+=`/${gistId}`;method='PATCH';}
    const res=await fetch(url,{method,headers:{'Authorization':`Bearer ${token}`,'Content-Type':'application/json','Accept':'application/vnd.github+json'},body:JSON.stringify(body)});
    if(!res.ok) return {ok:false,msg:`HTTP ${res.status}`};
    const data=await res.json();
    if(!gistId){STATE.gist.gistId=data.id;saveLocal();}
    return {ok:true,msg:'已同步至 Gist'};
  }catch(e){return {ok:false,msg:e.message};}
}

async function gistPull(){
  const {token,gistId}=STATE.gist;
  if(!token||!gistId) return {ok:false,msg:'未設定 Token 或 Gist ID'};
  try{
    const res=await fetch(`https://api.github.com/gists/${gistId}`,{headers:{'Authorization':`Bearer ${token}`,'Accept':'application/vnd.github+json'}});
    if(!res.ok) return {ok:false,msg:`HTTP ${res.status}`};
    const data=await res.json();
    const content=data.files?.['planner.json']?.content;
    if(!content) return {ok:false,msg:'Gist 中沒有 planner.json'};
    const parsed=JSON.parse(content);
    STATE.tasks=Array.isArray(parsed.tasks)?parsed.tasks:STATE.tasks;
    STATE.slots=Array.isArray(parsed.slots)?parsed.slots:STATE.slots;
    STATE.settings=parsed.settings||STATE.settings;
    STATE.monthly=parsed.monthly||STATE.monthly;
    saveLocal();
    return {ok:true,msg:'已從 Gist 拉取'};
  }catch(e){return {ok:false,msg:e.message};}
}
