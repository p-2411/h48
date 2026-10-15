# Makes the word-frequency lists for reading levels (src/main/progress/frequency/*.json) from the
# wordfreq 3.1.1 wheel: the most common words of each language, in rank order, the most common first.
# Words with no letter in them (numbers, symbols) are left out.
#
# Run once, when the lists change (they are committed, so a build needs no Python):
#   python3 -m pip download wordfreq==3.1.1 --no-deps -d <folder>
#   unzip <folder>/wordfreq-3.1.1-py3-none-any.whl -d <folder>/wheel
#   python3 -m venv <venv> && <venv>/bin/pip install msgpack
#   <venv>/bin/python scripts/make-frequency-lists.py <folder>/wheel/wordfreq/data
import gzip
import json
import sys
from pathlib import Path

import msgpack

# Each language's list in wordfreq (Korean has only a small one), and how many words to keep.
LISTS = {"es": "large_es", "ja": "large_ja", "ko": "small_ko"}
KEEP = 10_000
OUT = Path(__file__).resolve().parent.parent / "src" / "main" / "progress" / "frequency"


def words(path: Path) -> list[str]:
    # wordfreq's "cBpack": a header, then one bucket of words per step of frequency, highest first.
    data = msgpack.unpackb(gzip.open(path).read(), raw=False)
    return [word for bucket in data[1:] for word in bucket]


def main(data: Path) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for language, name in LISTS.items():
        kept = [word for word in words(data / f"{name}.msgpack.gz") if any(ch.isalpha() for ch in word)][:KEEP]
        (OUT / f"{language}.json").write_text(json.dumps(kept, ensure_ascii=False) + "\n", encoding="utf-8")
        print(language, len(kept))


if __name__ == "__main__":
    main(Path(sys.argv[1]))
