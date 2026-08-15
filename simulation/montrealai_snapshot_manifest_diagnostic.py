from __future__ import annotations

import json,re,time,urllib.error,urllib.parse,urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path

CONTRACT="0x495f947276749ce646f68ac8c248420045cb7b5e"
CREATOR="0x054a2e4b3b5ea2c62372e92358fdf7fb74b4f34a"
BLOCKSCOUT="https://eth.blockscout.com"
UA="MONTREAL.AI-Becoming-Omega-Diagnostic/1.0 (+https://montreal.ai)"
RX=re.compile(r"^Crypto AI Art\s*#\s*0*(\d+)\s*$",re.I)

def token_id(index:int)->int:return (int(CREATOR,16)<<96)|(index<<40)|1

def get_json(url:str,attempts:int=4):
    last=None
    for i in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
            with urllib.request.urlopen(req,timeout=45) as r:return json.loads(r.read().decode())
        except Exception as e:
            last=e;time.sleep(min(8,.5*2**i))
    return {"_error":repr(last),"_url":url}

def normalise(tid,name,source,index_hint=None):
    try:t=int(str(tid),0)
    except:return None
    if not isinstance(name,str):return None
    m=RX.match(name.strip())
    if not m:return None
    n=int(m.group(1))
    if not 1<=n<=556:return None
    return {"canonical_number":n,"name":name,"token_id_decimal":str(t),"token_id_hex":f"0x{t:064x}","creator_index":((t>>32)&((1<<64)-1))>>8,"encoded_supply":t&((1<<32)-1),"source":source,"index_hint":index_hint}

def metadata(index):
    tid=str(token_id(index));out=[]
    urls=[(f"https://api.opensea.io/api/v1/metadata/{CONTRACT}/{tid}","opensea-v1-metadata"),(f"{BLOCKSCOUT}/api/v2/tokens/{CONTRACT}/instances/{tid}","blockscout-instance")]
    raw=[]
    for url,source in urls:
        d=get_json(url,3);raw.append({"source":source,"response":d})
        if isinstance(d,dict):
            md=d.get("metadata") if isinstance(d.get("metadata"),dict) else d
            r=normalise(tid,md.get("name") if isinstance(md,dict) else None,source,index)
            if r:out.append(r)
    return index,out,raw

def opensea_collection():
    out=[];raw=[];cursor=None
    for page in range(10):
        q={"limit":"200"}
        if cursor:q["next"]=cursor
        url=f"https://api.opensea.io/api/v2/collection/montrealai/nfts?{urllib.parse.urlencode(q)}"
        d=get_json(url,2);raw.append({"page":page+1,"response_type":type(d).__name__,"keys":sorted(d) if isinstance(d,dict) else [],"error":d.get("_error") if isinstance(d,dict) else None})
        if not isinstance(d,dict) or not isinstance(d.get("nfts"),list):break
        for x in d["nfts"]:
            if isinstance(x,dict):
                r=normalise(x.get("identifier") or x.get("token_id"),x.get("name"),"opensea-v2-collection")
                if r:out.append(r)
        cursor=d.get("next")
        if not cursor:break
    return out,raw

def creator_transfers():
    url=f"{BLOCKSCOUT}/api?"+urllib.parse.urlencode({"module":"account","action":"token1155tx","address":CREATOR,"contractaddress":CONTRACT,"page":1,"offset":10000,"sort":"asc"})
    d=get_json(url,4);out=[]
    if isinstance(d,dict) and isinstance(d.get("result"),list):
        for x in d["result"]:
            if isinstance(x,dict):
                r=normalise(x.get("tokenID") or x.get("tokenId"),x.get("tokenName") or x.get("name"),"blockscout-creator-transfer")
                if r:out.append(r)
    return out,{"status":d.get("status") if isinstance(d,dict) else None,"message":d.get("message") if isinstance(d,dict) else None,"result_count":len(d.get("result",[])) if isinstance(d,dict) and isinstance(d.get("result"),list) else None,"error":d.get("_error") if isinstance(d,dict) else None}

def run(output:Path):
    output.mkdir(parents=True,exist_ok=True)
    records=[];raw_problem=[]
    os_records,os_diag=opensea_collection();records+=os_records
    tx_records,tx_diag=creator_transfers();records+=tx_records
    with ThreadPoolExecutor(max_workers=24) as ex:
        fs={ex.submit(metadata,i):i for i in range(1,701)}
        for f in as_completed(fs):
            i,found,raw=f.result();records+=found
            if len({r["token_id_decimal"] for r in found})>1 or any(isinstance(x.get("response"),dict) and x["response"].get("_error") for x in raw):raw_problem.append({"index":i,"raw":raw})
    unique={}
    for r in records:unique[(r["canonical_number"],r["token_id_decimal"],r["source"])]=r
    records=sorted(unique.values(),key=lambda r:(r["canonical_number"],r["creator_index"],r["source"]))
    by_number=defaultdict(dict)
    for r in records:
        e=by_number[r["canonical_number"]].setdefault(r["token_id_decimal"],{**r,"sources":[]})
        if r["source"] not in e["sources"]:e["sources"].append(r["source"])
    candidates={str(n):sorted(v.values(),key=lambda x:x["creator_index"]) for n,v in sorted(by_number.items())}
    collisions={n:v for n,v in candidates.items() if len(v)>1}
    missing=[n for n in range(1,557) if str(n) not in candidates]
    report={"contract":CONTRACT,"creator":CREATOR,"target_count":556,"source_diagnostics":{"opensea_collection":os_diag,"creator_transfers":tx_diag},"raw_record_count":len(records),"canonical_numbers_found":len(candidates),"unique_token_ids_found":len({r["token_id_decimal"] for r in records}),"missing_numbers":missing,"collision_count":len(collisions),"collisions":collisions,"candidates_by_number":candidates}
    (output/"manifest-diagnostic.json").write_text(json.dumps(report,indent=2,sort_keys=True)+"\n")
    (output/"manifest-records.json").write_text(json.dumps(records,indent=2,sort_keys=True)+"\n")
    (output/"metadata-errors.json").write_text(json.dumps(raw_problem,indent=2,sort_keys=True)+"\n")
    (output/"DIAGNOSTIC_SUMMARY.txt").write_text(f"canonical_numbers_found={len(candidates)}\nunique_token_ids_found={report['unique_token_ids_found']}\nmissing={missing}\ncollisions={json.dumps(collisions,sort_keys=True)}\n")
    return report
