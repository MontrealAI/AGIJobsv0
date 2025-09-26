import os
import sys
import types
import unittest

os.environ.setdefault("RPC_URL", "http://localhost:8545")

try:
    import fastapi  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    pass
else:
    if not hasattr(fastapi.APIRouter, "add_exception_handler"):
        def _add_exception_handler(self, exc_class, handler):  # type: ignore[no-untyped-def]
            if not hasattr(self, "exception_handlers"):
                self.exception_handlers = {}  # type: ignore[attr-defined]
            self.exception_handlers[exc_class] = handler  # type: ignore[index]

        fastapi.APIRouter.add_exception_handler = _add_exception_handler  # type: ignore[attr-defined]

try:
    import web3  # type: ignore  # noqa: F401
except ModuleNotFoundError:
    pass
else:
    middleware_module = sys.modules.get("web3.middleware") or types.ModuleType("web3.middleware")
    if not hasattr(middleware_module, "geth_poa_middleware"):
        def _noop_geth_poa_middleware(*_args, **_kwargs):  # type: ignore[no-untyped-def]
            return None

        middleware_module.geth_poa_middleware = _noop_geth_poa_middleware  # type: ignore[attr-defined]
        sys.modules["web3.middleware"] = middleware_module

from routes.onebox import PlanRequest, plan  # noqa: E402  pylint: disable=wrong-import-position


class PlannerIntentTests(unittest.IsolatedAsyncioTestCase):
    async def test_status_intent_infers_job_id(self) -> None:
        response = await plan(PlanRequest(text="Status of job 456"))
        self.assertEqual(response.intent.action, "check_status")
        self.assertEqual(response.intent.payload.jobId, 456)
        self.assertIn("status of job 456", response.summary.lower())

    async def test_finalize_intent_infers_job_id(self) -> None:
        response = await plan(PlanRequest(text="Finalize job 123"))
        self.assertEqual(response.intent.action, "finalize_job")
        self.assertEqual(response.intent.payload.jobId, 123)
        self.assertIn("finalize job 123", response.summary.lower())


if __name__ == "__main__":
    unittest.main()
