from __future__ import annotations
import json,time,urllib.error,urllib.request
from pathlib import Path

CONTRACT="0x495f947276749ce646f68ac8c248420045cb7b5e"
CREATOR="0x054a2e4b3b5ea2c62372e92358fdf7fb74b4f34a"
UA="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/151 Safari/537.36"

def token_id(index:int)->str:return str((int(CREATOR,16)<<96)|(index<<40)|1)

def fetch(url:str):
    last=None
    for i in range(3):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json,text/html;q=0.9,*/*;q=0.8"})
            with urllib.request.urlopen(req,timeout=45) as r:
                raw=r.read();text=raw.decode("utf-8","replace")
                return {"requested_url":url,"final_url":r.geturl(),"status":r.status,"content_type":r.headers.get("content-type"),"length":len(raw),"body":text}
        except urllib.error.HTTPError as e:
            raw=e.read();return {"requested_url":url,"final_url":e.geturl(),"status":e.code,"content_type":e.headers.get("content-type"),"length":len(raw),"body":raw.decode("utf-8","replace")}
        except Exception as e:last=repr(e);time.sleep(1+i)
    return {"requested_url":url,"error":last}

def run(out:Path):
    out.mkdir(parents=True,exist_ok=True);report={"contract":CONTRACT,"candidates":{}}
    for idx in (319,320,321,322,323,324):
        tid=token_id(idx);urls=[
            f"https://api.opensea.io/api/v1/metadata/{CONTRACT}/{tid}",
            f"https://api.opensea.io/api/v1/asset/{CONTRACT}/{tid}/",
            f"https://api.opensea.io/api/v2/chain/ethereum/contract/{CONTRACT}/nfts/{tid}/collection",
            f"https://opensea.io/item/ethereum/{CONTRACT}/{tid}",
            f"https://opensea.io/assets/ethereum/{CONTRACT}/{tid}",
            f"https://eth.blockscout.com/api/v2/tokens/{CONTRACT}/instances/{tid}",
            f"https://eth.blockscout.com/api/v2/tokens/{CONTRACT}/instances/{tid}/transfers",
        ]
        results=[fetch(u) for u in urls]
        compact=[]
        for n,r in enumerate(results):
            body=r.pop("body","")
            name=None
            try:
                d=json.loads(body)
                md=d.get("metadata") if isinstance(d,dict) and isinstance(d.get("metadata"),dict) else d
                if isinstance(md,dict):name=md.get("name")
            except Exception:pass
            lower=body.lower();hits={}
            for term in ("montrealai","crypto ai art #316","collection","slug","deleted","hidden"):
                pos=lower.find(term)
                if pos>=0:hits[term]=body[max(0,pos-250):pos+750]
            compact.append({**r,"name":name,"contains_montrealai":"montrealai" in lower,"contains_316":"crypto ai art #316" in lower,"hits":hits,"body_prefix":body[:2000]})
            (out/f"index_{idx}_response_{n}.txt").write_text(body,encoding="utf-8")
        report["candidates"][str(idx)]={"token_id":tid,"responses":compact}
    (out/"probe-report.json").write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    lines=[]
    for idx,c in report["candidates"].items():
        lines.append(f"index={idx} token_id={c['token_id']}")
        for r in c["responses"]:lines.append(f"  {r.get('status')} {r.get('final_url')} name={r.get('name')!r} montrealai={r.get('contains_montrealai')} #316={r.get('contains_316')}")
    (out/"PROBE_SUMMARY.txt").write_text("\n".join(lines)+"\n",encoding="utf-8")
    return report
