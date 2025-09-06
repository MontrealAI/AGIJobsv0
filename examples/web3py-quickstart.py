import json
import os
import time
from pathlib import Path
from web3 import Web3

w3 = Web3(Web3.HTTPProvider(os.environ["RPC_URL"]))
account = w3.eth.account.from_key(os.environ["PRIVATE_KEY"])

registry_abi = json.loads(Path("artifacts/JobRegistry.json").read_text())
validation_abi = json.loads(Path("artifacts/ValidationModule.json").read_text())

registry = w3.eth.contract(address=os.environ["JOB_REGISTRY"], abi=registry_abi)
validation = w3.eth.contract(address=os.environ["VALIDATION_MODULE"], abi=validation_abi)

def post_job():
    reward = Web3.to_wei(1, "ether")  # 1 token in 18‑decimal units
    deadline = int(time.time()) + 3600
    spec_hash = Web3.keccak(text="spec")
    tx = registry.functions.createJob(reward, deadline, spec_hash, "ipfs://job").build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address)
    })
    signed = account.sign_transaction(tx)
    w3.eth.send_raw_transaction(signed.rawTransaction)


def apply(job_id, subdomain, proof):
    """Apply for a job using `subdomain` like 'alice' for alice.agent.agi.eth."""
    tx = registry.functions.applyForJob(job_id, subdomain, proof).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address)
    })
    signed = account.sign_transaction(tx)
    w3.eth.send_raw_transaction(signed.rawTransaction)


def commit_and_reveal(job_id, commit_hash, subdomain, proof, approve, salt):
    """Validators pass their `.club.agi.eth` label as `subdomain`."""
    tx = validation.functions.commitValidation(job_id, commit_hash, subdomain, proof).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address)
    })
    signed = account.sign_transaction(tx)
    w3.eth.send_raw_transaction(signed.rawTransaction)

    tx2 = validation.functions.revealValidation(job_id, approve, salt, subdomain, proof).build_transaction({
        "from": account.address,
        "nonce": w3.eth.get_transaction_count(account.address)
    })
    signed2 = account.sign_transaction(tx2)
    w3.eth.send_raw_transaction(signed2.rawTransaction)

