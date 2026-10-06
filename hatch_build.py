"""Refuse to build a wheel without the client, which would serve no UI."""

from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        if version == "editable":  # served from the checkout; built on demand
            return
        index = Path(self.root) / "nt2gui" / "static" / "index.html"
        if not index.is_file():
            raise RuntimeError(
                f"{index} is missing: run `npm run build` before building the wheel "
                "(or use `npm run package`)."
            )
