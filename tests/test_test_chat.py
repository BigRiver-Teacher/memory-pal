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

    def test_reply_validation_switches_strategy(self):
        self.assertTrue(
            test_chat.is_acceptable_reply(
                "您中午吃了红烧肉，是女儿送来的。",
                test_chat.STATEMENT_CONFIRMATION,
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply(
                "您中午吃了吗？",
                test_chat.STATEMENT_CONFIRMATION,
            )
        )
        self.assertTrue(
            test_chat.is_acceptable_reply(
                "您想女儿了，能跟我说说以前开心的事吗？",
                test_chat.EMOTION_VALIDATION,
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply(
                "您想女儿了，还记得吗？能说说吗？",
                test_chat.EMOTION_VALIDATION,
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply(
                "您想女儿了，您还记得我是谁吗？",
                test_chat.EMOTION_VALIDATION,
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply(
                "您可能吃过午饭。",
                test_chat.STATEMENT_CONFIRMATION,
            )
        )
        self.assertFalse(
            test_chat.is_acceptable_reply(
                "好" * 51,
                test_chat.STATEMENT_CONFIRMATION,
            )
        )

    def test_build_system_prompt_switches_by_scenario(self):
        memories = [
            {"content": test_chat.MEMORY_TEXTS[0]},
            {"content": test_chat.MEMORY_TEXTS[1]},
        ]

        statement_prompt = test_chat.build_system_prompt(
            memories,
            test_chat.PATIENT_INPUT,
            test_chat.STATEMENT_CONFIRMATION,
        )
        emotion_prompt = test_chat.build_system_prompt(
            memories,
            test_chat.SECOND_PATIENT_INPUT,
            test_chat.EMOTION_VALIDATION,
        )

        for memory in memories:
            self.assertIn(memory["content"], statement_prompt)
            self.assertIn(memory["content"], emotion_prompt)

        self.assertIn(test_chat.PATIENT_INPUT, statement_prompt)
        self.assertIn("只能使用陈述句温和确认", statement_prompt)
        self.assertIn("不能出现问号", statement_prompt)

        self.assertIn(test_chat.SECOND_PATIENT_INPUT, emotion_prompt)
        self.assertIn("认可患者的情绪", emotion_prompt)
        self.assertIn("温和引导患者回忆", emotion_prompt)
        self.assertIn("允许温和的引导式提问", emotion_prompt)
        self.assertIn("禁止测试性提问", emotion_prompt)
        self.assertIn("最多只能包含一个问号", emotion_prompt)
        self.assertIn("您还记得我是谁吗？", emotion_prompt)
        self.assertIn("您知道今天几号吗？", emotion_prompt)

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

    def test_generate_reply_retries_two_questions_in_statement_scenario(self):
        memories = [{"content": test_chat.MEMORY_TEXTS[0]}]
        valid_reply = "您中午吃了红烧肉，是女儿送来的。"

        with patch(
            "test_chat.request_deepseek_reply",
            side_effect=["您吃了吗？还记得吗？", valid_reply],
        ) as request_reply:
            reply = test_chat.generate_reply(
                "deepseek-secret",
                memories,
                test_chat.PATIENT_INPUT,
                test_chat.STATEMENT_CONFIRMATION,
            )

        self.assertEqual(reply, valid_reply)
        self.assertEqual(request_reply.call_count, 2)
        retry_messages = request_reply.call_args_list[1].args[1]
        self.assertIn(
            "不能出现问号",
            retry_messages[-1]["content"],
        )

    def test_generate_reply_allows_one_question_in_emotion_scenario(self):
        memories = [{"content": test_chat.MEMORY_TEXTS[1]}]
        valid_reply = "您想女儿了，能跟我说说以前开心的事吗？"

        with patch(
            "test_chat.request_deepseek_reply",
            return_value=valid_reply,
        ) as request_reply:
            reply = test_chat.generate_reply(
                "deepseek-secret",
                memories,
                test_chat.SECOND_PATIENT_INPUT,
                test_chat.EMOTION_VALIDATION,
            )

        self.assertEqual(reply, valid_reply)
        request_reply.assert_called_once()

    def test_main_runs_both_scenarios_and_saves_both_conversations(self):
        fake_supabase = FakeSupabase()
        memory_embedding_one = [0.1] * test_chat.EXPECTED_DIMENSION
        memory_embedding_two = [0.2] * test_chat.EXPECTED_DIMENSION
        query_embedding_one = [0.3] * test_chat.EXPECTED_DIMENSION
        query_embedding_two = [0.4] * test_chat.EXPECTED_DIMENSION
        reply_one = "您今天中午吃了红烧肉，是女儿小芳送来的。"
        reply_two = "您想女儿了，能跟我说说以前开心的事吗？"
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
                    query_embedding_one,
                    query_embedding_two,
                ],
            ) as embed_text,
            patch(
                "test_chat.generate_reply",
                side_effect=[reply_one, reply_two],
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
                call(
                    test_chat.SECOND_PATIENT_INPUT,
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
        self.assertEqual(len(conversation_inserts), 2)
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
                    "content": reply_one,
                },
            ],
        )
        self.assertEqual(
            conversation_inserts[1],
            [
                {
                    "patient_id": "patient-123",
                    "role": "user",
                    "content": test_chat.SECOND_PATIENT_INPUT,
                },
                {
                    "patient_id": "patient-123",
                    "role": "assistant",
                    "content": reply_two,
                },
            ],
        )
        self.assertEqual(
            generate_reply.call_args_list,
            [
                call(
                    env["DEEPSEEK_API_KEY"],
                    fake_supabase.matches,
                    test_chat.PATIENT_INPUT,
                    test_chat.STATEMENT_CONFIRMATION,
                ),
                call(
                    env["DEEPSEEK_API_KEY"],
                    fake_supabase.matches,
                    test_chat.SECOND_PATIENT_INPUT,
                    test_chat.EMOTION_VALIDATION,
                ),
            ],
        )

        rendered_output = str(output.call_args_list)
        self.assertIn(test_chat.MEMORY_TEXTS[0], rendered_output)
        self.assertIn(test_chat.PATIENT_INPUT, rendered_output)
        self.assertIn(test_chat.SECOND_PATIENT_INPUT, rendered_output)
        self.assertIn(reply_one, rendered_output)
        self.assertIn(reply_two, rendered_output)
        self.assertNotIn("deepseek-secret", rendered_output)
        self.assertNotIn("siliconflow-secret", rendered_output)
        self.assertNotIn("supabase-secret", rendered_output)
        self.assertNotIn(str(memory_embedding_one), rendered_output)

if __name__ == "__main__":
    unittest.main()