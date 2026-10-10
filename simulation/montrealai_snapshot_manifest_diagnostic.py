from __future__ import annotations

import json,re,time,urllib.error,urllib.request
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor,as_completed
from pathlib import Path

CONTRACT="0x495f947276749ce646f68ac8c248420045cb7b5e"
CREATOR="0x054a2e4b3b5ea2c62372e92358fdf7fb74b4f34a"
UA="MONTREAL.AI-Becoming-Omega-Manifest/2.0 (+https://montreal.ai)"
RX=re.compile(r"^Crypto AI Art\s*#\s*0*(\d+)\s*$",re.I)

def token_id(index:int)->int:return (int(CREATOR,16)<<96)|(index<<40)|1

def get_json(url:str,attempts:int=7,not_found_ok:bool=False):
    last=None
    for i in range(attempts):
        try:
            req=urllib.request.Request(url,headers={"User-Agent":UA,"Accept":"application/json"})
            with urllib.request.urlopen(req,timeout=45) as r:return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            if not_found_ok and e.code in (400,404):return {},None
            last=e
            if e.code not in (408,425,429,500,502,503,504):break
            retry=e.headers.get("Retry-After");delay=float(retry) if retry and retry.isdigit() else min(12,.75*2**i);time.sleep(delay)
        except Exception as e:
            last=e;time.sleep(min(12,.75*2**i))
    return {},repr(last)

def normalise(index:int,name,source):
    if not isinstance(name,str):return None
    m=RX.match(name.strip())
    if not m:return None
    number=int(m.group(1))
    if not 1<=number<=556:return None
    tid=token_id(index)
    return {"canonical_number":number,"title":f"Crypto AI Art #{number:03d}","token_id_decimal":str(tid),"token_id_hex":f"0x{tid:064x}","creator_index":index,"encoded_supply":1,"source":source}

def metadata(index:int):
    tid=str(token_id(index));errors=[]
    urls=[
        (f"https://api.opensea.io/api/v1/metadata/{CONTRACT}/{tid}","opensea-v1-metadata"),
        (f"https://eth.blockscout.com/api/v2/tokens/{CONTRACT}/instances/{tid}","blockscout-instance-fallback"),
    ]
    for url,source in urls:
        data,error=get_json(url,7,True)
        if error:errors.append({"source":source,"error":error})
        md=data.get("metadata") if isinstance(data,dict) and isinstance(data.get("metadata"),dict) else data
        record=normalise(index,md.get("name") if isinstance(md,dict) else None,source)
        if record:return record,errors
    return None,errors

def run(output:Path):
    output.mkdir(parents=True,exist_ok=True);records=[];errors=[]
    with ThreadPoolExecutor(max_workers=16) as ex:
        futures={ex.submit(metadata,i):i for i in range(1,621)}
        for future in as_completed(futures):
            record,errs=future.result()
            if record:records.append(record)
            if errs:errors.append({"creator_index":futures[future],"errors":errs})
    records=sorted(records,key=lambda r:(r["canonical_number"],r["creator_index"]))
    by_number=defaultdict(list)
    for record in records:by_number[record["canonical_number"]].append(record)
    candidates={str(n):rows for n,rows in sorted(by_number.items())}
    collisions={n:rows for n,rows in candidates.items() if len(rows)>1}
    missing=[n for n in range(1,557) if str(n) not in candidates]
    report={"contract":CONTRACT,"creator":CREATOR,"target_count":556,"canonical_numbers_found":len(candidates),"unique_token_ids_found":len({r['token_id_decimal'] for r in records}),"missing_numbers":missing,"collision_count":len(collisions),"collisions":collisions,"candidates_by_number":candidates,"metadata_error_indexes":errors}
    (output/"manifest-diagnostic.json").write_text(json.dumps(report,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    (output/"manifest-records.json").write_text(json.dumps(records,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    (output/"metadata-errors.json").write_text(json.dumps(errors,indent=2,sort_keys=True)+"\n",encoding="utf-8")
    (output/"DIAGNOSTIC_SUMMARY.txt").write_text(f"canonical_numbers_found={len(candidates)}\nunique_token_ids_found={report['unique_token_ids_found']}\nmissing={missing}\ncollisions={json.dumps(collisions,sort_keys=True)}\n",encoding="utf-8")
    return report
