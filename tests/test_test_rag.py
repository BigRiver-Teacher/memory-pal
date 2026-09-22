import json
import os
import sys
import types
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

PROJECT_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT_ROOT))

try:
    import supabase  # noqa: F401
except ModuleNotFoundError:
    supabase_stub = types.ModuleType("supabase")
    supabase_stub.create_client = None
    sys.modules["supabase"] = supabase_stub

import test_rag


class FakeResponse:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        return False

    def read(self):
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


class FakeQuery:
    def __init__(self, table_name, captured):
        self.table_name = table_name
        self.captured = captured

    def insert(self, payload):
        self.captured[f"insert:{self.table_name}"] = payload
        return self

    def execute(self):
        if self.table_name == "patients":
            return SimpleNamespace(data=[{"id": "patient-123"}])
        if self.table_name == "memories":
            return SimpleNamespace(data=[{"id": "memory-123"}])
        raise AssertionError(f"Unexpected table: {self.table_name}")


class FakeRpc:
    def __init__(self, captured):
        self.captured = captured
        self.rpc_name = None
        self.params = None

    def __call__(self, rpc_name, params):
        self.rpc_name = rpc_name
        self.params = params
        self.captured["rpc"] = {
            "name": rpc_name,
            "params": params,
        }
        return self

    def execute(self):
        if self.rpc_name != "match_memories":
            raise AssertionError(f"Unexpected RPC: {self.rpc_name}")
        return SimpleNamespace(
            data=[
                {
                    "content": test_rag.MEMORY_TEXT,
                    "similarity": 0.91,
                }
            ]
        )


class FakeSupabase:
    def __init__(self):
        self.captured = {}

    def table(self, table_name):
        return FakeQuery(table_name, self.captured)

    def rpc(self, rpc_name, params):
        fake_rpc = FakeRpc(self.captured)
        return fake_rpc(rpc_name, params)


class RagScriptTests(unittest.TestCase):
    def test_script_reads_required_environment_values_without_dotenv(self):
        source = (PROJECT_ROOT / "test_rag.py").read_text(encoding="utf-8")
        for name in (
            "SILICONFLOW_API_KEY",
            "SUPABASE_URL",
            "SUPABASE_SERVICE_ROLE_KEY",
        ):
            self.assertIn(f'os.environ.get(name)', source)
            self.assertIn(name, source)
        self.assertNotIn("load_dotenv", source)
        self.assertNotIn("dotenv", source)

    def test_missing_environment_value_prints_error_and_exits(self):
        with patch.dict(os.environ, {}, clear=True), patch("builtins.print") as output:
            with self.assertRaises(SystemExit) as raised:
                test_rag.main()

        self.assertEqual(raised.exception.code, 1)
        output.assert_called_once_with(
            "请在 Windows 环境变量中配置 SILICONFLOW_API_KEY"
        )

    def test_embed_text_uses_siliconflow_openai_compatible_format(self):
        embedding = [0.25] * test_rag.EXPECTED_DIMENSION
        api_result = {"data": [{"embedding": embedding}]}

        with patch(
            "test_rag.urllib.request.urlopen",
            return_value=FakeResponse(api_result),
        ) as urlopen:
            result = test_rag.embed_text("测试文本", "test-secret-key")

        request = urlopen.call_args.args[0]
        payload = json.loads(request.data.decode("utf-8"))

        self.assertEqual(result, embedding)
        self.assertEqual(request.full_url, test_rag.SILICONFLOW_EMBEDDINGS_URL)
        self.assertEqual(payload["model"], test_rag.EMBEDDING_MODEL)
        self.assertEqual(payload["input"], "测试文本")
        self.assertEqual(
            request.get_header("Authorization"),
            "Bearer test-secret-key",
        )

    def test_main_inserts_memory_and_queries_nearest_match(self):
        memory_embedding = [0.1] * test_rag.EXPECTED_DIMENSION
        query_embedding = [0.2] * test_rag.EXPECTED_DIMENSION
        fake_supabase = FakeSupabase()
        env = {
            "SILICONFLOW_API_KEY": "siliconflow-secret",
            "SUPABASE_URL": "https://example.supabase.co",
            "SUPABASE_SERVICE_ROLE_KEY": "supabase-secret",
        }

        with (
            patch.dict(os.environ, env, clear=True),
            patch(
                "test_rag.embed_text",
                side_effect=[memory_embedding, query_embedding],
            ) as embed_text,
            patch(
                "test_rag.create_client",
                return_value=fake_supabase,
            ) as create_client,
            patch("builtins.print") as output,
        ):
            test_rag.main()

        create_client.assert_called_once_with(
            env["SUPABASE_URL"],
            env["SUPABASE_SERVICE_ROLE_KEY"],
        )
        self.assertEqual(
            embed_text.call_args_list[0].args,
            (test_rag.MEMORY_TEXT, env["SILICONFLOW_API_KEY"]),
        )
        self.assertEqual(
            embed_text.call_args_list[1].args,
            (test_rag.QUERY_TEXT, env["SILICONFLOW_API_KEY"]),
        )

        patient_insert = fake_supabase.captured["insert:patients"]
        memory_insert = fake_supabase.captured["insert:memories"]
        rpc_call = fake_supabase.captured["rpc"]

        self.assertNotIn("owner_id", patient_insert)
        self.assertEqual(memory_insert["patient_id"], "patient-123")
        self.assertEqual(memory_insert["content"], test_rag.MEMORY_TEXT)
        self.assertEqual(memory_insert["embedding"], memory_embedding)
        self.assertEqual(rpc_call["name"], "match_memories")
        self.assertEqual(
            rpc_call["params"],
            {
                "p_patient_id": "patient-123",
                "p_query_embedding": query_embedding,
                "p_match_count": 1,
            },
        )

        rendered_output = str(output.call_args_list)
        self.assertIn(test_rag.MEMORY_TEXT, rendered_output)
        self.assertIn("0.91", rendered_output)
        self.assertNotIn("siliconflow-secret", rendered_output)
        self.assertNotIn("supabase-secret", rendered_output)
        self.assertNotIn(str(memory_embedding), rendered_output)


if __name__ == "__main__":
    unittest.main()