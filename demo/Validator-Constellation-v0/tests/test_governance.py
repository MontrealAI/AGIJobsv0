import pytest

from validator_constellation.config import SystemConfig
from validator_constellation.events import EventBus
from validator_constellation.governance import OwnerConsole
from validator_constellation.sentinel import DomainPauseController
from validator_constellation.staking import StakeManager
from validator_constellation.subgraph import SubgraphIndexer


def test_owner_console_controls_configuration():
    config = SystemConfig()
    bus = EventBus()
    stake_manager = StakeManager(bus, config.owner_address)
    pause_controller = DomainPauseController(bus)
    indexer = SubgraphIndexer(bus)
    console = OwnerConsole(config.owner_address, config, pause_controller, stake_manager, bus)

    action = console.update_config(config.owner_address, quorum=4, slash_fraction_non_reveal=0.4)
    assert config.quorum == 4
    assert action.details["slash_fraction_non_reveal"] == 0.4
    assert indexer.latest("ConfigUpdated")

    pause_controller.pause("bio", "test")
    console.resume_domain(config.owner_address, "bio")
    assert not pause_controller.is_paused("bio")


def test_owner_console_rejects_unauthorised_updates():
    config = SystemConfig()
    bus = EventBus()
    stake_manager = StakeManager(bus, config.owner_address)
    pause_controller = DomainPauseController(bus)
    console = OwnerConsole(config.owner_address, config, pause_controller, stake_manager, bus)

    with pytest.raises(PermissionError):
        console.update_config("0xdead", quorum=10)

