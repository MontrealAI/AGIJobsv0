"""Admission counts must come from actual registered jobs, not requested roots."""
from types import SimpleNamespace
import asyncio
import pytest
from demo.kardashev_ii_omega_grade_alpha_agi_business_3_demo_ultra.orchestrator import UltraOrchestrator, JobStatus


def setup(admitted):
    child = SimpleNamespace(plan_path='0.0', children=[])
    root = SimpleNamespace(plan_path='0', children=[child])
    instance = object.__new__(UltraOrchestrator)
    instance.mission = SimpleNamespace(name='bounded fixture', job_plan=[root])
    records = [SimpleNamespace(spec=SimpleNamespace(metadata={'plan_path':key}), status=value) for key,value in admitted.items()]
    instance.job_registry = SimpleNamespace(iter_jobs=lambda:iter(records))
    return instance


def test_zero_admissions_never_fall_back_to_planned_root_count():
    result = setup({})._mission_admission_snapshot()
    assert result['planned_count'] == 2
    assert result['admitted_count'] == 0
    assert result['missing_paths'] == ['0','0.0']
    assert result['all_admitted'] is False
    assert result['all_work_finalized'] is False


def test_partial_admission_and_pending_work_are_explicit():
    result = setup({'0':JobStatus.POSTED})._mission_admission_snapshot()
    assert result['status'] == 'partial'
    assert result['admitted_paths'] == ['0']
    assert result['missing_paths'] == ['0.0']
    assert result['finalized_count'] == 0


def test_full_admission_does_not_mean_completed_work():
    result = setup({'0':JobStatus.FINALIZED,'0.0':JobStatus.IN_PROGRESS})._mission_admission_snapshot()
    assert result['all_admitted'] is True
    assert result['all_work_finalized'] is False
    assert result['finalized_paths'] == ['0']
    assert setup({'0':JobStatus.FINALIZED,'0.0':JobStatus.FINALIZED})._mission_admission_snapshot()['all_work_finalized'] is True


def test_seed_failure_log_reports_zero_actual_jobs():
    instance = setup({});instance._paused=asyncio.Event();instance._paused.set()
    async def refused(*args,**kwargs):return None
    instance._ensure_plan_node=refused
    events=[];instance._info=lambda name,**data:events.append((name,data))
    asyncio.run(instance._seed_plan_once())
    assert events[0][0]=='mission_plan_partial'
    assert events[0][1]['jobs']==0
    assert events[0][1]['planned_count']==2


def test_duplicate_plan_is_rejected_before_admission_mutation():
    instance = setup({})
    instance.mission.job_plan.append(instance.mission.job_plan[0])
    instance._paused = asyncio.Event(); instance._paused.set()
    mutations = []
    async def mutate(*args, **kwargs): mutations.append(args)
    instance._ensure_plan_node = mutate
    with pytest.raises(ValueError, match='must be unique'):
        asyncio.run(instance._seed_plan_once())
    assert mutations == []


def test_duplicate_registry_cannot_falsely_report_finalization():
    instance = setup({'0': JobStatus.POSTED})
    first = next(instance.job_registry.iter_jobs())
    second = SimpleNamespace(spec=first.spec, status=JobStatus.FINALIZED)
    instance.job_registry = SimpleNamespace(iter_jobs=lambda: iter([first, second]))
    with pytest.raises(ValueError, match='Ambiguous registered'):
        instance._mission_admission_snapshot()
    instance._paused = asyncio.Event(); instance._paused.set()
    mutations = []
    async def mutate(*args, **kwargs): mutations.append(args)
    instance._ensure_plan_node = mutate
    with pytest.raises(ValueError, match='Ambiguous registered'):
        asyncio.run(instance._seed_plan_once())
    assert mutations == []
