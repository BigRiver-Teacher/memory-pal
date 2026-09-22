import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import test_ai


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


class DeepSeekScriptTests(unittest.TestCase):
    def test_script_does_not_load_dotenv(self):
        source = (PROJECT_ROOT / "test_ai.py").read_text(encoding="utf-8")
        self.assertIn('os.environ.get("DEEPSEEK_API_KEY")', source)
        self.assertNotIn("load_dotenv", source)
        self.assertNotIn("dotenv", source)

    def test_missing_api_key_prints_error_and_exits(self):
        with patch.dict(os.environ, {}, clear=True), patch("builtins.print") as output:
            with self.assertRaises(SystemExit) as raised:
                test_ai.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with(test_ai.MISSING_API_KEY_MESSAGE)

    def test_calls_deepseek_with_environment_key_and_json_format(self):
        api_result = {
            "choices": [
                {
                    "message": {
                        "content": '{"entities": [], "emotion": "怀念"}'
                    }
                }
            ]
        }
        with (
            patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-secret-key"}, clear=True),
            patch("test_ai.urllib.request.urlopen", return_value=FakeResponse(api_result)) as urlopen,
            patch("builtins.print") as output,
        ):
            test_ai.main()

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))

        self.assertEqual(payload["messages"][1]["content"], test_ai.USER_INPUT)
        self.assertEqual(payload["response_format"], {"type": "json_object"})
        self.assertIn("json", payload["messages"][0]["content"].lower())
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret-key")
        self.assertNotIn("test-secret-key", str(output.call_args.args))


if __name__ == "__main__":
    unittest.main()