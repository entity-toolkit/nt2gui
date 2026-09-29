import threading
import time

import numpy as np
import pytest

from nt2gui.sources import (
    combined_timeline,
    first_particles,
    nearest_index,
    open_simulation,
)
from nt2gui.sources.cache import StepCache
from nt2gui.sources.demo import DemoSimulation


class TestTimeline:
    def test_spans_all_outputs_with_the_finest_step(self):
        fields = np.array([0.0, 1.0, 2.0])
        particles = np.array([0.5, 1.0, 3.0])
        assert combined_timeline(fields, particles) == {
            "current": 0.0,
            "min": 0.0,
            "max": 3.0,
            "step": 0.5,
        }

    def test_single_output(self):
        assert combined_timeline(np.array([2.0]))["step"] == 1.0

    def test_no_outputs(self):
        assert combined_timeline()["max"] == 1.0


class TestOpenSimulation:
    def test_demo_prefix_gives_synthetic_data(self):
        simulation = open_simulation("demo:anything", "abc")
        assert isinstance(simulation, DemoSimulation)
        assert simulation.id == "abc"

    def test_missing_directory_is_an_error(self, tmp_path):
        with pytest.raises(FileNotFoundError, match="No such directory"):
            open_simulation(str(tmp_path / "nope"))

    def test_directory_without_output_is_an_error(self, tmp_path):
        with pytest.raises(Exception):
            open_simulation(str(tmp_path))


def test_nearest_index():
    assert nearest_index(np.array([0.0, 1.0, 2.0]), 1.4) == 1
    assert nearest_index(np.array([0.0, 1.0, 2.0]), 99) == 2


class TestStepCache:
    def test_evicts_the_least_recently_used(self):
        cache = StepCache(2)
        loads = []

        def get(key):
            return cache.get(key, lambda: loads.append(key) or key)

        get(1), get(2), get(1), get(3)  # 2 is the least recently used
        get(1), get(2)
        assert loads == [1, 2, 3, 2]

    def test_concurrent_requests_share_one_load(self):
        cache = StepCache(2)
        calls = []

        def slow_load():
            calls.append(1)
            time.sleep(0.05)
            return "frame"

        results = []
        threads = [
            threading.Thread(target=lambda: results.append(cache.get(0, slow_load)))
            for _ in range(8)
        ]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()

        assert calls == [1] and results == ["frame"] * 8


class TestDemoSimulation:
    def test_species_are_copies(self):
        simulation = DemoSimulation("demo:x")
        simulation.species[0]["label"] = "changed"
        assert simulation.species[0]["label"] == "e-"

    def test_first_particles_are_the_earliest_output(self):
        simulation = DemoSimulation("demo:x")
        frame = first_particles(simulation)
        assert frame is simulation.particles(0.0)
