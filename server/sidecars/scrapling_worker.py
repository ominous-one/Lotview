#!/usr/bin/env python3
"""
Scrapling extraction sidecar for Lotview.

The Node service owns tenant boundaries, validation, deduplication, and storage.
This worker only fetches and extracts candidate source facts, then returns JSON.
If Scrapling is not installed, it fails closed with a machine-readable error.
"""

from __future__ import annotations

import json
import re
import sys
import time
from html import unescape
from typing import Any
from urllib.parse import urljoin, urlparse


VIN_RE = re.compile(r"\b[A-HJ-NPR-Z0-9]{17}\b", re.I)
VEHICLE_LINK_RE = re.compile(r"""href=["']([^"']*/vehicles/[^"']+)["']""", re.I)
JSON_LD_RE = re.compile(
    r"""<script[^>]+type=["']application/ld\+json["'][^>]*>(.*?)</script>""",
    re.I | re.S,
)


def output(payload: dict[str, Any], exit_code: int = 0) -> None:
    sys.stdout.write(json.dumps(payload, separators=(",", ":")) + "\n")
    sys.exit(exit_code)


def clean_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def http_url(value: Any, base_url: str) -> str | None:
    text = clean_text(value)
    if not text:
        return None

    parsed = urlparse(urljoin(base_url, text))
    if parsed.scheme in {"http", "https"}:
        return parsed.geturl()
    return None


def parse_year(value: Any) -> int | None:
    text = clean_text(value)
    if not text or not re.fullmatch(r"\d{4}", text):
        return None
    year = int(text)
    current_year = time.gmtime().tm_year
    if 1981 <= year <= current_year + 2:
        return year
    return None


def parse_money(value: Any) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    normalized = re.sub(r"[$,\s]", "", text)
    if not re.fullmatch(r"\d+(\.\d+)?", normalized):
        return None
    amount = float(normalized)
    return amount if amount > 0 else None


def parse_non_negative_int(value: Any) -> int | None:
    text = clean_text(value)
    if not text:
        return None
    normalized = re.sub(r"[,\s]", "", text)
    if not re.fullmatch(r"\d+", normalized):
        return None
    return int(normalized)


def first(*values: Any) -> Any:
    for value in values:
        if value is not None and clean_text(value):
            return value
    return None


def unique(values: list[str | None]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def value_name(value: Any) -> Any:
    if isinstance(value, dict):
        return first(value.get("name"), value.get("value"), value.get("label"))
    return value


def list_like(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def image_urls_from_value(value: Any, base_url: str) -> list[str]:
    urls: list[str | None] = []
    for item in list_like(value):
        if isinstance(item, dict):
            urls.append(http_url(first(item.get("url"), item.get("src"), item.get("href")), base_url))
        else:
            urls.append(http_url(item, base_url))
    return unique(urls)


def html_from_response(response: Any) -> str:
    for attr in ("html", "body", "text", "content"):
        value = getattr(response, attr, None)
        if callable(value):
            try:
                value = value()
            except Exception:
                value = None
        if isinstance(value, bytes):
            return value.decode("utf-8", errors="replace")
        if isinstance(value, str):
            return value

    try:
        value = response.get()
        if isinstance(value, str):
            return value
    except Exception:
        pass

    return str(response)


def body_text_from_response(response: Any) -> str | None:
    value = getattr(response, "body", None)
    if callable(value):
        try:
            value = value()
        except Exception:
            value = None
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        return value
    return None


def extract_data_attribute_vehicles(html: str, base_url: str) -> list[dict[str, Any]]:
    vehicles: list[dict[str, Any]] = []
    seen_vins: set[str] = set()

    for match in re.finditer(r"""<[^>]+\sdata-vin=["']([A-HJ-NPR-Z0-9]{17})["'][^>]*>""", html, re.I):
        tag = match.group(0)
        vin = match.group(1).upper()
        if vin in seen_vins:
            continue
        seen_vins.add(vin)

        attrs = {
            key.lower().replace("-", "_"): unescape(value)
            for key, value in re.findall(r"""data-([a-z0-9_-]+)=["']([^"']*)["']""", tag, re.I)
        }
        image = http_url(first(attrs.get("image"), attrs.get("photo"), attrs.get("img")), base_url)
        source_url = http_url(first(attrs.get("url"), attrs.get("vdp_url"), attrs.get("href")), base_url) or base_url

        vehicles.append(
            {
                "vin": vin,
                "stockNumber": first(attrs.get("stock"), attrs.get("stock_number")),
                "year": parse_year(attrs.get("year")),
                "make": clean_text(attrs.get("make")),
                "model": clean_text(attrs.get("model")),
                "trim": clean_text(attrs.get("trim")),
                "price": parse_money(first(attrs.get("price"), attrs.get("selling_price"))),
                "odometer": parse_non_negative_int(first(attrs.get("mileage"), attrs.get("odometer"))),
                "exteriorColor": first(attrs.get("exterior_color"), attrs.get("color")),
                "interiorColor": attrs.get("interior_color"),
                "images": [image] if image else [],
                "dealerVdpUrl": source_url,
                "sourceUrl": source_url,
            }
        )

    return vehicles


def vehicle_from_json_ld(item: dict[str, Any], base_url: str) -> dict[str, Any] | None:
    item_type = item.get("@type")
    if isinstance(item_type, list):
        is_vehicle = any(str(kind).lower() in {"vehicle", "car"} for kind in item_type)
    else:
        is_vehicle = str(item_type).lower() in {"vehicle", "car"}
    if not is_vehicle:
        return None

    vin = first(item.get("vehicleIdentificationNumber"), item.get("vin"))
    images = item.get("image")
    image_values = images if isinstance(images, list) else [images]

    manufacturer = item.get("manufacturer") if isinstance(item.get("manufacturer"), dict) else {}
    brand = item.get("brand") if isinstance(item.get("brand"), dict) else {}
    mileage = item.get("mileageFromOdometer") if isinstance(item.get("mileageFromOdometer"), dict) else {}
    offers = item.get("offers") if isinstance(item.get("offers"), dict) else {}

    return {
        "vin": clean_text(vin),
        "stockNumber": first(item.get("sku"), item.get("mpn")),
        "year": parse_year(first(item.get("vehicleModelDate"), item.get("modelDate"))),
        "make": first(manufacturer.get("name"), brand.get("name"), item.get("manufacturer"), item.get("brand")),
        "model": clean_text(item.get("model")),
        "trim": first(item.get("vehicleConfiguration"), item.get("trim")),
        "price": parse_money(first(offers.get("price"), item.get("price"), item.get("msrp"))),
        "odometer": parse_non_negative_int(first(mileage.get("value"), item.get("mileage"))),
        "exteriorColor": first(item.get("color"), item.get("vehicleExteriorColor")),
        "interiorColor": item.get("vehicleInteriorColor"),
        "bodyStyle": item.get("bodyType"),
        "transmission": item.get("vehicleTransmission"),
        "engine": item.get("vehicleEngine", {}).get("name") if isinstance(item.get("vehicleEngine"), dict) else None,
        "drivetrain": item.get("driveWheelConfiguration", {}).get("name")
        if isinstance(item.get("driveWheelConfiguration"), dict)
        else None,
        "fuelType": item.get("fuelType"),
        "images": unique([http_url(image, base_url) for image in image_values]),
        "description": clean_text(item.get("description")),
        "dealerVdpUrl": http_url(item.get("url"), base_url),
        "sourceUrl": http_url(item.get("url"), base_url) or base_url,
    }


def vehicle_from_json_object(item: dict[str, Any], base_url: str) -> dict[str, Any] | None:
    vin = first(
        item.get("vin"),
        item.get("VIN"),
        item.get("vehicleIdentificationNumber"),
        item.get("vehicle_identification_number"),
    )
    if not vin:
        return None

    offers = item.get("offers") if isinstance(item.get("offers"), dict) else {}
    mileage = item.get("mileageFromOdometer") if isinstance(item.get("mileageFromOdometer"), dict) else {}
    images = first(
        item.get("images"),
        item.get("photos"),
        item.get("photoUrls"),
        item.get("imageUrls"),
        item.get("image"),
    )

    return {
        "vin": clean_text(vin),
        "stockNumber": first(item.get("stockNumber"), item.get("stock"), item.get("stock_number"), item.get("sku")),
        "year": parse_year(first(item.get("year"), item.get("modelYear"), item.get("vehicleModelDate"), item.get("modelDate"))),
        "make": value_name(first(item.get("make"), item.get("vehicleMake"), item.get("manufacturer"), item.get("brand"))),
        "model": value_name(first(item.get("model"), item.get("vehicleModel"))),
        "trim": first(item.get("trim"), item.get("vehicleTrim"), item.get("vehicleConfiguration")),
        "price": parse_money(
            first(
                item.get("price"),
                item.get("sellingPrice"),
                item.get("internetPrice"),
                item.get("listPrice"),
                offers.get("price"),
                item.get("msrp"),
            )
        ),
        "odometer": parse_non_negative_int(
            first(item.get("odometer"), item.get("mileage"), item.get("miles"), mileage.get("value"))
        ),
        "exteriorColor": first(item.get("exteriorColor"), item.get("exterior_color"), item.get("color")),
        "interiorColor": first(item.get("interiorColor"), item.get("interior_color")),
        "bodyStyle": first(item.get("bodyStyle"), item.get("bodyType"), item.get("type")),
        "transmission": item.get("transmission"),
        "engine": value_name(item.get("engine")),
        "drivetrain": value_name(first(item.get("drivetrain"), item.get("driveWheelConfiguration"))),
        "fuelType": value_name(item.get("fuelType")),
        "images": image_urls_from_value(images, base_url),
        "description": clean_text(first(item.get("description"), item.get("title"))),
        "dealerVdpUrl": http_url(
            first(item.get("dealerVdpUrl"), item.get("vdpUrl"), item.get("vehicleUrl"), item.get("url"), item.get("link")),
            base_url,
        ),
        "sourceUrl": http_url(
            first(item.get("dealerVdpUrl"), item.get("vdpUrl"), item.get("vehicleUrl"), item.get("url"), item.get("link")),
            base_url,
        )
        or base_url,
    }


def walk_json_ld(value: Any, base_url: str) -> list[dict[str, Any]]:
    vehicles: list[dict[str, Any]] = []
    if isinstance(value, list):
        for item in value:
            vehicles.extend(walk_json_ld(item, base_url))
        return vehicles
    if not isinstance(value, dict):
        return vehicles

    vehicle = vehicle_from_json_ld(value, base_url)
    if vehicle:
        vehicles.append(vehicle)

    graph = value.get("@graph")
    if graph is not None:
        vehicles.extend(walk_json_ld(graph, base_url))

    return vehicles


def walk_json_vehicles(value: Any, base_url: str, depth: int = 0) -> list[dict[str, Any]]:
    if depth > 8:
        return []
    if isinstance(value, list):
        vehicles: list[dict[str, Any]] = []
        for item in value:
            vehicles.extend(walk_json_vehicles(item, base_url, depth + 1))
        return vehicles
    if not isinstance(value, dict):
        return []

    vehicles = []
    vehicle = vehicle_from_json_object(value, base_url)
    if vehicle:
        vehicles.append(vehicle)

    for child in value.values():
        if isinstance(child, (dict, list)):
            vehicles.extend(walk_json_vehicles(child, base_url, depth + 1))
    return vehicles


def parse_first_json_document(text: str) -> Any | None:
    decoder = json.JSONDecoder()
    for index, char in enumerate(text):
        if char not in "{[":
            continue
        try:
            payload, _ = decoder.raw_decode(text[index:])
            return payload
        except Exception:
            continue
    return None


def extract_json_ld_vehicles(html: str, base_url: str) -> list[dict[str, Any]]:
    vehicles: list[dict[str, Any]] = []
    for match in JSON_LD_RE.finditer(html):
        try:
            payload = json.loads(unescape(match.group(1)).strip())
        except Exception:
            continue
        vehicles.extend(walk_json_ld(payload, base_url))
    return vehicles


def extract_embedded_json_vehicles(html: str, base_url: str) -> list[dict[str, Any]]:
    vehicles: list[dict[str, Any]] = []
    for match in re.finditer(r"""<script[^>]*>(.*?)</script>""", html, re.I | re.S):
        text = unescape(match.group(1)).strip()
        lowered = text.lower()
        if "vin" not in lowered and "vehicleidentificationnumber" not in lowered:
            continue
        payload = parse_first_json_document(text)
        if payload is None:
            continue
        vehicles.extend(walk_json_vehicles(payload, base_url))
    return vehicles


def extract_captured_xhr_vehicles(captured_xhr: Any, base_url: str) -> list[dict[str, Any]]:
    vehicles: list[dict[str, Any]] = []
    if not isinstance(captured_xhr, list):
        return vehicles

    for response in captured_xhr:
        body = body_text_from_response(response)
        if not body:
            continue
        lowered = body.lower()
        if "vin" not in lowered and "vehicleidentificationnumber" not in lowered:
            continue
        payload = parse_first_json_document(body)
        if payload is None:
            continue
        vehicles.extend(walk_json_vehicles(payload, base_url))
    return vehicles


def extract_vehicle_urls(html: str, base_url: str) -> list[str]:
    urls: list[str] = []
    for match in VEHICLE_LINK_RE.finditer(html):
        url = http_url(match.group(1), base_url)
        if url:
            urls.append(url)
    return unique(urls)


def merge_vehicles(*vehicle_groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group in vehicle_groups:
        for vehicle in group:
            key = clean_text(vehicle.get("vin")) or clean_text(vehicle.get("dealerVdpUrl"))
            if key and key in seen:
                continue
            if key:
                seen.add(key)
            merged.append(vehicle)
    return merged


def fetch_with_scrapling(payload: dict[str, Any]) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
    try:
        from scrapling.fetchers import StealthyFetcher
    except Exception as exc:
        output(
            {
                "success": False,
                "method": "scrapling_unavailable",
                "vehicles": [],
                "errors": [f"scrapling package unavailable: {exc}"],
                "sourceVehicleUrls": [],
                "diagnostics": {"available": False},
            },
            0,
        )

    source_url = payload["sourceUrl"]
    timeout_ms = int(payload.get("timeoutMs") or 120000)

    response = StealthyFetcher.fetch(
        source_url,
        headless=True,
        network_idle=True,
        solve_cloudflare=True,
        block_webrtc=True,
        hide_canvas=True,
        google_search=True,
        timeout=timeout_ms,
        wait=3000,
        wait_selector="body",
        capture_xhr=payload.get("captureXhrPattern") or r"(inventory|vehicle|vehicles|search|listing)",
        selector_config={"adaptive": True},
    )
    diagnostics: dict[str, Any] = {
        "available": True,
        "captureXhrPattern": payload.get("captureXhrPattern"),
    }

    captured = getattr(response, "captured_xhr", None)
    xhr_vehicles = extract_captured_xhr_vehicles(captured, source_url)
    if captured is not None:
        try:
            diagnostics["capturedXhrCount"] = len(captured)
        except Exception:
            diagnostics["capturedXhrCount"] = "unknown"
        diagnostics["capturedXhrVehicleCount"] = len(xhr_vehicles)

    return html_from_response(response), diagnostics, xhr_vehicles


def main() -> None:
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        source_url = clean_text(payload.get("sourceUrl"))
        if not source_url:
            output({"success": False, "method": "scrapling_sidecar", "vehicles": [], "errors": ["sourceUrl is required"]})

        html, diagnostics, xhr_vehicles = fetch_with_scrapling(payload)
        vehicle_urls = extract_vehicle_urls(html, source_url)
        vehicles = merge_vehicles(
            extract_data_attribute_vehicles(html, source_url),
            extract_json_ld_vehicles(html, source_url),
            extract_embedded_json_vehicles(html, source_url),
            xhr_vehicles,
        )
        max_vehicles = int(payload.get("maxVehicles") or 200)
        vehicles = vehicles[: max(max_vehicles, 0)]

        block_signals = []
        lowered = html.lower()
        for signal in ("cloudflare", "turnstile", "checking your browser", "attention required", "access denied"):
            if signal in lowered:
                block_signals.append(signal)

        output(
            {
                "success": len(vehicles) > 0,
                "method": "scrapling_stealth_adaptive",
                "vehicles": vehicles,
                "errors": [] if vehicles else ["No valid vehicle candidates extracted"],
                "sourceVehicleUrls": vehicle_urls,
                "diagnostics": {
                    **diagnostics,
                    "htmlLength": len(html),
                    "rawVehicleCount": len(vehicles),
                    "sourceVehicleUrlCount": len(vehicle_urls),
                    "blockSignals": block_signals,
                },
            }
        )
    except Exception as exc:
        output(
            {
                "success": False,
                "method": "scrapling_sidecar",
                "vehicles": [],
                "errors": [str(exc)],
                "sourceVehicleUrls": [],
                "diagnostics": {"exception": exc.__class__.__name__},
            }
        )


if __name__ == "__main__":
    main()
