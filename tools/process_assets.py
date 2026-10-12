#!/usr/bin/env python3
"""Pokémon asset-processing pipeline.

Reads the source Pokémon CSV and artwork archive from ``source_assets/``
(never modifying them), validates both, matches every Pokémon to its artwork,
copies the artwork into ``public/assets/pokemon/`` and writes:

* ``public/data/pokemon.json``        – optimised dataset used by the game
* ``reports/asset-validation.json``   – machine-readable validation report
* ``reports/asset-validation.md``     – human-readable validation report

Standard library only (no Pillow): PNG files are validated with a built-in
parser that checks the signature, every chunk CRC, the IHDR header and that
the compressed image data decompresses to exactly the expected size.

Usage:
    python3 tools/process_assets.py [--csv PATH] [--archive PATH]

Exit status is 0 when no errors were found, 1 otherwise (outputs are still
written so the report can be inspected).
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import math
import re
import shutil
import stat
import struct
import sys
import unicodedata
import zipfile
import zlib
from collections import Counter, defaultdict
from pathlib import Path, PurePosixPath

PROJECT_ROOT = Path(__file__).resolve().parent.parent
SOURCE_DIR = PROJECT_ROOT / "source_assets"
BUILD_DIR = PROJECT_ROOT / "build"
EXTRACT_DIR = BUILD_DIR / "extracted"
PUBLIC_DIR = PROJECT_ROOT / "public"
ARTWORK_DIR = PUBLIC_DIR / "assets" / "pokemon"
DATA_FILE = PUBLIC_DIR / "data" / "pokemon.json"
REPORT_DIR = PROJECT_ROOT / "reports"

SCHEMA_VERSION = 1

# Column name -> (kind, required). Kinds drive parsing and validation.
SCHEMA = {
    "pokedex_number": ("int", True),
    "name": ("str", True),
    "slug": ("str", True),
    "genus": ("str", False),
    "generation": ("int", True),
    "type_1": ("type", True),
    "type_2": ("type_optional", False),
    "hp": ("int", True),
    "attack": ("int", True),
    "defense": ("int", True),
    "special_attack": ("int", True),
    "special_defense": ("int", True),
    "speed": ("int", True),
    "height_m": ("float", False),
    "weight_kg": ("float", False),
    "base_experience": ("int", False),
    "capture_rate": ("int", False),
    "base_happiness": ("int", False),
    "is_baby": ("bool", False),
    "is_legendary": ("bool", False),
    "is_mythical": ("bool", False),
    "image_url": ("str", False),
    "image_path": ("str", False),
}

STAT_COLUMNS = ["hp", "attack", "defense", "special_attack", "special_defense", "speed"]

POKEMON_TYPES = {
    "Normal", "Fire", "Water", "Electric", "Grass", "Ice", "Fighting", "Poison",
    "Ground", "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark",
    "Steel", "Fairy",
}

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif"}
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
FILENAME_RE = re.compile(r"^(\d+)[_-](.+)$")


class Report:
    """Collects issues grouped by category."""

    def __init__(self) -> None:
        self.errors: list[dict] = []
        self.warnings: list[dict] = []
        self.info: dict = {}

    def error(self, category: str, message: str, **ctx) -> None:
        self.errors.append({"category": category, "message": message, **ctx})

    def warn(self, category: str, message: str, **ctx) -> None:
        self.warnings.append({"category": category, "message": message, **ctx})


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def find_single_source(pattern: str, label: str) -> Path:
    matches = sorted(p for p in SOURCE_DIR.glob(pattern) if p.is_file())
    if len(matches) != 1:
        found = ", ".join(p.name for p in matches) or "none"
        sys.exit(f"Expected exactly one {label} in {SOURCE_DIR} (found: {found}). "
                 f"Pass it explicitly with --{label}.")
    return matches[0]


def rel(path: Path) -> str:
    """Project-relative POSIX path for reports."""
    try:
        return path.resolve().relative_to(PROJECT_ROOT).as_posix()
    except ValueError:
        return path.name


# --------------------------------------------------------------------------
# 1–2, 5. CSV: read, inspect schema, validate and normalise
# --------------------------------------------------------------------------

def parse_value(kind: str, raw: str):
    value = raw.strip()
    if kind in ("str",):
        return value or None
    if kind == "int":
        if not re.fullmatch(r"-?\d+", value):
            raise ValueError(f"not an integer: {raw!r}")
        return int(value)
    if kind == "float":
        f = float(value)
        if not math.isfinite(f):
            raise ValueError(f"not a finite number: {raw!r}")
        return f
    if kind == "bool":
        lowered = value.lower()
        if lowered in ("true", "1", "yes"):
            return True
        if lowered in ("false", "0", "no"):
            return False
        raise ValueError(f"not a boolean: {raw!r}")
    if kind in ("type", "type_optional"):
        if not value:
            return None
        canonical = value.capitalize()
        if canonical not in POKEMON_TYPES:
            raise ValueError(f"unknown Pokémon type: {raw!r}")
        return canonical
    raise AssertionError(kind)


def infer_column_type(values: list[str]) -> str:
    non_empty = [v.strip() for v in values if v.strip()]
    if not non_empty:
        return "empty"
    if all(re.fullmatch(r"-?\d+", v) for v in non_empty):
        return "integer"
    if all(re.fullmatch(r"-?\d+(\.\d+)?", v) for v in non_empty):
        return "decimal"
    if all(v.lower() in ("true", "false") for v in non_empty):
        return "boolean"
    return "text"


def load_csv(csv_path: Path, report: Report) -> list[dict]:
    with csv_path.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames or []
        raw_rows = list(reader)

    schema_info = []
    for col in columns:
        values = [r.get(col) or "" for r in raw_rows]
        schema_info.append({
            "column": col,
            "inferred_type": infer_column_type(values),
            "empty_values": sum(1 for v in values if not v.strip()),
            "unique_values": len(set(values)),
            "expected": col in SCHEMA,
        })
    report.info["csv_schema"] = schema_info
    report.info["csv_rows"] = len(raw_rows)

    missing = [c for c, (_, req) in SCHEMA.items() if req and c not in columns]
    for col in missing:
        report.error("csv_schema", f"Required column missing: {col}")
    if missing:
        return []
    for col in columns:
        if col not in SCHEMA:
            report.warn("csv_schema", f"Unrecognised column ignored: {col}")

    records = []
    for line_no, raw in enumerate(raw_rows, start=2):  # header is line 1
        rec, ok = {"_line": line_no}, True
        if None in raw:  # extra cells beyond the header
            report.error("csv_row", "Row has more cells than the header", line=line_no)
            ok = False
        for col, (kind, required) in SCHEMA.items():
            if col not in columns:
                rec[col] = None
                continue
            cell = raw.get(col)
            if cell is None:
                report.error("csv_row", f"Row is missing a value for {col}", line=line_no)
                ok = False
                continue
            try:
                rec[col] = parse_value(kind, cell)
            except ValueError as exc:
                report.error("csv_value", f"{col}: {exc}", line=line_no)
                ok = False
                continue
            if required and rec[col] is None:
                report.error("csv_value", f"Required value empty: {col}", line=line_no)
                ok = False
        if ok:
            ok = validate_record(rec, report)
        rec["_valid"] = ok
        records.append(rec)

    check_uniqueness(records, report)
    return records


def validate_record(rec: dict, report: Report) -> bool:
    line, ok = rec["_line"], True
    ctx = {"line": line, "pokedex_number": rec["pokedex_number"], "name": rec["name"]}
    if rec["pokedex_number"] <= 0:
        report.error("csv_value", "Pokédex number must be positive", **ctx)
        ok = False
    if not 1 <= rec["generation"] <= 99:
        report.error("csv_value", f"Implausible generation {rec['generation']}", **ctx)
        ok = False
    if rec["type_2"] is not None and rec["type_2"] == rec["type_1"]:
        report.warn("csv_value", "type_2 duplicates type_1", **ctx)
    for col in STAT_COLUMNS:
        if not 1 <= rec[col] <= 255:
            report.error("csv_value", f"{col} out of range 1–255: {rec[col]}", **ctx)
            ok = False
    for col in ("height_m", "weight_kg"):
        if rec[col] is not None and rec[col] <= 0:
            report.warn("csv_value", f"{col} is not positive: {rec[col]}", **ctx)
    if rec["capture_rate"] is not None and not 0 <= rec["capture_rate"] <= 255:
        report.warn("csv_value", f"capture_rate out of range: {rec['capture_rate']}", **ctx)
    if rec["slug"] and not re.fullmatch(r"[a-z0-9]+(-[a-z0-9]+)*", rec["slug"]):
        report.warn("name_check", f"Slug has unexpected characters: {rec['slug']!r}", **ctx)
    if rec["slug"] and rec["name"] and slugify(rec["name"]) != rec["slug"]:
        report.warn("name_check",
                    f"Name {rec['name']!r} does not slugify to slug {rec['slug']!r} "
                    f"(got {slugify(rec['name'])!r})", **ctx)
    if rec["image_url"]:
        m = re.search(r"/(\d+)\.\w+$", rec["image_url"])
        if m and int(m.group(1)) != rec["pokedex_number"]:
            report.warn("csv_value",
                        f"image_url points to #{m.group(1)}, not #{rec['pokedex_number']}", **ctx)
    return ok


def slugify(name: str) -> str:
    s = name.replace("♀", "-f").replace("♂", "-m")
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()
    s = re.sub(r"['’.]", "", s.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def check_uniqueness(records: list[dict], report: Report) -> None:
    for field in ("pokedex_number", "name", "slug"):
        counts = Counter(r[field] for r in records if r.get(field) is not None)
        for value, n in counts.items():
            if n > 1:
                lines = [r["_line"] for r in records if r.get(field) == value]
                report.error("csv_duplicate", f"Duplicate {field}: {value!r}", lines=lines)
                for r in records:
                    if r.get(field) == value:
                        r["_valid"] = False
    numbers = sorted({r["pokedex_number"] for r in records if r.get("pokedex_number")})
    if numbers:
        gaps = sorted(set(range(numbers[0], numbers[-1] + 1)) - set(numbers))
        report.info["pokedex_range"] = [numbers[0], numbers[-1]]
        if gaps:
            report.warn("csv_coverage", f"{len(gaps)} Pokédex numbers missing from CSV",
                        missing=gaps)


# --------------------------------------------------------------------------
# 3–4. Archive: safe extraction and structure discovery
# --------------------------------------------------------------------------

def safe_member_path(name: str) -> PurePosixPath | None:
    p = PurePosixPath(name.replace("\\", "/"))
    if p.is_absolute() or any(part in ("..", "") for part in p.parts) or ":" in p.parts[0]:
        return None
    return p


def extract_archive(archive: Path, report: Report) -> list[Path]:
    if EXTRACT_DIR.exists():
        shutil.rmtree(EXTRACT_DIR)
    EXTRACT_DIR.mkdir(parents=True)

    extracted, ignored = [], []
    try:
        zf = zipfile.ZipFile(archive)
    except zipfile.BadZipFile as exc:
        report.error("archive", f"Archive is not a readable zip: {exc}")
        return []
    with zf:
        for info in zf.infolist():
            if info.is_dir():
                continue
            member = safe_member_path(info.filename)
            if member is None:
                report.error("archive", "Unsafe path in archive skipped", member=info.filename)
                continue
            if stat.S_ISLNK(info.external_attr >> 16):
                report.warn("archive", "Symlink in archive skipped", member=info.filename)
                continue
            if member.parts[0] == "__MACOSX" or member.name.startswith("."):
                ignored.append(info.filename)
                continue
            target = EXTRACT_DIR.joinpath(*member.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            try:
                # Reading through ZipFile verifies each member's CRC-32.
                with zf.open(info) as src, target.open("wb") as dst:
                    shutil.copyfileobj(src, dst)
            except (zipfile.BadZipFile, zlib.error, OSError) as exc:
                report.error("corrupted", f"Archive member failed to extract: {exc}",
                             member=info.filename)
                target.unlink(missing_ok=True)
                continue
            extracted.append(target)
    report.info["archive_files_extracted"] = len(extracted)
    report.info["archive_files_ignored"] = ignored
    return extracted


def discover_images(files: list[Path], report: Report) -> list[dict]:
    images, other = [], []
    by_dir: Counter = Counter()
    by_ext: Counter = Counter()
    for path in files:
        relpath = path.relative_to(EXTRACT_DIR).as_posix()
        ext = path.suffix.lower()
        if ext not in IMAGE_EXTENSIONS:
            other.append(relpath)
            continue
        by_dir[path.parent.relative_to(EXTRACT_DIR).as_posix() or "."] += 1
        by_ext[ext] += 1
        m = FILENAME_RE.match(path.stem)
        images.append({
            "path": path,
            "archive_path": relpath,
            "number": int(m.group(1)) if m else None,
            "file_slug": m.group(2).lower() if m else None,
        })
        if not m:
            report.warn("naming", "Image filename has no leading Pokédex number",
                        file=relpath)
    report.info["artwork_directories"] = dict(sorted(by_dir.items()))
    report.info["artwork_extensions"] = dict(sorted(by_ext.items()))
    if other:
        report.warn("archive", f"{len(other)} non-image files in archive ignored", files=other)
    return images


# --------------------------------------------------------------------------
# PNG validation (signature, chunk CRCs, IHDR, full IDAT decompression)
# --------------------------------------------------------------------------

PNG_CHANNELS = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}
PNG_BIT_DEPTHS = {0: {1, 2, 4, 8, 16}, 2: {8, 16}, 3: {1, 2, 4, 8}, 4: {8, 16}, 6: {8, 16}}
ADAM7 = [(0, 0, 8, 8), (4, 0, 8, 8), (0, 4, 4, 8), (2, 0, 4, 4),
         (0, 2, 2, 4), (1, 0, 2, 2), (0, 1, 1, 2)]


def expected_png_data_size(w: int, h: int, bits_per_pixel: int, interlaced: bool) -> int:
    def scanlines(pw: int, ph: int) -> int:
        if pw == 0 or ph == 0:
            return 0
        return ph * (1 + (pw * bits_per_pixel + 7) // 8)

    if not interlaced:
        return scanlines(w, h)
    return sum(scanlines(max(0, (w - xs + dx - 1) // dx), max(0, (h - ys + dy - 1) // dy))
               for xs, ys, dx, dy in ADAM7)


def inspect_png(data: bytes) -> dict:
    """Return image metadata, or raise ValueError describing the corruption."""
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("missing PNG signature")
    pos, ihdr, idat, chunk_types = len(PNG_SIGNATURE), None, [], []
    has_trns = has_plte = False
    while True:
        if pos + 12 > len(data):
            raise ValueError("truncated before IEND chunk")
        length, ctype = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + length]
        if len(body) != length or pos + 12 + length > len(data):
            raise ValueError(f"truncated {ctype!r} chunk")
        (crc,) = struct.unpack(">I", data[pos + 8 + length:pos + 12 + length])
        if zlib.crc32(ctype + body) & 0xFFFFFFFF != crc:
            raise ValueError(f"CRC mismatch in {ctype.decode('latin-1')} chunk")
        if not chunk_types and ctype != b"IHDR":
            raise ValueError("first chunk is not IHDR")
        chunk_types.append(ctype)
        if ctype == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif ctype == b"IDAT":
            idat.append(body)
        elif ctype == b"PLTE":
            has_plte = True
        elif ctype == b"tRNS":
            has_trns = True
        pos += 12 + length
        if ctype == b"IEND":
            break
    trailing = len(data) - pos

    width, height, depth, color, _comp, _filt, interlace = ihdr
    if width == 0 or height == 0:
        raise ValueError("zero image dimensions")
    if color not in PNG_CHANNELS or depth not in PNG_BIT_DEPTHS[color]:
        raise ValueError(f"invalid colour type/bit depth {color}/{depth}")
    if color == 3 and not has_plte:
        raise ValueError("palette image without PLTE chunk")
    if not idat:
        raise ValueError("no IDAT image data")

    decomp = zlib.decompressobj()
    try:
        raw = decomp.decompress(b"".join(idat))
    except zlib.error as exc:
        raise ValueError(f"image data does not decompress: {exc}") from None
    if not decomp.eof:
        raise ValueError("image data stream is truncated")
    bpp = PNG_CHANNELS[color] * depth
    expected = expected_png_data_size(width, height, bpp, interlace == 1)
    if len(raw) != expected:
        raise ValueError(f"decompressed size {len(raw)} != expected {expected}")
    if interlace == 0:
        stride = 1 + (width * bpp + 7) // 8
        if any(raw[i] > 4 for i in range(0, len(raw), stride)):
            raise ValueError("invalid scanline filter type")

    return {
        "width": width,
        "height": height,
        "bit_depth": depth,
        "color_type": color,
        "has_alpha": color in (4, 6) or has_trns,
        "interlaced": interlace == 1,
        "trailing_bytes": trailing,
    }


def validate_images(images: list[dict], report: Report) -> None:
    hashes: dict[str, list[str]] = defaultdict(list)
    for img in images:
        data = img["path"].read_bytes()
        img["sha256"] = hashlib.sha256(data).hexdigest()
        img["bytes"] = len(data)
        hashes[img["sha256"]].append(img["archive_path"])
        if img["path"].suffix.lower() != ".png":
            img["meta"] = None
            img["error"] = "unsupported image format (only PNG is validated)"
            report.error("corrupted", img["error"], file=img["archive_path"])
            continue
        try:
            img["meta"] = inspect_png(data)
            img["error"] = None
        except ValueError as exc:
            img["meta"], img["error"] = None, str(exc)
            report.error("corrupted", f"Invalid PNG: {exc}", file=img["archive_path"])
            continue
        if img["meta"]["trailing_bytes"]:
            report.warn("corrupted", f"{img['meta']['trailing_bytes']} bytes after IEND",
                        file=img["archive_path"])
    for digest, paths in hashes.items():
        if len(paths) > 1:
            report.warn("duplicate_image", "Byte-identical artwork files", files=paths)


# --------------------------------------------------------------------------
# 6–7. Matching records to artwork
# --------------------------------------------------------------------------

def match_records(records: list[dict], images: list[dict], report: Report) -> None:
    by_path = {img["archive_path"].lower(): img for img in images}
    by_name: dict[str, list[dict]] = defaultdict(list)
    by_number: dict[int, list[dict]] = defaultdict(list)
    for img in images:
        by_name[img["path"].name.lower()].append(img)
        if img["number"] is not None:
            by_number[img["number"]].append(img)

    for number, imgs in by_number.items():
        if len(imgs) > 1:
            report.warn("duplicate_image", f"{len(imgs)} artwork files share Pokédex #{number}",
                        files=[i["archive_path"] for i in imgs])

    method_counts: Counter = Counter()
    claimed: dict[str, list[int]] = defaultdict(list)
    for rec in records:
        if rec.get("pokedex_number") is None:
            continue
        ctx = {"pokedex_number": rec["pokedex_number"], "name": rec["name"]}
        img, method = None, None
        declared = rec.get("image_path")
        if declared:
            key = PurePosixPath(declared.replace("\\", "/")).as_posix().lower()
            img = by_path.get(key)
            method = "csv_image_path" if img else None
            if not img and len(by_name.get(PurePosixPath(key).name, [])) == 1:
                img, method = by_name[PurePosixPath(key).name][0], "csv_image_filename"
                report.warn("naming", f"image_path {declared!r} only matched by filename "
                            f"(found at {img['archive_path']!r})", **ctx)
            if not img:
                report.warn("naming", f"image_path {declared!r} not found in archive", **ctx)
        if not img:
            candidates = by_number.get(rec["pokedex_number"], [])
            if len(candidates) == 1:
                img, method = candidates[0], "pokedex_number"
            elif len(candidates) > 1:
                same_slug = [c for c in candidates if c["file_slug"] == rec["slug"]]
                if len(same_slug) == 1:
                    img, method = same_slug[0], "pokedex_number+slug"
        if not img:
            report.error("missing_image", "No artwork found", **ctx)
            rec["_image"] = None
            continue

        method_counts[method] += 1
        claimed[img["archive_path"]].append(rec["pokedex_number"])
        if img["number"] is not None and img["number"] != rec["pokedex_number"]:
            report.error("naming", f"Artwork filename number #{img['number']} does not match "
                         f"Pokédex #{rec['pokedex_number']}", file=img["archive_path"], **ctx)
        if img["file_slug"] is not None and img["file_slug"] != rec["slug"]:
            report.warn("naming", f"Artwork filename slug {img['file_slug']!r} does not match "
                        f"slug {rec['slug']!r}", file=img["archive_path"], **ctx)
        if img["error"]:
            report.error("missing_image", "Matched artwork is corrupted", file=img["archive_path"],
                         **ctx)
            rec["_image"] = None
            continue
        rec["_image"] = img

    for path, numbers in claimed.items():
        if len(numbers) > 1:
            report.error("duplicate_image", "One artwork file matched by several Pokémon",
                         file=path, pokedex_numbers=numbers)
            for rec in records:
                if rec.get("pokedex_number") in numbers:
                    rec["_valid"] = False

    orphans = sorted(img["archive_path"] for img in images if img["archive_path"] not in claimed)
    if orphans:
        report.warn("orphan_image", f"{len(orphans)} artwork files not used by any Pokémon",
                    files=orphans)
    report.info["match_methods"] = dict(method_counts)


# --------------------------------------------------------------------------
# 9–10. Copy artwork and build dataset
# --------------------------------------------------------------------------

def copy_artwork(records: list[dict], report: Report) -> None:
    if ARTWORK_DIR.exists():
        shutil.rmtree(ARTWORK_DIR)
    ARTWORK_DIR.mkdir(parents=True)
    mapping = []
    for rec in records:
        img = rec.get("_image")
        if not img or not rec["_valid"]:
            continue
        # Opaque content-hash names: the URL of a silhouette must not reveal the
        # Pokémon's name or number. The archive keeps its original filenames.
        name = f"{img['sha256'][:16]}{img['path'].suffix.lower()}"
        mapping.append({"pokedex_number": rec["pokedex_number"], "source": img["archive_path"],
                        "asset": f"assets/pokemon/{name}"})
        dest = ARTWORK_DIR / name
        shutil.copyfile(img["path"], dest)  # byte-for-byte: keeps alpha & resolution
        if sha256_file(dest) != img["sha256"]:
            report.error("copy", "Copied artwork does not match source", file=img["archive_path"])
            rec["_valid"] = False
            continue
        rec["_asset"] = dest.relative_to(PUBLIC_DIR).as_posix()
    # Source-to-asset mapping lives with the reports, outside the served files.
    write_json(REPORT_DIR / "artwork-mapping.json", mapping, indent=1)


def build_dataset(records: list[dict], sources: dict, report: Report) -> dict:
    pokemon = []
    excluded = []
    for rec in sorted(records, key=lambda r: r.get("pokedex_number") or 0):
        if not rec["_valid"] or not rec.get("_asset"):
            excluded.append({"line": rec["_line"], "pokedex_number": rec.get("pokedex_number"),
                             "name": rec.get("name")})
            continue
        stats = {
            "hp": rec["hp"],
            "attack": rec["attack"],
            "defense": rec["defense"],
            "specialAttack": rec["special_attack"],
            "specialDefense": rec["special_defense"],
            "speed": rec["speed"],
        }
        meta = rec["_image"]["meta"]
        pokemon.append({
            "id": rec["pokedex_number"],
            "name": rec["name"],
            "slug": rec["slug"],
            "genus": rec["genus"],
            "generation": rec["generation"],
            "types": [t for t in (rec["type_1"], rec["type_2"]) if t],
            "stats": stats,
            "baseStatTotal": sum(stats.values()),
            "heightM": rec["height_m"],
            "weightKg": rec["weight_kg"],
            "baseExperience": rec["base_experience"],
            "captureRate": rec["capture_rate"],
            "baseHappiness": rec["base_happiness"],
            "isBaby": rec["is_baby"],
            "isLegendary": rec["is_legendary"],
            "isMythical": rec["is_mythical"],
            "image": {
                "path": rec["_asset"],
                "width": meta["width"],
                "height": meta["height"],
                "hasAlpha": meta["has_alpha"],
            },
        })
    if excluded:
        report.error("excluded", f"{len(excluded)} Pokémon excluded from the dataset",
                     records=excluded)
    return {
        "schemaVersion": SCHEMA_VERSION,
        "count": len(pokemon),
        "source": sources,
        "types": sorted({t for p in pokemon for t in p["types"]}),
        "generations": sorted({p["generation"] for p in pokemon}),
        "pokemon": pokemon,
    }


# --------------------------------------------------------------------------
# 11. Reports
# --------------------------------------------------------------------------

def image_summary(records: list[dict]) -> dict:
    metas = [r["_image"]["meta"] for r in records if r.get("_asset")]
    sizes = Counter(f"{m['width']}x{m['height']}" for m in metas)
    return {
        "images_used": len(metas),
        "dimensions": dict(sizes.most_common()),
        "with_alpha": sum(1 for m in metas if m["has_alpha"]),
        "without_alpha": sum(1 for m in metas if not m["has_alpha"]),
        "interlaced": sum(1 for m in metas if m["interlaced"]),
        "color_types": dict(Counter(str(m["color_type"]) for m in metas)),
    }


def write_reports(report: Report, dataset: dict) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "status": "fail" if report.errors else "pass",
        "summary": {
            "csv_rows": report.info.get("csv_rows", 0),
            "pokemon_in_dataset": dataset["count"],
            "errors": len(report.errors),
            "warnings": len(report.warnings),
            "errors_by_category": dict(Counter(e["category"] for e in report.errors)),
            "warnings_by_category": dict(Counter(w["category"] for w in report.warnings)),
        },
        "info": report.info,
        "errors": report.errors,
        "warnings": report.warnings,
    }
    write_json(REPORT_DIR / "asset-validation.json", payload, indent=2)

    s, info = payload["summary"], report.info
    lines = [
        "# Asset validation report",
        "",
        f"**Status: {payload['status'].upper()}** — {s['pokemon_in_dataset']} of "
        f"{s['csv_rows']} Pokémon in the dataset, {s['errors']} errors, "
        f"{s['warnings']} warnings.",
        "",
        "Generated by `tools/process_assets.py`. Machine-readable version: "
        "`reports/asset-validation.json`.",
        "",
        "## Sources",
        "",
        "| Role | File | SHA-256 |",
        "|---|---|---|",
    ]
    for role, src in info["sources"].items():
        lines.append(f"| {role} | `{src['file']}` | `{src['sha256']}` |")
    lines += ["", "## CSV schema", "",
              "| Column | Inferred type | Empty | Unique | Used |", "|---|---|---|---|---|"]
    for c in info.get("csv_schema", []):
        lines.append(f"| `{c['column']}` | {c['inferred_type']} | {c['empty_values']} | "
                     f"{c['unique_values']} | {'yes' if c['expected'] else 'no'} |")
    lines += [
        "",
        "`image_url` is checked for consistency but deliberately left out of the game "
        "dataset, so gameplay never depends on an external host.",
        "",
        "## Artwork archive",
        "",
        f"- Files extracted: {info.get('archive_files_extracted', 0)}",
        f"- Files ignored (OS metadata): {len(info.get('archive_files_ignored', []))}",
        f"- Image folders: " + ", ".join(f"`{d}/` ({n})" for d, n in
                                         info.get("artwork_directories", {}).items()),
        f"- Extensions: " + ", ".join(f"{e} ({n})" for e, n in
                                      info.get("artwork_extensions", {}).items()),
        f"- Match methods: " + ", ".join(f"{m} ({n})" for m, n in
                                         info.get("match_methods", {}).items()),
        "",
        "## Artwork in the dataset",
        "",
    ]
    imgs = info.get("images", {})
    lines += [
        f"- Images used: {imgs.get('images_used', 0)}",
        f"- With transparency: {imgs.get('with_alpha', 0)}; without: "
        f"{imgs.get('without_alpha', 0)}",
        "- Dimensions: " + ", ".join(f"{d} ({n})" for d, n in imgs.get("dimensions", {}).items()),
        "- Files are copied byte-for-byte (no re-encoding, resizing or cropping).",
        "- Copies use opaque content-hash filenames so image URLs never reveal the answer; "
        "`reports/artwork-mapping.json` maps each copy back to its archive filename.",
        "",
    ]
    for title, items in (("Errors", report.errors), ("Warnings", report.warnings)):
        lines += [f"## {title} ({len(items)})", ""]
        if not items:
            lines += ["None.", ""]
            continue
        for item in items:
            extra = {k: v for k, v in item.items() if k not in ("category", "message")}
            detail = ", ".join(f"{k}={summarise(v)}" for k, v in extra.items())
            lines.append(f"- **{item['category']}** — {item['message']}"
                         + (f" ({detail})" if detail else ""))
        lines.append("")
    (REPORT_DIR / "asset-validation.md").write_text("\n".join(lines), encoding="utf-8")


def summarise(value) -> str:
    if isinstance(value, list):
        shown = ", ".join(str(v) for v in value[:10])
        return f"[{shown}{', …' if len(value) > 10 else ''}] ({len(value)})"
    return str(value)


def write_json(path: Path, data, indent=None) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    separators = None if indent else (",", ":")
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=indent, separators=separators)
                   + "\n", encoding="utf-8")
    tmp.replace(path)


# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--csv", type=Path, help="Pokémon CSV (default: the one in source_assets/)")
    parser.add_argument("--archive", type=Path,
                        help="Artwork zip (default: the one in source_assets/)")
    args = parser.parse_args()

    csv_path = (args.csv or find_single_source("*.csv", "csv")).resolve()
    archive = (args.archive or find_single_source("*.zip", "archive")).resolve()
    for p in (csv_path, archive):
        if not p.is_file():
            sys.exit(f"Not found: {p}")

    report = Report()
    sources = {
        "dataset": {"file": csv_path.name, "sha256": sha256_file(csv_path)},
        "artwork": {"file": archive.name, "sha256": sha256_file(archive)},
    }
    report.info["sources"] = sources

    print(f"Reading {csv_path.name} …")
    records = load_csv(csv_path, report)
    print(f"Extracting {archive.name} …")
    files = extract_archive(archive, report)
    images = discover_images(files, report)
    print(f"Validating {len(images)} artwork files …")
    validate_images(images, report)
    match_records(records, images, report)
    copy_artwork(records, report)
    dataset = build_dataset(records, sources, report)
    report.info["images"] = image_summary(records)
    write_json(DATA_FILE, dataset)
    write_reports(report, dataset)

    # Source files must be untouched.
    if sha256_file(csv_path) != sources["dataset"]["sha256"] or \
            sha256_file(archive) != sources["artwork"]["sha256"]:
        print("ERROR: a source file changed during processing!", file=sys.stderr)
        return 1

    print(f"Dataset: {rel(DATA_FILE)} ({dataset['count']} Pokémon)")
    print(f"Artwork: {rel(ARTWORK_DIR)}/")
    print(f"Report:  {rel(REPORT_DIR / 'asset-validation.md')}")
    print(f"{len(report.errors)} errors, {len(report.warnings)} warnings")
    return 1 if report.errors else 0


if __name__ == "__main__":
    sys.exit(main())
