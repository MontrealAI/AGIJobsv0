import os
import sys
from pathlib import Path

os.environ.setdefault("PYTEST_DISABLE_PLUGIN_AUTOLOAD", "1")

for name in list(sys.modules):
    if name.startswith("alpha_node"):
        sys.modules.pop(name, None)

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"

for path in (SRC, ROOT):
    path_str = str(path)
    if path_str in sys.path:
        sys.path.remove(path_str)
    sys.path.insert(0, path_str)

if os.environ.get("DEMO_SYS_PATH_DEBUG"):
    print("alpha-node sys.path head", sys.path[:10])
