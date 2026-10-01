"""A thread-safe LRU cache for data read from disk (field steps, particle columns).

Bounded by a byte budget rather than an item count, since one 3D field step
can be gigabytes. Concurrent requests for the same key share a single load;
requests for other keys (and cache hits) never wait behind it.
"""

import threading
from collections import OrderedDict
from collections.abc import Callable, Hashable
from concurrent.futures import Future
from typing import Generic, TypeVar

import numpy as np
import pandas as pd

T = TypeVar("T")


def size_of(value: object) -> int:
    """Approximate memory held by a cached value, in bytes."""
    if isinstance(value, np.ndarray):
        return int(value.nbytes)
    if isinstance(value, pd.DataFrame):
        return int(value.memory_usage(index=True, deep=False).sum())
    nbytes = getattr(value, "nbytes", None)
    return int(nbytes) if isinstance(nbytes, (int, np.integer)) else 0


class StepCache(Generic[T]):
    def __init__(
        self,
        max_bytes: int | None = None,
        max_items: int | None = None,
        size: Callable[[object], int] = size_of,
    ) -> None:
        self._max_bytes = max_bytes
        self._max_items = max_items
        self._size = size
        self._items: OrderedDict[Hashable, tuple[T, int]] = OrderedDict()
        self._bytes = 0
        self._loading: dict[Hashable, Future[T]] = {}
        self._lock = threading.Lock()

    @property
    def nbytes(self) -> int:
        return self._bytes

    def __len__(self) -> int:
        return len(self._items)

    def peek(self, key: Hashable) -> T | None:
        """The cached value (marked as recently used), or None."""
        with self._lock:
            if key not in self._items:
                return None
            self._items.move_to_end(key)
            return self._items[key][0]

    def put(self, key: Hashable, value: T) -> None:
        with self._lock:
            self._insert(key, value)

    def get(self, key: Hashable, load: Callable[[], T]) -> T:
        """The cached value, or `load()` it (once, however many callers ask)."""
        with self._lock:
            if key in self._items:
                self._items.move_to_end(key)
                return self._items[key][0]
            pending = self._loading.get(key)
            owner = pending is None
            if owner:
                pending = self._loading[key] = Future()
        assert pending is not None
        if not owner:
            return pending.result()

        try:
            value = load()
        except BaseException as error:
            with self._lock:
                del self._loading[key]
            pending.set_exception(error)  # waiters see it too; nothing is cached
            raise
        with self._lock:
            self._insert(key, value)
            del self._loading[key]
        pending.set_result(value)
        return value

    def _insert(self, key: Hashable, value: T) -> None:
        if key in self._items:
            self._bytes -= self._items.pop(key)[1]
        nbytes = self._size(value)
        self._items[key] = (value, nbytes)
        self._bytes += nbytes
        # Evict least recently used, but always keep the newest value (even if
        # it alone exceeds the budget: it is about to be used).
        while len(self._items) > 1 and (
            (self._max_bytes is not None and self._bytes > self._max_bytes)
            or (self._max_items is not None and len(self._items) > self._max_items)
        ):
            _, (_, evicted) = self._items.popitem(last=False)
            self._bytes -= evicted
