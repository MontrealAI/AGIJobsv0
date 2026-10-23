// SPDX-License-Identifier: MIT
'use strict';
const assert=require('node:assert/strict'),crypto=require('node:crypto');
const PREFIX='https://api.github.com/repos/MontrealAI/AGI-Alpha-Agent-v0/';
const sha=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function safeHeaders(headers) {
  const result={};
  for(const name of ['x-ratelimit-limit','x-ratelimit-remaining','x-ratelimit-reset','retry-after']) {
    const value=headers?.get(name);if(value!==null&&value!==undefined&&/^[0-9]{1,20}$/.test(value))result[name]=value;
  }
  for(const name of ['x-ratelimit-resource','content-type']) {
    const value=headers?.get(name);if(value&&/^[A-Za-z0-9.+;= /_-]{1,100}$/.test(value))result[name]=value;
  }
  const id=headers?.get('x-github-request-id');if(id&&/^[A-Fa-f0-9:]{1,128}$/.test(id))result['x-github-request-id']=id;
  const date=headers?.get('date');if(date&&Number.isFinite(Date.parse(date)))result.date=new Date(date).toISOString();
  return result;
}
async function failureDiagnostic(url,response) {
  const diagnostic={schema:'agijobsv0/anonymous-alpha-metadata-failure/v1',method:'GET',url,
    authentication:'anonymous',requestContext:'current observation; original 40000272763 response details unavailable',
    status:response.status,headers:safeHeaders(response.headers),body:{state:'unavailable'}};
  const chunks=[];let bytes=0,reader;
  try {
    reader=response.body?.getReader();
    if(reader) {
      while(bytes<8193) {const item=await reader.read();if(item.done)break;
        const remaining=8193-bytes,part=Buffer.from(item.value).subarray(0,remaining);chunks.push(part);bytes+=part.length;}
      const raw=Buffer.concat(chunks),truncated=raw.length>8192;
      diagnostic.body={state:'bounded-redacted',observedBytes:Math.min(raw.length,8192),truncated,
        observedSha256:sha(raw.subarray(0,8192))};
      if(!truncated) {
        let value;try{value=JSON.parse(raw.toString('utf8'));}catch{}
        if(value&&typeof value==='object'&&!Array.isArray(value)) {
          const message=typeof value.message==='string'?value.message:'';
          const classes=[['API rate limit exceeded','API rate limit exceeded'],['You have exceeded a secondary rate limit','Secondary rate limit exceeded'],
            ['Resource not accessible by integration','Resource not accessible by integration'],['Resource not accessible by personal access token','Resource not accessible by personal access token'],
            ['Bad credentials','Bad credentials'],['Not Found','Not Found'],['Forbidden','Forbidden']];
          for(const [prefix,label]of classes)if(message.startsWith(prefix)){diagnostic.body.messageClass=label;break;}
          if(typeof value.status==='string'&&/^[1-5][0-9]{2}$/.test(value.status))diagnostic.body.reportedStatus=value.status;
          if(typeof value.documentation_url==='string') {
            try {const doc=new URL(value.documentation_url);
              if(doc.protocol==='https:'&&doc.hostname==='docs.github.com'&&!doc.username&&!doc.password&&!doc.search&&!doc.hash&&
                /^\/[A-Za-z0-9/_-]{0,512}$/.test(doc.pathname))diagnostic.body.documentationUrl=doc.href;
            }catch{}
          }
        }
      }
    }
  } catch {diagnostic.body={state:'read-unavailable'};}
  finally{if(reader)try{await reader.cancel();}catch{}}
  return diagnostic;
}
function anonymousRoute(url,options) {
  if(typeof url!=='string'||!url.startsWith(PREFIX))return false;
  const route=url.slice(PREFIX.length),headers=new Headers(options?.headers);
  if(headers.has('authorization'))return false;
  assert.ok(/^[A-Za-z0-9_./?=&%-]+$/.test(route)&&!route.startsWith('/')&&!route.includes('..'));
  assert.ok(!route.includes('/zip')&&!route.startsWith('git/blobs/')&&!route.startsWith('contents/'));
  assert.ok(options?.method===undefined||options.method==='GET');
  assert.equal(options?.redirect,'error');return true;
}
function diagnosticFetch(fetcher,{observe=()=>{}}={}) {
  assert.equal(typeof fetcher,'function');assert.equal(typeof observe,'function');
  return async(url,options)=>{
    const selected=anonymousRoute(url,options),response=await fetcher(url,options);
    if(selected&&!response.ok) {
      const diagnostic=await failureDiagnostic(url,response);await observe(diagnostic);
      const error=new Error('Anonymous Alpha metadata read failed: '+JSON.stringify(diagnostic));
      error.diagnostic=diagnostic;throw error;
    }
    return response;
  };
}
async function withAnonymousDiagnostics(operation,{observe=()=>{}}={}) {
  assert.equal(typeof operation,'function');const original=global.fetch,wrapped=diagnosticFetch(original,{observe});
  global.fetch=wrapped;
  try{return await operation();}finally{const observed=global.fetch;global.fetch=original;assert.equal(observed,wrapped,'Concurrent fetch replacement is refused');}
}
module.exports={PREFIX,safeHeaders,failureDiagnostic,anonymousRoute,diagnosticFetch,withAnonymousDiagnostics};
