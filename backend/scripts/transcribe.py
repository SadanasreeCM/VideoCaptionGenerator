import argparse
import json
import sys


def transcribe_with_faster_whisper(audio_path, language, model_name, device, compute_type, beam_size, best_of, vad_filter):
    from faster_whisper import WhisperModel

    model = WhisperModel(model_name, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        audio_path,
        language=language or None,
        beam_size=beam_size,
        best_of=best_of,
        vad_filter=vad_filter,
        condition_on_previous_text=False
    )

    out_segments = []
    transcript_parts = []
    for seg in segments:
        text = (seg.text or "").strip()
        if not text:
            continue
        out_segments.append({
            "start": float(seg.start),
            "end": float(seg.end),
            "text": text
        })
        transcript_parts.append(text)

    return {
        "transcript": " ".join(transcript_parts).strip(),
        "segments": out_segments,
        "detectedLanguage": getattr(info, "language", None)
    }


def transcribe_with_openai_whisper(audio_path, language, model_name):
    import whisper

    model = whisper.load_model(model_name)
    result = model.transcribe(audio_path, language=language or None)

    out_segments = []
    transcript_parts = []
    for seg in result.get("segments", []):
        text = (seg.get("text") or "").strip()
        if not text:
            continue
        out_segments.append({
            "start": float(seg.get("start", 0)),
            "end": float(seg.get("end", 0)),
            "text": text
        })
        transcript_parts.append(text)

    return {
        "transcript": " ".join(transcript_parts).strip(),
        "segments": out_segments,
        "detectedLanguage": result.get("language")
    }


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    parser = argparse.ArgumentParser()
    parser.add_argument("--audio", required=True)
    parser.add_argument("--language", default="")
    parser.add_argument("--model", default="base")
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--compute-type", default="int8")
    parser.add_argument("--beam-size", type=int, default=1)
    parser.add_argument("--best-of", type=int, default=1)
    parser.add_argument("--vad-filter", action="store_true")
    args = parser.parse_args()

    language = args.language.strip() or None

    try:
        output = transcribe_with_faster_whisper(
            args.audio,
            language,
            args.model,
            args.device,
            args.compute_type,
            max(1, args.beam_size),
            max(1, args.best_of),
            args.vad_filter
        )
    except Exception:
        try:
            output = transcribe_with_openai_whisper(args.audio, language, args.model)
        except Exception as exc:
            print(json.dumps({"error": str(exc)}))
            sys.exit(1)

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()
