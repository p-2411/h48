# Makes the word-frequency lists for reading levels (src/shared/languages/<code>/frequency.json) from
# the wordfreq 3.1.1 wheel: the most common words of each language, in rank order, the most common
# first. Every language folder gets one, from wordfreq's large list when it has one, else its small.
# Words with no letter in them (numbers, symbols) are left out.
#
# Run once, when the lists change (they are committed, so a build needs no Python):
#   python3 -m pip download wordfreq==3.1.1 --no-deps -d <folder>
#   unzip <folder>/wordfreq-3.1.1-py3-none-any.whl -d <folder>/wheel
#   python3 -m venv <venv> && <venv>/bin/pip install msgpack
#   <venv>/bin/python scripts/make-frequency-lists.py <folder>/wheel/wordfreq/data [language …]
import gzip
import json
import sys
from pathlib import Path

import msgpack

# How many words to keep.
KEEP = 10_000
LANGUAGES = Path(__file__).resolve().parent.parent / "src" / "shared" / "languages"


def words(path: Path) -> list[str]:
    # wordfreq's "cBpack": a header, then one bucket of words per step of frequency, highest first.
    data = msgpack.unpackb(gzip.open(path).read(), raw=False)
    return [word for bucket in data[1:] for word in bucket]


def main(data: Path, asked: list[str]) -> None:
    languages = asked or sorted(p.name for p in LANGUAGES.iterdir() if (p / "index.ts").exists())
    for language in languages:
        # Korean has only a small list.
        name = f"large_{language}" if (data / f"large_{language}.msgpack.gz").exists() else f"small_{language}"
        kept = [word for word in words(data / f"{name}.msgpack.gz") if any(ch.isalpha() for ch in word)][:KEEP]
        out = LANGUAGES / language / "frequency.json"
        out.write_text(json.dumps(kept, ensure_ascii=False) + "\n", encoding="utf-8")
        print(language, name, len(kept))


if __name__ == "__main__":
    main(Path(sys.argv[1]), sys.argv[2:])
