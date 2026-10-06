from __future__ import annotations
import argparse
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'workbench/cases.json'
CASES = {
    'normalize': [([], []), ([-100, -7, 0, 7, 100], [-298, -19, 2, 23, 302]), ([2, 2], [8, 8])],
    'ledger': [([], [0]), ([-10, -1], [0]), ([0, 7, 7, -7, 100], [114])],
    'catalog': [([], []), ([9, -2, 9, 0, -2, 100], [-2, 0, 9, 100]), ([4, 4, 4], [4])],
}
OPS = {'add2', 'times3', 'nonnegative', 'sum', 'sort', 'unique', 'reverse'}


def evaluate(values, program):
    result = list(values)
    for op in program:
        if op == 'add2': result = [v + 2 for v in result]
        elif op == 'times3': result = [v * 3 for v in result]
        elif op == 'nonnegative': result = [v for v in result if v >= 0]
        elif op == 'sum': result = [sum(result)]
        elif op == 'sort': result = sorted(result)
        elif op == 'unique': result = list(dict.fromkeys(result))
        elif op == 'reverse': result = list(reversed(result))
        else: raise ValueError('Unknown operation')
    return result


def review(candidate, expected_task):
    checks = []
    def add(name, passed): checks.append({'name': name, 'passed': bool(passed)})
    add('Exact candidate schema', set(candidate) == {'schemaVersion', 'taskId', 'sourceSha256', 'operations', 'candidatesEvaluated', 'evidenceClass', 'reviewStatus', 'providerCalls', 'chainTransactions', 'productionApproved', 'settlementApproved'})
    add('Pinned task matches reviewer intent', expected_task in CASES and candidate.get('taskId') == expected_task)
    add('Exact source bytes', candidate.get('sourceSha256') == hashlib.sha256(SOURCE.read_bytes()).hexdigest())
    add('Version and evidence boundary', type(candidate.get('schemaVersion')) is int and candidate.get('schemaVersion') == 1 and candidate.get('evidenceClass') == 'local-synthesis' and candidate.get('reviewStatus') == 'required' and candidate.get('productionApproved') is False and candidate.get('settlementApproved') is False and type(candidate.get('providerCalls')) is int and candidate.get('providerCalls') == 0 and type(candidate.get('chainTransactions')) is int and candidate.get('chainTransactions') == 0)
    program = candidate.get('operations')
    valid = isinstance(program, list) and len(program) <= 3 and all(isinstance(op, str) and op in OPS for op in program)
    add('Bounded operation language', valid)
    add('Bounded reported search count', type(candidate.get('candidatesEvaluated')) is int and 1 <= candidate['candidatesEvaluated'] <= 400)
    if valid and expected_task in CASES:
        training = next(task for task in json.loads(SOURCE.read_text())['cases'] if task['id'] == expected_task)['training']
        for i, item in enumerate(training): add(f'Training replay {i + 1}', evaluate(item['input'], program) == item['expected'])
        for i, (values, expected) in enumerate(CASES[expected_task]): add(f'Independent acceptance case {i + 1}', evaluate(values, program) == expected)
    return {'schemaVersion': 1, 'status': 'passed' if all(c['passed'] for c in checks) else 'rejected', 'checks': checks, 'reviewScope': 'Independent checker implementation with fixed synthetic cases; no independent external reviewer or general correctness proof', 'providerAuthenticated': False, 'buyerAcceptanceRequired': True, 'productionApproved': False, 'settlementApproved': False}


def main():
    parser = argparse.ArgumentParser(description='Challenge a bounded candidate using separate Python acceptance cases.')
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--task', choices=sorted(CASES), required=True)
    args = parser.parse_args()
    try:
        if str(args.candidate) == '-':
            raw = sys.stdin.buffer.read(65537)
        else:
            if args.candidate.stat().st_size > 65536: raise ValueError('Candidate exceeds 64 KiB')
            raw = args.candidate.read_bytes()
        if len(raw) > 65536: raise ValueError('Candidate exceeds 64 KiB')
        candidate = json.loads(raw)
        if not isinstance(candidate, dict): raise ValueError('Candidate must be an object')
        verdict = review(candidate, args.task)
        verdict['candidateSha256'] = hashlib.sha256(raw).hexdigest()
        print(json.dumps(verdict, indent=2))
        return 0 if verdict['status'] == 'passed' else 1
    except (ValueError, OSError, TypeError) as error:
        print(json.dumps({'status': 'rejected', 'error': str(error), 'settlementApproved': False}))
        return 1

if __name__ == '__main__': raise SystemExit(main())
