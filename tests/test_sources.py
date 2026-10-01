import threading
import time

import numpy as np
import pytest

from nt2gui.sources import (
    combined_timeline,
    first_particle_time,
    nearest_index,
    open_simulation,
)
from nt2gui.sources.cache import StepCache, size_of
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
        cache = StepCache(max_items=2)
        loads = []

        def get(key):
            return cache.get(key, lambda: loads.append(key) or key)

        get(1), get(2), get(1), get(3)  # 2 is the least recently used
        get(1), get(2)
        assert loads == [1, 2, 3, 2]

    def test_is_bounded_by_bytes(self):
        cache = StepCache(max_bytes=2_000)
        for key in range(3):
            cache.put(key, np.zeros(100))  # 800 bytes each
        assert len(cache) == 2 and cache.nbytes == 1_600
        assert cache.peek(0) is None and cache.peek(2) is not None

    def test_keeps_the_newest_value_even_if_it_alone_is_too_big(self):
        cache = StepCache(max_bytes=100)
        cache.put("small", np.zeros(5))
        cache.put("huge", np.zeros(1_000))
        assert cache.peek("huge") is not None and cache.peek("small") is None

    def test_concurrent_requests_share_one_load(self):
        cache = StepCache(max_items=2)
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

    def test_hits_do_not_wait_behind_a_slow_load(self):
        cache = StepCache(max_items=4)
        cache.put("ready", 1)
        started = threading.Event()
        release = threading.Event()

        def slow_load():
            started.set()
            release.wait(5)
            return 2

        loader = threading.Thread(target=lambda: cache.get("slow", slow_load))
        loader.start()
        started.wait(5)
        t0 = time.perf_counter()
        assert cache.get("ready", lambda: 0) == 1
        assert time.perf_counter() - t0 < 0.1
        release.set()
        loader.join()

    def test_failed_loads_are_not_cached_and_reach_waiters(self):
        cache = StepCache(max_items=2)

        def failing():
            time.sleep(0.02)
            raise OSError("disk")

        errors = []

        def attempt():
            try:
                cache.get("k", failing)
            except OSError as error:
                errors.append(error)

        threads = [threading.Thread(target=attempt) for _ in range(3)]
        for thread in threads:
            thread.start()
        for thread in threads:
            thread.join()
        assert len(errors) == 3
        assert cache.get("k", lambda: "ok") == "ok"

    def test_size_of(self):
        assert size_of(np.zeros(10)) == 80
        assert size_of("text") == 0


class TestDemoSimulation:
    def test_species_are_copies(self):
        simulation = DemoSimulation("demo:x")
        simulation.species[0]["label"] = "changed"
        assert simulation.species[0]["label"] == "e-"

    def test_particles_have_only_the_asked_for_columns(self):
        simulation = DemoSimulation("demo:x")
        assert list(simulation.particles(0.0, ["ux"]).columns) == ["sp", "ux"]
        assert list(simulation.particles(0.0, []).columns) == ["sp"]
        assert set(simulation.particles(0.0).columns) == {"sp", *simulation.particle_columns}

    def test_species_counts(self):
        simulation = DemoSimulation("demo:x")
        assert simulation.species_counts(first_particle_time(simulation)) == {
            1: 20_000,
            2: 20_000,
            3: 20_000,
        }
