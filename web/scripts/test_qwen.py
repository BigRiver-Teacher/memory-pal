import json
import os
import sys
import urllib.error
import urllib.request

QWEN_API_KEY_NAME = "QWEN_API_KEY"
QWEN_BASE_URL_NAME = "QWEN_BASE_URL"
QWEN_MODEL_DEFAULT = "qwen-plus"
JSON_TEST_PROMPT = (
    "从'我昨天在南京吃了碗面'里提取实体和情绪，"
    '输出JSON格式：{"entities": [], "emotion": ""}'
)


def get_required_env(name):
    value = os.environ.get(name)
    if not value:
        print(f"请在 Windows 环境变量中配置 {name}", file=sys.stderr)
        raise SystemExit(1)
    return value


def request_chat(api_key, base_url, model, prompt, json_mode=False):
    endpoint = f"{base_url.rstrip('/')}/chat/completions"
    payload = {
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1,
    }

    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    request = urllib.request.Request(
        endpoint,
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
        body = exc.read().decode("utf-8", errors="replace")
        return False, f"HTTP {exc.code}: {body}"
    except urllib.error.URLError as exc:
        return False, f"网络错误: {exc.reason}"

    try:
        result = json.loads(response_body)
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        return False, f"响应解析失败: {exc}"

    return True, content


def run_basic_chat(api_key, base_url, model):
    print("=" * 60)
    print("基础对话测试")
    success, content = request_chat(
        api_key,
        base_url,
        model,
        "你好",
    )
    print(f"成功: {success}")
    print(f"结果: {content}")
    return success


def run_json_mode_tests(api_key, base_url, model):
    print("=" * 60)
    print("JSON 模式测试：连续调用 5 次")

    success_count = 0

    for index in range(1, 6):
        success, content = request_chat(
            api_key,
            base_url,
            model,
            JSON_TEST_PROMPT,
            json_mode=True,
        )
        valid_json = False
        parsed = None

        if success:
            try:
                parsed = json.loads(content)
                valid_json = isinstance(parsed, dict)
            except json.JSONDecodeError:
                valid_json = False

        if valid_json:
            success_count += 1

        print(f"第 {index} 次：合法 JSON={valid_json}")
        if valid_json:
            print(json.dumps(parsed, ensure_ascii=False))
        else:
            print(f"原始结果或错误：{content}")

    success_rate = success_count / 5 * 100
    print("=" * 60)
    print(f"JSON 合法次数: {success_count}/5")
    print(f"JSON 成功率: {success_rate:.1f}%")
    return success_count


def main():
    api_key = get_required_env(QWEN_API_KEY_NAME)
    base_url = get_required_env(QWEN_BASE_URL_NAME)
    model = os.environ.get("QWEN_MODEL") or QWEN_MODEL_DEFAULT

    print(f"模型: {model}")
    print(f"接口地址: {base_url.rstrip('/')}/chat/completions")

    basic_success = run_basic_chat(api_key, base_url, model)
    if not basic_success:
        print("基础对话测试失败，停止 JSON 模式测试。")
        raise SystemExit(1)

    run_json_mode_tests(api_key, base_url, model)


if __name__ == "__main__":
    main()