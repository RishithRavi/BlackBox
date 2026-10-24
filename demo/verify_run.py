#!/usr/bin/env python3
"""Verify real persisted replay results; never sends expected labels to the detector."""
import argparse
import json
from pathlib import Path
from urllib.request import urlopen

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--target', default='http://127.0.0.1:8000')
parser.add_argument('--run-id', required=True)
parser.add_argument('--output', type=Path)
parser.add_argument('--fixtures', type=Path, default=Path(__file__).resolve().parent.parent / 'fixtures.json')
args = parser.parse_args()

def get(path):
    with urlopen(args.target.rstrip('/') + path, timeout=30) as response:
        return json.load(response)

from urllib.parse import quote
run = quote(args.run_id, safe='')
health = get('/health')
records = get(f'/runs/{run}/steps')['steps']
metrics = get(f'/runs/{run}/metrics')
graph = get(f'/runs/{run}/graph')
fixtures = json.loads(args.fixtures.read_text())
by_id = {record['event']['step_id']: record['verdict'] for record in records}
levels = {'ok': 0, 'warn': 1, 'block': 2}
results = []
for case in fixtures['cases']:
    verdict = by_id.get(case['step_id'])
    passed = bool(verdict and set(case['expected_rules']) <= {f['rule'] for f in verdict['flags']}
                  and levels[verdict['level']] >= levels[case['expected_level']]
                  and (not case['semantic_required'] or verdict['semantic_status'] == 'laya'))
    results.append({'step_id': case['step_id'], 'expected_rules': case['expected_rules'],
                    'passed': passed, 'actual': verdict})
clean_failures = [sid for sid in fixtures['clean_step_ids'] if sid not in by_id or by_id[sid]['flags']]
report = {'run_id': args.run_id, 'health': health, 'step_count': len(records), 'graph_nodes': len(graph['nodes']), 'graph_edges': len(graph['edges']),
          'required_cases_detected': sum(r['passed'] for r in results), 'required_case_count': len(results), 'clean_control_count': len(fixtures['clean_step_ids']),
          'cases': results, 'clean_control_failures': clean_failures, 'metrics': metrics,
          'passed': health['semantic_status'] == 'laya' and all(r['passed'] for r in results) and not clean_failures}
text = json.dumps(report, indent=2)
print(text)
if args.output:
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(text + '\n')
raise SystemExit(0 if report['passed'] else 1)
