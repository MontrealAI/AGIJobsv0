"""Regressions for the registry agent's Compose and command-line contracts."""
from tools.agent_registry_cli import build_parser, command_template


def test_template_preserves_compose_owner_token_interpolation(tmp_path):
    target = tmp_path / 'agent.compose.yaml'
    args = build_parser().parse_args([
        'template', 'agent-smoke', 'us-east', 'execution', 'default',
        'http://registry:8000/agents', 'local-fixture-secret', '--output', str(target),
    ])
    command_template(args)
    text = target.read_text()
    assert '${AGENT_REGISTRY_OWNER_TOKEN:?Set the registry owner token}' in text
    assert 'agent-smoke' in text


def test_container_global_flags_parse_before_subcommand():
    parser = build_parser()
    registration = parser.parse_args([
        '--api-url', 'http://registry:8000/agents', '--owner-token', 'local-fixture-token',
        'register', 'agent-smoke', 'operator', 'us-east', 'execution', '1000',
        'local-fixture-secret', '--router', 'default',
    ])
    assert registration.api_url == 'http://registry:8000/agents'
    assert registration.owner_token == 'local-fixture-token'
    heartbeat = parser.parse_args([
        '--api-url', 'http://registry:8000/agents', 'heartbeat', 'agent-smoke',
        'local-fixture-secret', '--router', 'default',
    ])
    assert heartbeat.command == 'heartbeat'
