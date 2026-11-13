"""NASA/IPAC IRSA SPHEREx archive discovery and cutout retrieval."""

from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import time
from urllib.error import URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import urlopen
import xml.etree.ElementTree as ET


SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
COLLECTIONS = ("spherex_dr1", "spherex_qr3")
MAX_FILE_BYTES = 16 * 1024**2
MAX_CACHE_BYTES = 256 * 1024**2
MAX_QUERY_BYTES = 8 * 1024**2

# SOURCE and FULLSAMPLE are informational, NOT bad-pixel flags. All other
# set bits (including any unrecognized ones) are rejected conservatively.
INFORMATIONAL_FLAGS = {"SOURCE", "FULLSAMPLE"}


def utc_now() -> str:
    """Return ISO 8601 UTC timestamp."""
    return datetime.now(timezone.utc).isoformat()


def write_json(path: Path, data: dict | list) -> None:
    """Serialize data to formatted JSON with allow_nan=False."""
    path.write_text(json.dumps(data, indent=2, allow_nan=False) + "\n")


def fetch_bytes(url: str, limit: int, timeout: float, urlopen_fn=None) -> bytes:
    """Two attempts, bounded response size and socket + elapsed read deadlines."""
    if urlopen_fn is None:
        urlopen_fn = urlopen
    last_error = None
    for _ in range(2):
        try:
            started = time.monotonic()
            with urlopen_fn(url, timeout=timeout) as response:
                length = response.headers.get("Content-Length")
                if length and int(length) > limit:
                    raise ValueError(f"Response exceeds {limit}-byte limit")
                chunks, size = [], 0
                while chunk := response.read(min(65536, limit + 1 - size)):
                    size += len(chunk)
                    if size > limit:
                        raise ValueError(f"Response exceeds {limit}-byte limit")
                    if time.monotonic() - started > timeout:
                        raise TimeoutError("Response exceeded elapsed read deadline")
                    chunks.append(chunk)
                return b"".join(chunks)
        except (URLError, TimeoutError, OSError) as exc:
            last_error = exc
    raise RuntimeError(f"Request failed after two attempts: {url}: {last_error}")


def parse_sia(data: bytes | str) -> list[dict[str, str]]:
    """Parse SIA VOTable XML, asserting QUERY_STATUS=OK and required columns."""
    root = ET.fromstring(data)
    statuses = [el.attrib.get("value") for el in root.findall(".//{*}INFO")
                if el.attrib.get("name") == "QUERY_STATUS"]
    if not statuses or any(status != "OK" for status in statuses):
        raise ValueError(f"SIA incomplete/error result: {statuses}; narrow query, do not infer absence")
    fields = [el.attrib["name"] for el in root.findall(".//{*}FIELD")]
    if not {"obs_id", "access_url", "t_min", "energy_bandpassname"} <= set(fields):
        raise ValueError("SIA result lacks required metadata")
    return [dict(zip(fields, [el.text for el in row], strict=True))
            for row in root.findall(".//{*}TR")]


def cutout_url(url: str, ra: float, dec: float, size_arcmin: float) -> str:
    """Build bounded IBE cutout URL for an on-premises IRSA SPHEREx product."""
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.netloc != "irsa.ipac.caltech.edu"
            or not parts.path.startswith("/ibe/data/spherex/") or parts.query):
        raise ValueError("Not an expected on-premises IRSA SPHEREx product URL")
    return url + "?" + urlencode({"center": f"{ra},{dec}d", "size": size_arcmin / 60})


def download_cutout(
    url: str,
    output: Path,
    timeout: float,
    offline: bool = False,
    fetch_fn=None,
) -> tuple[Path, dict]:
    """Retrieve cutout with hash-verified local caching and sidecar metadata."""
    if fetch_fn is None:
        fetch_fn = fetch_bytes
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    path = output / f"{key}.fits"
    sidecar = path.with_suffix(".json")
    if path.exists() and sidecar.exists():
        metadata = json.loads(sidecar.read_text())
        data = path.read_bytes() if path.stat().st_size <= MAX_FILE_BYTES else b""
        if (metadata["url"] != url or not data
                or hashlib.sha256(data).hexdigest() != metadata["sha256"]):
            raise ValueError(f"Cache integrity check failed: {path}")
        return path, metadata | {"cached": True}
    if offline:
        raise ValueError(f"Offline replay requires a verified cached cutout: {path}")
    used = sum(p.stat().st_size for p in output.glob("*.fits"))
    if used + MAX_FILE_BYTES > MAX_CACHE_BYTES:
        raise ValueError("Cutout cache budget exhausted; use another output directory")
    data = fetch_fn(url, MAX_FILE_BYTES, timeout)
    if not data.startswith(b"SIMPLE  ="):
        raise ValueError("Cutout response is not a FITS file")
    metadata = {
        "url": url,
        "retrieved_utc": utc_now(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }
    path.write_bytes(data)
    write_json(sidecar, metadata)
    return path, metadata | {"cached": False}
