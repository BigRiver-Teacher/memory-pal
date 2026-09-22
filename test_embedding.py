import json
import os
import urllib.error
import urllib.request

API_BASE_URL = "https://api.siliconflow.cn/v1"
EMBEDDINGS_URL = f"{API_BASE_URL}/embeddings"
MODEL_NAME = "BAAI/bge-m3"
INPUT_TEXT = "我年轻的时候在南京当老师，教语文"
EXPECTED_DIMENSION = 1024
MISSING_API_KEY_MESSAGE = "请在 Windows 环境变量中配置 SILICONFLOW_API_KEY"


def request_embedding(api_key):
    payload = {
        "model": MODEL_NAME,
        "input": INPUT_TEXT,
    }
    request = urllib.request.Request(
        EMBEDDINGS_URL,
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
    return api_result["data"][0]["embedding"]


def main():
    api_key = os.environ.get("SILICONFLOW_API_KEY")
    if not api_key:
        print(MISSING_API_KEY_MESSAGE)
        raise SystemExit(1)

    embedding = request_embedding(api_key)
    dimension = len(embedding)

    if dimension != EXPECTED_DIMENSION:
        print(f"向量维度错误：期望 {EXPECTED_DIMENSION}，实际 {dimension}")
        raise SystemExit(1)

    first_five = ", ".join(str(value) for value in embedding[:5])
    print(f"向量维度：{dimension}")
    print(f"前 5 个数值：{first_five}")


if __name__ == "__main__":
    main()