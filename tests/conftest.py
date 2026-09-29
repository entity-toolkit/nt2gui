import pytest

from nt2gui.app import create_app


@pytest.fixture
def state_file(tmp_path):
    return tmp_path / "state" / "session.json"


@pytest.fixture
def client(state_file):
    return create_app(state_file).test_client()
