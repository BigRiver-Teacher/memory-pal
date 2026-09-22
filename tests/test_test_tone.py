import json
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

import test_tone


class FakeResponse:
    def __init__(self, content):
        self.content = content

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        payload = {"choices": [{"message": {"content": self.content}}]}
        return json.dumps(payload, ensure_ascii=False).encode("utf-8")


class ToneScriptTests(unittest.TestCase):
    def test_script_reads_environment_without_dotenv(self):
        source = (PROJECT_ROOT / "test_tone.py").read_text(encoding="utf-8")
        self.assertIn('os.environ.get("DEEPSEEK_API_KEY")', source)
        self.assertNotIn("load_dotenv", source)
        self.assertNotIn("dotenv", source)

    def test_missing_api_key_prints_error_and_exits(self):
        with patch.dict(os.environ, {}, clear=True), patch("builtins.print") as output:
            with self.assertRaises(SystemExit) as raised:
                test_tone.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with(test_tone.MISSING_API_KEY_MESSAGE)

    def test_generates_emotion_and_memory_reply_without_speculation(self):
        reply = "您想他了，我们聊聊以前开心的事，好吗？"
        with (
            patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-secret-key"}, clear=True),
            patch(
                "test_tone.urllib.request.urlopen",
                return_value=FakeResponse(reply),
            ) as urlopen,
            patch("builtins.print") as output,
        ):
            test_tone.main()

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))
        system_prompt = payload["messages"][0]["content"]

        self.assertEqual(payload["messages"][1]["content"], test_tone.PATIENT_MESSAGE)
        self.assertIn(test_tone.MEMORY, system_prompt)
        self.assertIn("禁止对任何不在场的人或事", system_prompt)
        self.assertIn("当前状态", system_prompt)
        self.assertIn("他可能在做xx", system_prompt)
        self.assertIn("他应该xx", system_prompt)
        self.assertIn("认可患者的情感", system_prompt)
        self.assertIn("转向回忆", system_prompt)
        self.assertIn(str(test_tone.MAX_REPLY_LENGTH), system_prompt)
        for word in test_tone.FORBIDDEN_WORDS + test_tone.SPECULATION_WORDS:
            self.assertIn(word, system_prompt)
        self.assertEqual(request.get_header("Authorization"), "Bearer test-secret-key")
        output.assert_called_once_with(reply)
        self.assertNotIn("test-secret-key", str(output.call_args.args))

    def test_retries_when_reply_contains_forbidden_word(self):
        valid_reply = "您想他了，我们聊聊以前开心的事，好吗？"
        with (
            patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-secret-key"}, clear=True),
            patch(
                "test_tone.urllib.request.urlopen",
                side_effect=[
                    FakeResponse("他已经过世了。"),
                    FakeResponse(valid_reply),
                ],
            ) as urlopen,
            patch("builtins.print") as output,
        ):
            test_tone.main()

        self.assertEqual(urlopen.call_count, 2)
        output.assert_called_once_with(valid_reply)

    def test_retries_when_reply_speculates_about_current_state(self):
        valid_reply = "您想他了，我们聊聊以前开心的事，好吗？"
        with (
            patch.dict(os.environ, {"DEEPSEEK_API_KEY": "test-secret-key"}, clear=True),
            patch(
                "test_tone.urllib.request.urlopen",
                side_effect=[
                    FakeResponse("他可能在家歇着呢。"),
                    FakeResponse(valid_reply),
                ],
            ) as urlopen,
            patch("builtins.print") as output,
        ):
            test_tone.main()

        self.assertEqual(urlopen.call_count, 2)
        output.assert_called_once_with(valid_reply)

    def test_rejects_reply_without_memory_transition(self):
        error = test_tone.get_reply_validation_error("您想他了，先喝口热茶吧。")
        self.assertEqual(error, "回复没有自然转向回忆")


if __name__ == "__main__":
    unittest.main()