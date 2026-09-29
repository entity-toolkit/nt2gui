"""A small thread-safe LRU cache for per-step data (e.g. particle frames)."""

import threading
from collections import OrderedDict
from collections.abc import Callable, Hashable
from typing import Generic, TypeVar

T = TypeVar("T")


class StepCache(Generic[T]):
    def __init__(self, size: int) -> None:
        self._size = size
        self._items: OrderedDict[Hashable, T] = OrderedDict()
        # Held while loading, so concurrent requests for a step share one read.
        self._lock = threading.Lock()

    def get(self, key: Hashable, load: Callable[[], T]) -> T:
        with self._lock:
            if key in self._items:
                self._items.move_to_end(key)
                return self._items[key]
            value = load()
            self._items[key] = value
            if len(self._items) > self._size:
                self._items.popitem(last=False)
            return value
