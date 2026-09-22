import json
import os
import urllib.error
import urllib.request

from supabase import create_client

SILICONFLOW_API_BASE_URL = "https://api.siliconflow.cn/v1"
SILICONFLOW_EMBEDDINGS_URL = (
    f"{SILICONFLOW_API_BASE_URL}/embeddings"
)
EMBEDDING_MODEL = "BAAI/bge-m3"
EXPECTED_DIMENSION = 1024

MEMORY_TEXT = "今天中午吃了红烧肉，是女儿送来的"
QUERY_TEXT = "我吃午饭了吗"


def require_env(name):
    value = os.environ.get(name)
    if not value:
        print(f"请在 Windows 环境变量中配置 {name}")
        raise SystemExit(1)
    return value


def embed_text(text, api_key):
    payload = {
        "model": EMBEDDING_MODEL,
        "input": text,
    }

    request = urllib.request.Request(
        SILICONFLOW_EMBEDDINGS_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        print(f"调用 SiliconFlow API 失败：HTTP {exc.code}")
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"调用 SiliconFlow API 失败：{exc.reason}")
        raise SystemExit(1) from exc

    api_result = json.loads(response_body)
    embedding = api_result["data"][0]["embedding"]

    if len(embedding) != EXPECTED_DIMENSION:
        print(
            f"向量维度错误：期望 {EXPECTED_DIMENSION}，"
            f"实际 {len(embedding)}"
        )
        raise SystemExit(1)

    return embedding


def main():
    siliconflow_api_key = require_env("SILICONFLOW_API_KEY")
    supabase_url = require_env("SUPABASE_URL")
    supabase_service_role_key = require_env(
        "SUPABASE_SERVICE_ROLE_KEY"
    )

    supabase = create_client(
        supabase_url,
        supabase_service_role_key,
    )

    memory_embedding = embed_text(
        MEMORY_TEXT,
        siliconflow_api_key,
    )
    query_embedding = embed_text(
        QUERY_TEXT,
        siliconflow_api_key,
    )

    patient_response = (
        supabase
        .table("patients")
        .insert(
            {
                "name": "RAG 测试患者",
                "family_contact": "test-contact",
            }
        )
        .execute()
    )

    if not patient_response.data:
        print("创建测试患者失败")
        raise SystemExit(1)

    patient_id = patient_response.data[0]["id"]

    memory_response = (
        supabase
        .table("memories")
        .insert(
            {
                "patient_id": patient_id,
                "content": MEMORY_TEXT,
                "embedding": memory_embedding,
            }
        )
        .execute()
    )

    if not memory_response.data:
        print("创建测试记忆失败")
        raise SystemExit(1)

    match_response = (
        supabase
        .rpc(
            "match_memories",
            {
                "p_patient_id": patient_id,
                "p_query_embedding": query_embedding,
                "p_match_count": 1,
            },
        )
        .execute()
    )

    if not match_response.data:
        print("未检索到相关记忆")
        return

    match = match_response.data[0]

    print("检索结果：")
    print(f"内容：{match['content']}")
    print(f"相似度：{match['similarity']}")


if __name__ == "__main__":
    main()