import argparse
import json
import sys


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--source", required=True)
    parser.add_argument("--target", required=True)
    args = parser.parse_args()

    try:
        import argostranslate.translate as translate
    except Exception as exc:
        print(json.dumps({"error": f"Argos Translate not installed: {exc}"}))
        sys.exit(1)

    try:
        payload = sys.stdin.read()
        texts = json.loads(payload)
        if not isinstance(texts, list):
            raise ValueError("Input must be a JSON array of strings")
    except Exception as exc:
        print(json.dumps({"error": f"Invalid input: {exc}"}))
        sys.exit(1)

    try:
        results = [translate.translate(text, args.source, args.target) for text in texts]
    except Exception as exc:
        print(json.dumps({"error": f"Translate failed: {exc}"}))
        sys.exit(1)

    print(json.dumps(results, ensure_ascii=False))


if __name__ == "__main__":
    main()
