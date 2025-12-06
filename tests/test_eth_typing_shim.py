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
