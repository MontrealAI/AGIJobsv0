import eth_typing


def test_contract_name_alias_available():
    assert hasattr(eth_typing, "ContractName"), "ContractName alias should be provided"

    contract = eth_typing.ContractName("ValidatorConstellation")
    assert isinstance(contract, str)
    assert contract == "ValidatorConstellation"


def test_backend_metadata_preserved():
    assert hasattr(eth_typing, "BACKEND_MODULE")
    backend = eth_typing.BACKEND_MODULE
    assert backend is not None
    assert getattr(backend, "__version__", None)


def test_submodule_imports_resolve():
    module = __import__("eth_typing.abi", fromlist=["abi"])

    assert module.__name__ == "eth_typing.abi"
    assert hasattr(eth_typing, "__path__")
    assert eth_typing.__path__
