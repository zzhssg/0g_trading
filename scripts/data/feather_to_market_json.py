#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from typing import Iterable, List, Dict, Any, Optional

SCHEMA_VERSION = "market-json-v1"


def _to_utc_iso(ts_value: Any) -> str:
    if isinstance(ts_value, datetime):
        dt = ts_value.astimezone(timezone.utc)
        return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    if isinstance(ts_value, str):
        raw = ts_value.strip()
        if raw.endswith("Z"):
            dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        else:
            dt = datetime.fromisoformat(raw)
        dt = dt.astimezone(timezone.utc)
        return dt.replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")

    value = float(ts_value)
    if value > 1_000_000_000_000:
        value /= 1000.0
    dt = datetime.fromtimestamp(value, tz=timezone.utc)
    return dt.isoformat().replace("+00:00", "Z")


def _scale_number(value: Any, scale: int) -> int:
    return int(round(float(value) * scale))


def normalize_rows(rows: Iterable[Dict[str, Any]], price_scale: int, volume_scale: int) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    for row in rows:
        ts = _to_utc_iso(row["ts"])
        normalized.append(
            {
                "ts": ts,
                "open": _scale_number(row["open"], price_scale),
                "high": _scale_number(row["high"], price_scale),
                "low": _scale_number(row["low"], price_scale),
                "close": _scale_number(row["close"], price_scale),
                "volume": _scale_number(row["volume"], volume_scale),
            }
        )
    return normalized


def _parse_iso(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    raw = value.strip()
    if raw.endswith("Z"):
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    else:
        dt = datetime.fromisoformat(raw)
    return dt.astimezone(timezone.utc)


def _infer_eval_window(rows: List[Dict[str, Any]]) -> str:
    if not rows:
        return ""
    return f"{rows[0]['ts']}~{rows[-1]['ts']}"


def _extract_rows_from_dataframe(df) -> List[Dict[str, Any]]:
    columns = {c.lower(): c for c in df.columns}
    ts_col = columns.get("ts") or columns.get("timestamp") or columns.get("time")
    if not ts_col:
        raise ValueError("Missing ts/timestamp column in feather data")

    def pick(name: str) -> str:
        col = columns.get(name)
        if not col:
            raise ValueError(f"Missing {name} column in feather data")
        return col

    rows = []
    for _, record in df.iterrows():
        rows.append(
            {
                "ts": record[ts_col],
                "open": record[pick("open")],
                "high": record[pick("high")],
                "low": record[pick("low")],
                "close": record[pick("close")],
                "volume": record[pick("volume")],
            }
        )
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize feather OHLCV to canonical JSON")
    parser.add_argument("--input", required=True, help="Input .feather path")
    parser.add_argument("--output", required=True, help="Output JSON path")
    parser.add_argument("--start", default=None, help="UTC ISO start time")
    parser.add_argument("--end", default=None, help="UTC ISO end time")
    parser.add_argument("--dataset-version", default="v1", help="Dataset version label")
    parser.add_argument("--price-scale", type=int, default=100, help="Price scale (integer multiplier)")
    parser.add_argument("--volume-scale", type=int, default=100, help="Volume scale (integer multiplier)")

    args = parser.parse_args()

    try:
        import pandas as pd  # type: ignore
    except ImportError as exc:
        raise SystemExit("pandas is required for feather conversion") from exc

    try:
        import pyarrow.feather as feather  # type: ignore
    except ImportError as exc:
        raise SystemExit("pyarrow is required for feather conversion") from exc

    df = feather.read_feather(args.input)
    rows = _extract_rows_from_dataframe(df)

    start_dt = _parse_iso(args.start)
    end_dt = _parse_iso(args.end)

    if start_dt or end_dt:
        filtered = []
        for row in rows:
            ts = _to_utc_iso(row["ts"])
            dt = _parse_iso(ts)
            if start_dt and dt < start_dt:
                continue
            if end_dt and dt > end_dt:
                continue
            row_copy = dict(row)
            row_copy["ts"] = ts
            filtered.append(row_copy)
        rows = filtered

    normalized = normalize_rows(rows, args.price_scale, args.volume_scale)
    payload = {
        "schemaVersion": SCHEMA_VERSION,
        "datasetVersion": args.dataset_version,
        "evalWindow": _infer_eval_window(normalized),
        "scale": {"price": args.price_scale, "volume": args.volume_scale},
        "rows": normalized,
    }

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
