"""Transport validation without subprocesses; these tests have not been executed."""

import io
import json
import unittest
from unittest.mock import patch

from mines_lab_analysis.__main__ import main


class CliBoundaryTests(unittest.TestCase):
    def call(self, raw: bytes, args=None):
        stdin = io.TextIOWrapper(io.BytesIO(raw), encoding="utf-8")
        stdout = io.StringIO()
        with patch("sys.stdin", stdin), patch("sys.stdout", stdout), patch("sys.argv", ["mines_lab_analysis"]+(args or [])):
            code = main()
        return code, json.loads(stdout.getvalue())

    def test_valid_request_is_json_and_versioned(self):
        code, result = self.call(b'{"gameId":"mines","input":{"mines":3,"picks":3}}')
        self.assertEqual(code, 0)
        self.assertEqual(result["engineVersion"], "4.0.0")
        self.assertEqual(result["signal"]["gameId"], "mines")

    def test_nan_and_bad_game_rejected(self):
        for raw in (b'{"gameId":"mines","input":{"mines":NaN}}', b'{"gameId":"unknown","input":{}}', b'[]'):
            code, result = self.call(raw)
            self.assertEqual(code, 2)
            self.assertIn("error", result)

    def test_invalid_game_input_is_explicit_unavailable(self):
        code, result = self.call(b'{"gameId":"mines","input":{"mines":true,"picks":3}}')
        self.assertEqual(code, 2)
        self.assertEqual(result["signal"]["status"], "unavailable")
        self.assertIsNone(result["signal"]["action"])

    def test_transport_limit_is_bytes(self):
        code, result = self.call(b" "*1_048_577)
        self.assertEqual(code, 2)
        self.assertEqual(result["error"], "request exceeds 1 MiB")
