from datetime import datetime, timezone

from feather_to_market_json import normalize_rows, SCHEMA_VERSION


def test_normalize_rows_order_and_scale():
    rows = [
        {
            "ts": datetime(2024, 1, 1, 0, 0, tzinfo=timezone.utc),
            "open": 100.12,
            "high": 101.99,
            "low": 99.5,
            "close": 100.55,
            "volume": 12.34,
        }
    ]

    normalized = normalize_rows(rows, price_scale=100, volume_scale=10)
    assert normalized[0]["ts"] == "2024-01-01T00:00:00Z"
    assert list(normalized[0].keys()) == ["ts", "open", "high", "low", "close", "volume"]
    assert normalized[0]["open"] == 10012
    assert normalized[0]["high"] == 10199
    assert normalized[0]["low"] == 9950
    assert normalized[0]["close"] == 10055
    assert normalized[0]["volume"] == 123


def test_schema_version_constant():
    assert SCHEMA_VERSION == "market-json-v1"
