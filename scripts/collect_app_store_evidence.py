#!/usr/bin/env python3
"""Collect public App Store metadata for the validation evidence ledger."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

APP_IDS = [1332312787, 521633042, 6759932067]
OUTPUT = Path(__file__).resolve().parents[1] / "docs" / "evidence" / "app-store-competitors.json"

query = urllib.parse.urlencode(
    {
        "id": ",".join(str(app_id) for app_id in APP_IDS),
        "country": "us",
        "entity": "software",
    }
)
request = urllib.request.Request(
    f"https://itunes.apple.com/lookup?{query}",
    headers={"User-Agent": "BeforeTheyGrowEvidenceCollector/0.1"},
)
with urllib.request.urlopen(request, timeout=30) as response:
    payload = json.load(response)

apps = []
for item in payload.get("results", []):
    apps.append(
        {
            "trackId": item.get("trackId"),
            "trackName": item.get("trackName"),
            "sellerName": item.get("sellerName"),
            "averageUserRating": item.get("averageUserRating"),
            "userRatingCount": item.get("userRatingCount"),
            "formattedPrice": item.get("formattedPrice"),
            "primaryGenreName": item.get("primaryGenreName"),
            "currentVersionReleaseDate": item.get("currentVersionReleaseDate"),
            "trackViewUrl": item.get("trackViewUrl"),
            "description": item.get("description"),
        }
    )

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(
    json.dumps(
        {
            "observedAt": datetime.now(timezone.utc).isoformat(),
            "source": f"https://itunes.apple.com/lookup?{query}",
            "apps": apps,
        },
        indent=2,
        ensure_ascii=False,
    )
    + "\n",
    encoding="utf-8",
)
print(f"Wrote {len(apps)} competitors to {OUTPUT}")
