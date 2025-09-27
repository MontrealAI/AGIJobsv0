// apps/onebox/app.js
const $ = s=>document.querySelector(s), chat=$('#chat'), box=$('#box'), mode=$('#mode');
const sendBtn=$('#send'), expertBtn=$('#expert'), saveBtn=$('#save'), orchInput=$('#orch'), tokInput=$('#tok'), connectBtn=$('#connect');
document.querySelectorAll('.pill').forEach(p=>p.onclick=()=>box.value=p.dataset.example);

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
  RELAYER_NOT_CONFIGURED:"The orchestrator isn’t configured to relay transactions yet. Ask the operator to set ONEBOX_RELAYER_PRIVATE_KEY.",
  JOB_ID_REQUIRED:"I need a job ID to continue. Include the job number in your request.",
  REQUEST_EMPTY:"Please describe what you need before sending.",
  UNSUPPORTED_ACTION:"That action isn’t available yet. Try posting, checking status, or finalizing jobs.",
  UNKNOWN:"Something went wrong. Try rephrasing your request or adjust the reward/deadline."
};

let EXPERT=false, ETH=null;
let ORCH=localStorage.getItem('ORCH_URL')||'', TOK=localStorage.getItem('ORCH_TOKEN')||'';
orchInput.value=ORCH; tokInput.value=TOK;

function add(role,html){const d=document.createElement('div');d.className='msg '+(role==='user'?'m-user':'m-assist');d.innerHTML=html;chat.appendChild(d);chat.scrollTop=chat.scrollHeight}
function note(t){add('assist',`<div class="note">${t}</div>`)}
function setMode(){mode.textContent='Mode: '+(EXPERT?'Expert (wallet)':'Guest (walletless)')}

async function api(path, body){
  if(!ORCH){throw new Error('Set your Orchestrator URL in Advanced')}
  const headers={'Content-Type':'application/json'}; if(TOK) headers['Authorization']='Bearer '+TOK;
  const r=await fetch(ORCH+path,{method: body? 'POST':'GET',headers,body: body? JSON.stringify(body):undefined});
  if(!r.ok){
    let code='UNKNOWN';
    try{
      const raw=await r.text();
      if(raw){
        try{
          const parsed=JSON.parse(raw);
          if(typeof parsed==='string') code=parsed;
          else if(parsed && typeof parsed==='object'){
            if(typeof parsed.error==='string') code=parsed.error;
            else if(typeof parsed.detail==='string') code=parsed.detail;
            else if(parsed.detail && typeof parsed.detail==='object' && typeof parsed.detail.error==='string') code=parsed.detail.error;
          }
        }catch{
          code=raw.trim()||'UNKNOWN';
        }
      }
    }catch{}
    throw new Error(code.toUpperCase());
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
    // The server's receiptUrl likely has a {tx} pattern; we replace tail if provided
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
  const upper=(e.message||'').toUpperCase();
  const key = Object.keys(ERRORS).find(k=> upper.includes(k)) || 'UNKNOWN';
  add('assist','⚠️ '+ERRORS[key]);
}

sendBtn.onclick=go; box.onkeydown=e=>{if(e.key==='Enter') go()};
expertBtn.onclick=()=>{EXPERT=!EXPERT; setMode()};
saveBtn.onclick=()=>{ORCH=orchInput.value.trim(); TOK=tokInput.value.trim(); localStorage.setItem('ORCH_URL',ORCH); localStorage.setItem('ORCH_TOKEN',TOK); note('Saved.')};
connectBtn.onclick=async()=>{
  if(window.ethereum){ETH=window.ethereum; try{await ETH.request({method:'eth_requestAccounts'}); note('Wallet connected.');}catch{}}
  else{note('No EIP‑1193 provider found.')}
};
setMode();
