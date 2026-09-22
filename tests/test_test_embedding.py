import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import call, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import test_embedding


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


class EmbeddingScriptTests(unittest.TestCase):
    def test_script_reads_environment_without_dotenv(self):
        source = (PROJECT_ROOT / "test_embedding.py").read_text(encoding="utf-8")
        self.assertIn('os.environ.get("SILICONFLOW_API_KEY")', source)
        self.assertNotIn("load_dotenv", source)
        self.assertNotIn("dotenv", source)

    def test_missing_api_key_prints_error_and_exits(self):
        with patch.dict(os.environ, {}, clear=True), patch("builtins.print") as output:
            with self.assertRaises(SystemExit) as raised:
                test_embedding.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with(test_embedding.MISSING_API_KEY_MESSAGE)

    def test_requests_embedding_and_prints_only_dimension_and_first_five(self):
        embedding = [index / 10 for index in range(1024)]
        api_result = {"data": [{"embedding": embedding}]}

        with (
            patch.dict(
                os.environ,
                {"SILICONFLOW_API_KEY": "test-secret-key"},
                clear=True,
            ),
            patch(
                "test_embedding.urllib.request.urlopen",
                return_value=FakeResponse(api_result),
            ) as urlopen,
            patch("builtins.print") as output,
        ):
            test_embedding.main()

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))

        self.assertEqual(request.full_url, test_embedding.EMBEDDINGS_URL)
        self.assertEqual(payload["model"], test_embedding.MODEL_NAME)
        self.assertEqual(payload["input"], test_embedding.INPUT_TEXT)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret-key")
        self.assertEqual(
            output.call_args_list,
            [
                call("向量维度：1024"),
                call("前 5 个数值：0.0, 0.1, 0.2, 0.3, 0.4"),
            ],
        )
        rendered_output = str(output.call_args_list)
        self.assertNotIn("test-secret-key", rendered_output)
        self.assertNotIn("1023.0", rendered_output)

    def test_rejects_unexpected_embedding_dimension(self):
        api_result = {"data": [{"embedding": [0.1, 0.2]}]}
        with (
            patch.dict(
                os.environ,
                {"SILICONFLOW_API_KEY": "test-secret-key"},
                clear=True,
            ),
            patch(
                "test_embedding.urllib.request.urlopen",
                return_value=FakeResponse(api_result),
            ),
            patch("builtins.print") as output,
        ):
            with self.assertRaises(SystemExit) as raised:
                test_embedding.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with("向量维度错误：期望 1024，实际 2")


if __name__ == "__main__":
    unittest.main()