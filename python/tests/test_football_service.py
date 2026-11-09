import importlib
import os
import unittest
from types import SimpleNamespace


class FootballServiceAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.previous_token = os.environ.get("FOOTBALL_MODEL_API_TOKEN")
        os.environ["FOOTBALL_MODEL_API_TOKEN"] = "test-service-token-with-more-than-thirty-two-characters"
        cls.service = importlib.import_module("football_service.main")

    @classmethod
    def tearDownClass(cls):
        if cls.previous_token is None:
            os.environ.pop("FOOTBALL_MODEL_API_TOKEN", None)
        else:
            os.environ["FOOTBALL_MODEL_API_TOKEN"] = cls.previous_token

    def test_health_is_public_and_identifies_the_service(self):
        self.assertEqual(self.service.health(), {"status": "ok", "service": "football-analysis"})

    def test_private_endpoints_require_the_configured_bearer_token(self):
        self.service._authorize(SimpleNamespace(headers={
            "authorization": "Bearer test-service-token-with-more-than-thirty-two-characters",
        }))
        for value in ("", "Bearer wrong-token", "test-service-token-with-more-than-thirty-two-characters"):
            with self.subTest(value=value):
                with self.assertRaises(self.service.HTTPException) as raised:
                    self.service._authorize(SimpleNamespace(headers={"authorization": value}))
                self.assertEqual(raised.exception.status_code, 401)

    def test_short_server_token_fails_closed(self):
        original = self.service.SERVICE_TOKEN
        self.service.SERVICE_TOKEN = "short"
        try:
            with self.assertRaises(self.service.HTTPException) as raised:
                self.service._authorize(SimpleNamespace(headers={"authorization": "Bearer short"}))
            self.assertEqual(raised.exception.status_code, 401)
        finally:
            self.service.SERVICE_TOKEN = original


if __name__ == "__main__":
    unittest.main()
