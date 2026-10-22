"""Verify archived evidence bytes only; grant no scanner/release approval."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parent
index=json.loads((R/'INDEX.json').read_bytes())
for name,item in index['files'].items():
    raw=(R/name).read_bytes()
    assert len(raw)==item['bytes'] and hashlib.sha256(raw).hexdigest()==item['sha256'], name
    assert len(raw)<=131072, name
restored={}
for group in index['splitOriginals']:
    raw=b''.join((R/name).read_bytes() for name in group['orderedParts'])
    assert len(raw)==group['originalBytes'] and hashlib.sha256(raw).hexdigest()==group['originalSha256']
    restored[group['originalName']]=json.loads(raw)
packet=next(value for name,value in restored.items() if name.endswith('current-19-result-review-packet.json'))
assert packet['recordCount']==len(packet['records'])==19
def canonical(value): return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode()
for record in packet['records']:
    assert hashlib.sha256(canonical(record['rawResult'])).hexdigest()==record['completeCanonicalResultSha256']
    assert hashlib.sha256(canonical(record['ruleDescriptor'])).hexdigest()==record['completeRuleDescriptorSha256']
    assert json.loads((R/f"scanner/cases/result-{record['index']:02d}.json").read_bytes())==record
custody=next(value for name,value in restored.items() if name.endswith('authenticated-custody.json'))
assert len(custody['archives'])==47 and sum(a['bytes'] for a in custody['archives'])==133906009
assert all(a['hostedDigestMatches'] for a in custody['archives'])
proposal=json.loads((R/'scanner/UNACCEPTED-proposal.json').read_bytes())
assert proposal['status']=='PROPOSAL_ONLY_NOT_INSTALLED' and len(proposal['cases'])==19
assert sum(bool(c['trueQuality']) for c in proposal['cases'])==8
print('PASS: exact files, raw19-result/rule commitments, original47-artifact custody and UNACCEPTED proposal; no approval granted.')
