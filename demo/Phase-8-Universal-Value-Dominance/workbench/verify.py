import hashlib, json, math, sys
from pathlib import Path

def same_values(actual, expected):
    # Python booleans compare equal to 0/1; reject that substitution explicitly.
    if type(expected) in (int, float):
        return type(actual) in (int, float) and math.isfinite(actual) and actual == expected
    if isinstance(expected, dict):
        return isinstance(actual, dict) and actual.keys() == expected.keys() and all(same_values(actual[k], v) for k, v in expected.items())
    if isinstance(expected, list):
        return isinstance(actual, list) and len(actual) == len(expected) and all(same_values(a, b) for a, b in zip(actual, expected))
    return type(actual) is type(expected) and actual == expected


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
    worker_capacity = s['workers'] * s['days'] * 8 * (100 - s['outagePercent']) // (100 * s['hoursPerJob'])
    review_capacity = s['reviewerHours'] * 60 // s['reviewMinutes']
    reserve_per_job = s['rewardUSDC'] + s['executionUSDC'] + s['reviewUSDC']
    budget_capacity = s['budgetUSDC'] // reserve_per_job
    capacity = {'offers': s['offers'], 'workers': worker_capacity, 'review': review_capacity, 'budget': budget_capacity}
    admitted = min(capacity.values())
    accepted = admitted * s['acceptancePercent'] // 100
    reserve = admitted * reserve_per_job
    payout = accepted * s['rewardUSDC']
    operating_cost = admitted * (s['executionUSDC'] + s['reviewUSDC'])
    spent = payout + operating_cost
    values = {
        'schemaVersion': 1,
        'evidenceClass': 'capacity-scenario',
        'settings': s,
        'capacity': capacity,
        'bottlenecks': [key for key, value in capacity.items() if value == admitted],
        'admitted': admitted,
        'accepted': accepted,
        'notAccepted': admitted - accepted,
        'deferred': s['offers'] - admitted,
        'reserveUSDC': reserve,
        'uncommittedUSDC': s['budgetUSDC'] - reserve,
        'payoutUSDC': payout,
        'operatingCostUSDC': operating_cost,
        'spentUSDC': spent,
        'releasedReserveUSDC': reserve - spent,
        'remainingUSDC': s['budgetUSDC'] - spent,
        'reviewHours': admitted * s['reviewMinutes'] / 60,
        'minutesPerAccepted': admitted * s['reviewMinutes'] / accepted if accepted else None,
        'costPerAcceptedUSDC': spent / accepted if accepted else None,
        'providerCalls': 0,
        'chainTransactions': 0,
        'independentReviewCompleted': False,
        'buyerUseVerified': False,
        'productionApproved': False,
        'settlementApproved': False,
    }
    if not same_values(p, values): raise ValueError('Independent arithmetic mismatch or unsupported execution claim')
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
