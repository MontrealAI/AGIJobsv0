from typer.testing import CliRunner

import run_demo


runner = CliRunner()


def test_default_invocation_shows_help_and_exits_cleanly():
    result = runner.invoke(run_demo.app, [])

    assert result.exit_code == 0
    assert "Tiny Recursive Model" in result.stdout
    assert "train" in result.stdout
    assert "simulate" in result.stdout
    assert "explain" in result.stdout
