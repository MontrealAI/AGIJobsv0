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
  UNKNOWN:"Something went wrong. Try rephrasing your request or adjust the reward/deadline."
};

let EXPERT=false, ETH=null;
let ORCH=localStorage.getItem('ORCH_URL')||'', TOK=localStorage.getItem('ORCH_TOKEN')||'';
orchInput.value=ORCH; tokInput.value=TOK;

function escapeHtml(str){
  const div=document.createElement('div');
  div.textContent=str??'';
  return div.innerHTML;
}

function unescapeHtml(str){
  const div=document.createElement('div');
  div.innerHTML=str??'';
  return div.textContent||'';
}

function add(role,content){
  const d=document.createElement('div');
  d.className='msg '+(role==='user'?'m-user':'m-assist');
  if(content && typeof content==='object' && 'nodeType' in content){
    d.appendChild(content);
  }else{
    d.innerHTML=content;
  }
  chat.appendChild(d);
  chat.scrollTop=chat.scrollHeight;
  return d;
}
function note(t){add('assist',`<div class="note">${t}</div>`)}
function setMode(){mode.textContent='Mode: '+(EXPERT?'Expert (wallet)':'Guest (walletless)')}

async function api(path, body){
  if(!ORCH){throw new Error('Set your Orchestrator URL in Advanced')}
  const headers={'Content-Type':'application/json'}; if(TOK) headers['Authorization']='Bearer '+TOK;
  const r=await fetch(ORCH+path,{method: body? 'POST':'GET',headers,body: body? JSON.stringify(body):undefined});
  if(!r.ok){
    let msg='UNKNOWN'; try{msg=(await r.text())||'UNKNOWN'}catch{}
    throw new Error(msg.toUpperCase());
  }
  return await r.json();
}

function confirmUI(summary,intent){
  const content=document.createElement('div');
  const text=document.createElement('div');
  text.textContent=unescapeHtml(summary??'');
  content.appendChild(text);

  const row=document.createElement('div');
  row.className='row';
  row.style.marginTop='10px';

  const yes=document.createElement('button');
  yes.className='pill ok';
  yes.setAttribute('data-role','confirm');
  yes.textContent='Yes';

  const no=document.createElement('button');
  no.className='pill';
  no.setAttribute('data-role','cancel');
  no.textContent='Cancel';

  row.appendChild(yes);
  row.appendChild(no);
  content.appendChild(row);

  const message=add('assist', content);
  const confirmBtn=message.querySelector('[data-role="confirm"]');
  const cancelBtn=message.querySelector('[data-role="cancel"]');

  if(confirmBtn) confirmBtn.onclick=()=>execute(intent);
  if(cancelBtn) cancelBtn.onclick=()=>add('assist', COPY.cancelled);
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
  add('user', escapeHtml(text)); box.value='';
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
