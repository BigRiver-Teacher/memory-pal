import json
import os
import urllib.error
import urllib.request

API_URL = "https://api.deepseek.com/chat/completions"
MODEL = "deepseek-chat"
USER_INPUT = "我年轻的时候在南京当老师，教语文"
MISSING_API_KEY_MESSAGE = "请在 Windows 环境变量中配置 DEEPSEEK_API_KEY"
SYSTEM_PROMPT = (
    "请分析输入文本，并以 json 格式返回结果。"
    '结果结构必须是 {"entities": [], "emotion": ""}。'
)


def build_payload(text):
    return {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": text},
        ],
        "response_format": {"type": "json_object"},
    }


def call_deepseek(api_key, text):
    request = urllib.request.Request(
        API_URL,
        data=json.dumps(build_payload(text), ensure_ascii=False).encode("utf-8"),
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
        print(f"调用 DeepSeek API 失败：HTTP {exc.code}")
        raise SystemExit(1) from exc
    except urllib.error.URLError as exc:
        print(f"调用 DeepSeek API 失败：{exc.reason}")
        raise SystemExit(1) from exc

    api_result = json.loads(response_body)
    content = api_result["choices"][0]["message"]["content"]
    return json.loads(content)


def main():
    api_key = os.environ.get("DEEPSEEK_API_KEY")
    if not api_key:
        print(MISSING_API_KEY_MESSAGE)
        raise SystemExit(1)

    result = call_deepseek(api_key, USER_INPUT)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()