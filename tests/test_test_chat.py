import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import call, patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import supabase  # noqa: F401
except ModuleNotFoundError:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.create_client = None
    sys.modules["supabase"] = supabase_stub

import test_chat


class FakeTableQuery:
    def __init__(self, table_name, captured):
        self.table_name = table_name
        self.captured = captured
        self.operation = None
        self.payload = None

    def select(self, columns):
        self.operation = "select"
        return self

    def eq(self, column, value):
        return self

    def limit(self, count):
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.payload = payload
        self.captured.setdefault(
            f"insert:{self.table_name}",
            [],
        ).append(payload)
        return self

    def execute(self):
        if self.table_name == "patients":
            if self.operation == "select":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[{"id": "patient-123"}])

        if self.table_name == "memories":
            if self.operation == "select":
                return SimpleNamespace(data=[])
            return SimpleNamespace(data=[{"id": "memory-123"}])

        if self.table_name == "conversations":
            return SimpleNamespace(data=self.payload)

        raise AssertionError(
            f"Unexpected table: {self.table_name}"
        )


class FakeRpcQuery:
    def __init__(self, captured, matches):
        self.captured = captured
        self.matches = matches

    def execute(self):
        return SimpleNamespace(data=self.matches)


class FakeSupabase:
    def __init__(self):
        self.captured = {}
        self.matches = [
            {
                "content": test_chat.MEMORY_TEXTS[0],
                "similarity": 0.96,
            },
            {
                "content": test_chat.MEMORY_TEXTS[1],
                "similarity": 0.72,
            },
        ]

    def table(self, table_name):
        return FakeTableQuery(table_name, self.captured)

    def rpc(self, rpc_name, params):
        self.captured["rpc"] = {
            "name": rpc_name,
            "params": params,
        }
        return FakeRpcQuery(self.captured, self.matches)


class ChatScriptTests(unittest.TestCase):
    def test_script_reads_required_environment_values_without_dotenv(self):
        source = (PROJECT_ROOT / "test_chat.py").read_text(
            encoding="utf-8"
        )
        for name in (
            "DEEPSEEK_API_KEY",
            "SILICONFLOW_API_KEY",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
        ):
            self.assertIn(name, source)
            self.assertIn("os.environ.get(name)", source)
        self.assertNotIn("load_dotenv", source)
        self.assertNotIn("dotenv", source)

    def test_missing_environment_value_prints_error_and_exits(self):
        with patch.dict(os.environ, {}, clear=True), patch(
            "builtins.print"
        ) as output:
            with self.assertRaises(SystemExit) as raised:
                test_chat.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with(
            "请在 Windows 环境变量中配置 DEEPSEEK_API_KEY"
        )

    def test_reply_validation_rejects_question_speculation_and_length(self):
        self.assertTrue(
            test_chat.is_acceptable_reply(
                "您中午吃了红烧肉，是女儿送来的。"
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply("您中午吃了吗？")
        )
        self.assertFalse(
            test_chat.is_acceptable_reply("您可能吃过午饭。")
        )
        self.assertFalse(
            test_chat.is_acceptable_reply("好" * 51)
        )

    def test_system_prompt_contains_memories_and_tone_constraints(self):
        memories = [
            {"content": test_chat.MEMORY_TEXTS[0]},
            {"content": test_chat.MEMORY_TEXTS[1]},
        ]

        prompt = test_chat.build_system_prompt(memories)

        for memory in memories:
            self.assertIn(memory["content"], prompt)
        self.assertIn("温和确认", prompt)
        self.assertIn("不得编造", prompt)
        self.assertIn("不得追问", prompt)
        self.assertIn("不能出现问号", prompt)
        self.assertIn(str(test_chat.MAX_REPLY_LENGTH), prompt)

    def test_retrieve_memories_requests_top_two(self):
        fake_supabase = FakeSupabase()
        query_embedding = [0.25] * test_chat.EXPECTED_DIMENSION

        matches = test_chat.retrieve_memories(
            fake_supabase,
            "patient-123",
            query_embedding,
        )

        self.assertEqual(matches, fake_supabase.matches)
        self.assertEqual(
            fake_supabase.captured["rpc"],
            {
                "name": "match_memories",
                "params": {
                    "p_patient_id": "patient-123",
                    "p_query_embedding": query_embedding,
                    "p_match_count": 2,
                },
            },
        )

    def test_generate_reply_retries_invalid_question(self):
        memories = [{"content": test_chat.MEMORY_TEXTS[0]}]
        valid_reply = "您中午吃了红烧肉，是女儿送来的。"

        with patch(
            "test_chat.request_deepseek_reply",
            side_effect=["您中午吃了吗？", valid_reply],
        ) as request_reply:
            reply = test_chat.generate_reply(
                "deepseek-secret",
                memories,
            )

        self.assertEqual(reply, valid_reply)
        self.assertEqual(request_reply.call_count, 2)
        retry_messages = request_reply.call_args_list[1].args[1]
        self.assertIn(
            "不得追问或反问",
            retry_messages[-1]["content"],
        )

    def test_main_inserts_memories_and_saves_conversation(self):
        fake_supabase = FakeSupabase()
        memory_embedding_one = [0.1] * test_chat.EXPECTED_DIMENSION
        memory_embedding_two = [0.2] * test_chat.EXPECTED_DIMENSION
        query_embedding = [0.3] * test_chat.EXPECTED_DIMENSION
        reply = "您中午吃了红烧肉，是女儿送来的。"
        env = {
            "DEEPSEEK_API_KEY": "deepseek-secret",
            "SILICONFLOW_API_KEY": "siliconflow-secret",
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "supabase-secret",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch(
                "test_chat.create_client",
                return_value=fake_supabase,
            ) as create_client,
            patch(
                "test_chat.embed_text",
                side_effect=[
                    memory_embedding_one,
                    memory_embedding_two,
                    query_embedding,
                ],
            ) as embed_text,
            patch(
                "test_chat.generate_reply",
                return_value=reply,
            ) as generate_reply,
            patch("builtins.print") as output,
        ):
            test_chat.main()

        create_client.assert_called_once_with(
            env["SUPABASE_URL"],
            env["SUPABASE_SERVICE_ROLE_KEY"],
        )
        self.assertEqual(
            embed_text.call_args_list,
            [
                call(
                    test_chat.MEMORY_TEXTS[0],
                    env["SILICONFLOW_API_KEY"],
                ),
                call(
                    test_chat.MEMORY_TEXTS[1],
                    env["SILICONFLOW_API_KEY"],
                ),
                call(
                    test_chat.PATIENT_INPUT,
                    env["SILICONFLOW_API_KEY"],
                ),
            ],
        )

        patient_inserts = fake_supabase.captured[
            "insert:patients"
        ]
        memory_inserts = fake_supabase.captured[
            "insert:memories"
        ]
        conversation_inserts = fake_supabase.captured[
            "insert:conversations"
        ]

        self.assertEqual(len(patient_inserts), 1)
        self.assertEqual(
            patient_inserts[0]["family_contact"],
            test_chat.TEST_FAMILY_CONTACT,
        )
        self.assertEqual(
            [item["content"] for item in memory_inserts],
            list(test_chat.MEMORY_TEXTS),
        )
        self.assertEqual(
            conversation_inserts[0],
            [
                {
                    "patient_id": "patient-123",
                    "role": "user",
                    "content": test_chat.PATIENT_INPUT,
                },
                {
                    "patient_id": "patient-123",
                    "role": "assistant",
                    "content": reply,
                },
            ],
        )
        generate_reply.assert_called_once_with(
            env["DEEPSEEK_API_KEY"],
            fake_supabase.matches,
        )

        rendered_output = str(output.call_args_list)
        self.assertIn(test_chat.MEMORY_TEXTS[0], rendered_output)
        self.assertIn(reply, rendered_output)
        self.assertNotIn("deepseek-secret", rendered_output)
        self.assertNotIn("siliconflow-secret", rendered_output)
        self.assertNotIn("supabase-secret", rendered_output)
        self.assertNotIn(str(memory_embedding_one), rendered_output)


if __name__ == "__main__":
    unittest.main()