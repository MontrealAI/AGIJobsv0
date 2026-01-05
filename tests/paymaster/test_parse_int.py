from paymaster.supervisor import service


def test_parse_int_rejects_bool() -> None:
    assert service._parse_int(True) == 0
    assert service._parse_int(False) == 0


def test_parse_int_accepts_int_like_values() -> None:
    assert service._parse_int(123) == 123
    assert service._parse_int("456") == 456
    assert service._parse_int("0x10") == 16
