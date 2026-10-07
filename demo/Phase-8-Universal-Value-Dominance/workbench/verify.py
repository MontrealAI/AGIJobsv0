import hashlib, json, sys
from pathlib import Path

def verify(directory):
    root = Path(directory)
    receipt = json.loads((root / 'receipt.json').read_text())
    if receipt.get('evidenceClass') != 'local-planning-calculation' or any(receipt.get(k) is not False for k in ['productionApproved', 'settlementApproved', 'independentReviewCompleted']): raise ValueError('Unsupported receipt claim')
    expected = {'plan.json', 'work-orders.json', 'report.md'}
    entries = receipt['artifacts']
    if len(entries) != 3 or {x['name'] for x in entries} != expected: raise ValueError('Unexpected artifact set')
    for item in entries:
        file = root / item['name']
        if file.is_symlink() or hashlib.sha256(file.read_bytes()).hexdigest() != item['sha256']: raise ValueError('Artifact digest mismatch')
    p = json.loads((root / 'plan.json').read_text()); s = p['settings']
    bounds = {'offers': (0, 1000000), 'workers': (0, 1000000), 'days': (1, 365), 'hoursPerJob': (1, 8760), 'reviewMinutes': (1, 1440), 'reviewerHours': (0, 1000000), 'budgetUSDC': (0, 1000000000), 'rewardUSDC': (1, 1000000), 'executionUSDC': (0, 1000000), 'reviewUSDC': (0, 1000000), 'acceptancePercent': (0, 100), 'outagePercent': (0, 100)}
    if set(s) != set(bounds) or any(type(s[k]) is not int or not lo <= s[k] <= hi for k, (lo, hi) in bounds.items()): raise ValueError('Invalid scenario settings')
    admitted = min(s['offers'], s['workers'] * s['days'] * 8 * (100 - s['outagePercent']) // (100 * s['hoursPerJob']), s['reviewerHours'] * 60 // s['reviewMinutes'], s['budgetUSDC'] // (s['rewardUSDC'] + s['executionUSDC'] + s['reviewUSDC']))
    accepted = admitted * s['acceptancePercent'] // 100
    reserve = admitted * (s['rewardUSDC'] + s['executionUSDC'] + s['reviewUSDC'])
    spent = accepted * s['rewardUSDC'] + admitted * (s['executionUSDC'] + s['reviewUSDC'])
    values = {'admitted': admitted, 'accepted': accepted, 'reserveUSDC': reserve, 'spentUSDC': spent, 'remainingUSDC': s['budgetUSDC'] - spent, 'releasedReserveUSDC': reserve - spent, 'deferred': s['offers'] - admitted}
    if any(p[k] != v for k, v in values.items()): raise ValueError('Independent arithmetic mismatch')
    if p['providerCalls'] != 0 or p['chainTransactions'] != 0 or p['settlementApproved'] is not False or p['productionApproved'] is not False: raise ValueError('Unsupported execution claim')
    orders = json.loads((root / 'work-orders.json').read_text())
    if len(orders) != 10 or len({o['taskId'] for o in orders}) != 10: raise ValueError('Incomplete work-order set')
    for order in orders:
        if order['scenario'] != p or order['status'] != 'draft' or order['settlement']['currency'] != 'USDC' or order['settlement']['approved'] is not False or order['review']['identityVerified'] is not False or order['runtime']['configured'] is not False: raise ValueError('Unsupported work-order claim')
    return {'arithmeticVerified': True, 'artifactIntegrityVerified': True, 'reviewerIndependenceVerified': False, 'settlementApproved': False}

if __name__ == '__main__':
    try:
        if len(sys.argv) != 2: raise ValueError('Usage: python verify.py OUTPUT_DIRECTORY')
        print(json.dumps(verify(sys.argv[1]), indent=2))
    except (ValueError, KeyError, TypeError, OSError) as error:
        print(str(error), file=sys.stderr); sys.exit(1)
