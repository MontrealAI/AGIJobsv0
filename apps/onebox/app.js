// apps/onebox/app.js
const $ = s=>document.querySelector(s), chat=$('#chat'), box=$('#box'), mode=$('#mode');
const sendBtn=$('#send'), expertBtn=$('#expert'), saveBtn=$('#save'), orchInput=$('#orch'), tokInput=$('#tok'), connectBtn=$('#connect');
document.querySelectorAll('.pill').forEach(p=>p.onclick=()=>{box.value=p.dataset.example; box.focus();});

const COPY={
  planning:"Let me prepare this…",
  executing:"Publishing to the network… this usually takes a few seconds.",
  posted:(id,url)=>`✅ Job <b>#${id??'?'}</b> is live. ${url?`<a target="_blank" rel="noopener" href="${url}">Verify on chain</a>`:''}`,
  finalized:(id,url)=>`✅ Job <b>#${id}</b> finalized. ${url?`<a target="_blank" rel="noopener" href="${url}">Receipt</a>`:''}`,
  cancelled:"Okay, cancelled.",
  status:(s)=>`Job <b>#${s.jobId}</b> is <b>${s.state}</b>${s.reward?`. Reward ${s.reward}`:''}${s.token?` ${s.token}`:''}.`
};
const ERRORS={
  INSUFFICIENT_BALANCE:"You don’t have enough AGIALPHA to fund this job. Reduce the reward or top up.",
  INSUFFICIENT_ALLOWANCE:"Your wallet needs permission to use AGIALPHA. I can prepare an approval transaction.",
  IPFS_FAILED:"I couldn’t package your job details. Remove broken links and try again.",
  DEADLINE_INVALID:"That deadline is in the past. Pick at least 24 hours from now.",
  NETWORK_CONGESTED:"The network is busy; I’ll keep retrying for a moment.",
  RELAYER_DISABLED:"The relayer is offline. Ask the operator to enable it or switch to Expert Mode.",
  UNAUTHENTICATED:"This endpoint needs a valid API token. Check the Advanced settings.",
  JOB_ID_REQUIRED:"Tell me which job id to work with first.",
  MISSING_ORCHESTRATOR:"Set your orchestrator URL in Advanced.",
  NO_WALLET:"No EIP-1193 wallet detected. Install MetaMask, Rabby, or a compatible provider.",
  UNKNOWN:"Something went wrong. Try rephrasing your request or adjust the reward/deadline."
};

let EXPERT=false, ETH=null;
let ORCH=localStorage.getItem('ORCH_URL')||localStorage.getItem('onebox_orchestrator')||'', TOK=localStorage.getItem('ORCH_TOKEN')||localStorage.getItem('onebox_api_token')||'';
orchInput.value=ORCH; tokInput.value=TOK;

function add(role,html){const d=document.createElement('div');d.className='msg '+(role==='user'?'m-user':'m-assist');d.innerHTML=html;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function note(t){add('assist',`<div class="note">${t}</div>`)}
function setMode(){mode.textContent='Mode: '+(EXPERT?'Expert (wallet)':'Guest (walletless)')}

async function api(path, body){
  if(!ORCH){throw new Error('MISSING_ORCHESTRATOR')}
  const headers={'Content-Type':'application/json'}; if(TOK) headers['Authorization']='Bearer '+TOK;
  const r=await fetch(ORCH+path,{method: body? 'POST':'GET',headers,body: body? JSON.stringify(body):undefined});
  if(!r.ok){
    let code='UNKNOWN';
    let human;
    try{
      const payload=await r.json();
      if(payload){
        if(typeof payload.error==='string') code=payload.error.toUpperCase();
        else if(typeof payload.detail==='string') code=payload.detail.toUpperCase();
        if(typeof payload.message==='string') human=payload.message;
      }
    }catch{
      try{
        const text=await r.text();
        if(text) code=text.toUpperCase();
      }catch{}
    }
    const error=new Error(code);
    if(human) error.humanMessage=human;
    throw error;
  }
  return await r.json();
}

function confirmUI(summary,intent){
  add('assist', summary + `<div class="row" style="margin-top:10px">
    <button class="pill ok" id="yes">Yes</button><button class="pill" id="no">Cancel</button></div>`);
  setTimeout(()=>{
    document.getElementById('yes').onclick=()=>execute(intent);
    document.getElementById('no').onclick=()=>add('assist', COPY.cancelled);
  },0);
}

async function plan(text){
  add('assist', COPY.planning);
  const j=await api('/onebox/plan',{text,expert:EXPERT});
  return j;
}

async function execute(intent){
  add('assist', COPY.executing);
  const mode = EXPERT ? 'wallet' : 'relayer';
  const j=await api('/onebox/execute',{intent,mode});

  // Expert: sign via EIP-1193
  if(EXPERT && j.to && j.data){
    if(!ETH) throw new Error('NO_WALLET');
    const from=(await ETH.request({method:'eth_requestAccounts'}))[0];
    const txHash=await ETH.request({method:'eth_sendTransaction',params:[{from,to:j.to,data:j.data,value:j.value||'0x0'}]});
    const url=(j.receiptUrl||'').replace(/0x[0-9a-fA-F]{64}.?$/, txHash);
    if(intent.action==='finalize_job') add('assist', COPY.finalized(j.jobId||'?', url||''));
    else add('assist', COPY.posted(j.jobId||'?', url||''));
    return;
  }
  if(intent.action==='finalize_job') add('assist', COPY.finalized(j.jobId, j.receiptUrl||''));
  else add('assist', COPY.posted(j.jobId, j.receiptUrl||''));
}

async function go(){
  const text=box.value.trim(); if(!text) return;
  add('user', text); box.value='';
  try{
    const {summary,intent} = await plan(text);
    // status shortcut
    if(intent.action==='check_status'){
      const idMatch = text.match(/\d+/); const jobId = intent.payload.jobId || (idMatch? parseInt(idMatch[0],10):0);
      const s = await api(`/onebox/status?jobId=${jobId}`);
      add('assist', COPY.status(s)); return;
    }
    confirmUI(summary,intent);
  }catch(e){handleError(e)}
}

function handleError(e){
  if(e.humanMessage){
    add('assist','⚠️ '+e.humanMessage);
    return;
  }
  const upper=(e.message||'').toUpperCase();
  const key = Object.keys(ERRORS).find(k=> upper.includes(k)) || 'UNKNOWN';
  add('assist','⚠️ '+ERRORS[key]);
}

sendBtn.onclick=go; box.onkeydown=e=>{if(e.key==='Enter') go()};
expertBtn.onclick=()=>{EXPERT=!EXPERT; setMode()};
saveBtn.onclick=()=>{ORCH=orchInput.value.trim(); TOK=tokInput.value.trim(); localStorage.setItem('ORCH_URL',ORCH); localStorage.setItem('ORCH_TOKEN',TOK); localStorage.setItem('onebox_orchestrator',ORCH); localStorage.setItem('onebox_api_token',TOK); note('Saved.')};
connectBtn.onclick=async()=>{
  if(window.ethereum){ETH=window.ethereum; try{await ETH.request({method:'eth_requestAccounts'}); note('Wallet connected.');}catch{}}
  else{note('No EIP‑1193 provider found.')}
};
setMode();
