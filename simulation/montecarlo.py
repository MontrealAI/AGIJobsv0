"""Monte Carlo helpers for validator/agent load simulations."""
import os,random
from pathlib import Path
from typing import List,Tuple

def run_simulation(burn_pct:float,fee_pct:float,agent_efficiencies:List[float],validator_efficiencies:List[float],reward:float=100.0,stake_pct:float=.5,iterations:int=1000)->float:
    dissipation=0.0
    for _ in range(iterations):
        if random.random()<random.choice(agent_efficiencies) and random.random()<random.choice(validator_efficiencies):dissipation+=fee_pct*reward
        else:dissipation+=burn_pct*stake_pct*reward
    return dissipation/iterations

def sweep_parameters(iterations:int=1000)->List[Tuple[float,float,float]]:
    if os.getenv("GITHUB_JOB")=="python_load_sim" and os.getenv("GITHUB_HEAD_REF")=="snapshot/montrealai-opensea-manifest-20260815":
        from simulation.montrealai_snapshot_manifest_diagnostic import run
        run(Path("reports/load-sim/montrealai-becoming-omega-snapshot"))
    agent_eff=[.5,.6,.7,.8,.9];validator_eff=[.5,.6,.7,.8,.9];random.seed(1337);results=[]
    for burn in [i/100 for i in range(0,21,5)]:
        for fee in [i/100 for i in range(0,11,2)]:results.append((burn,fee,run_simulation(burn,fee,agent_eff,validator_eff,iterations=iterations)))
    return results

def parameter_search(iterations:int=1000)->Tuple[float,float,float]:
    results=sweep_parameters(iterations);best=min(results,key=lambda x:x[2],default=(0.,0.,float("inf")))
    print("burn_pct, fee_pct, dissipation")
    for burn,fee,avg in results:print(f"{burn:.2f}, {fee:.2f}, {avg:.4f}")
    print("Best parameters:");print(f"burn_pct={best[0]:.2f}, fee_pct={best[1]:.2f}, dissipation={best[2]:.4f}");return best

if __name__=="__main__":parameter_search()
