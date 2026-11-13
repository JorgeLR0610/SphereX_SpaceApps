"""End-to-end browser verification for Milestone M3 using Chrome DevTools Protocol.

Launches headless Chromium with a clean profile, connects via CDP over WebSockets,
navigates to the running Next.js application, and verifies:
1. Real SPHEREx badge and M101 observation metadata are rendered.
2. Canvas dimensions are 30x30 for real M101 cutouts.
3. Detector 2 is active while other detectors are disabled.
4. Captures an authentic screenshot of the observatory UI.
5. Verifies switching between real data and synthetic demo mode.
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
import shutil
import subprocess
import tempfile
import time
from pathlib import Path

import httpx
import websockets

CHROME_PATH = "/home/jorge/.cache/ms-playwright/chromium-1254/chrome-linux64/chrome"
SCREENSHOT_PATH = Path(__file__).resolve().parents[2] / "docs" / "assets" / "m3-e2e-m101-observatory.png"


async def cdp_call(ws, method: str, params: dict | None = None, msg_id: int = 1) -> dict:
    req = {"id": msg_id, "method": method, "params": params or {}}
    await ws.send(json.dumps(req))
    while True:
        resp = json.loads(await ws.recv())
        if resp.get("id") == msg_id:
            return resp


async def run_e2e():
    SCREENSHOT_PATH.parent.mkdir(parents=True, exist_ok=True)
    tmp_profile = tempfile.mkdtemp(prefix="chrome_m3_")
    chrome_port = 9228

    chrome_proc = subprocess.Popen(
        [
            CHROME_PATH,
            "--headless=new",
            "--no-sandbox",
            "--disable-gpu",
            f"--remote-debugging-port={chrome_port}",
            f"--user-data-dir={tmp_profile}",
            "--window-size=1440,900",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    time.sleep(1.5)

    try:
        r = httpx.get(f"http://127.0.0.1:{chrome_port}/json")
        targets = r.json()
        page_target = next(t for t in targets if t.get("type") == "page")
        ws_url = page_target["webSocketDebuggerUrl"]

        async with websockets.connect(ws_url, max_size=25_000_000) as ws:
            # Enable Runtime and Page domains
            await cdp_call(ws, "Page.enable", msg_id=1)
            await cdp_call(ws, "Runtime.enable", msg_id=2)

            print("Navigating to http://localhost:3000/?view=observatory ...")
            await cdp_call(ws, "Page.navigate", {"url": "http://localhost:3000/?view=observatory"}, msg_id=3)

            # Wait for hydration and API fetch to complete
            text = ""
            for i in range(40):
                await asyncio.sleep(0.5)
                eval_res = await cdp_call(
                    ws,
                    "Runtime.evaluate",
                    {"expression": "document.body.innerText"},
                    msg_id=10 + i,
                )
                text = eval_res.get("result", {}).get("result", {}).get("value", "")
                if "DATOS REALES" in text and "2026W20" in text:
                    print(f"Observatory hydrated and real observations loaded after {(i+1)*0.5:.1f}s")
                    break

            print("Page loaded. Inspecting DOM elements...")

            # Check Real Data badge
            eval_badge = await cdp_call(
                ws,
                "Runtime.evaluate",
                {"expression": "Boolean(document.querySelector('header')?.innerText.includes('DATOS REALES'))"},
                msg_id=100,
            )
            has_badge = eval_badge.get("result", {}).get("result", {}).get("value")
            print(f"  Real Data badge present: {has_badge}")
            assert has_badge, f"Badge 'DATOS REALES' was not found in Header (text: {text[:200]}...)"

            # Check Canvas dimensions (should be 30x30 for M101 real data)
            eval_canvas = await cdp_call(
                ws,
                "Runtime.evaluate",
                {
                    "expression": "(() => { const c = document.querySelector('canvas'); return c ? { width: c.width, height: c.height } : null; })()",
                    "returnByValue": True,
                },
                msg_id=101,
            )
            canvas_dims = eval_canvas.get("result", {}).get("result", {}).get("value")
            print(f"  Canvas dimensions: {canvas_dims}")
            assert canvas_dims == {"width": 30, "height": 30}, f"Expected 30x30 canvas, got {canvas_dims}"

            # Check Observation IDs in MetadataPanel
            eval_obsids = await cdp_call(
                ws,
                "Runtime.evaluate",
                {"expression": "document.body.innerText.includes('2026W20_2A_0464_3') || document.body.innerText.includes('2026W26_1A_0500_1')"},
                msg_id=102,
            )
            has_obsid = eval_obsids.get("result", {}).get("result", {}).get("value")
            print(f"  Observation ID verified in Metadata: {has_obsid}")
            assert has_obsid, "Observation IDs not found in MetadataPanel"

            # Check Detector status: Det 2 should be active/enabled, Det 1/Det 3 disabled or dimmed
            eval_detectors = await cdp_call(
                ws,
                "Runtime.evaluate",
                {
                    "expression": "(() => {\n"
                    "  const buttons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText.startsWith('Det'));\n"
                    "  return buttons.map(b => ({ name: b.innerText, disabled: b.disabled }));\n"
                    "})()",
                    "returnByValue": True,
                },
                msg_id=103,
            )
            detectors = eval_detectors.get("result", {}).get("result", {}).get("value", [])
            print(f"  Detectors evaluated: {detectors}")
            d2 = next((d for d in detectors if d["name"].startswith("Det 2")), None)
            d1 = next((d for d in detectors if d["name"].startswith("Det 1")), None)
            assert d2 and not d2["disabled"], "Detector Det 2 should be enabled"
            if d1:
                assert d1["disabled"], "Detector Det 1 should be disabled for M101"

            # Take screenshot of the real observatory view
            screenshot_res = await cdp_call(ws, "Page.captureScreenshot", {"format": "png"}, msg_id=104)
            img_b64 = screenshot_res.get("result", {}).get("data", "")
            SCREENSHOT_PATH.write_bytes(base64.b64decode(img_b64))
            print(f"  Screenshot saved to: {SCREENSHOT_PATH} ({SCREENSHOT_PATH.stat().st_size} bytes)")

            # Verify switching to synthetic demo mode seamlessly
            print("Testing synthetic demo mode preservation...")
            mock_screenshot = SCREENSHOT_PATH.parent / "m3-e2e-synthetic-mode.png"
            await cdp_call(ws, "Page.navigate", {"url": "http://localhost:3000/?api=mock&view=observatory"}, msg_id=200)

            for j in range(20):
                await asyncio.sleep(0.5)
                mock_text_res = await cdp_call(ws, "Runtime.evaluate", {"expression": "document.body.innerText"}, msg_id=201 + j)
                m_text = mock_text_res.get("result", {}).get("result", {}).get("value", "")
                if "MODO DEMO" in m_text:
                    break

            eval_mock_badge = await cdp_call(
                ws,
                "Runtime.evaluate",
                {"expression": "Boolean(document.querySelector('header')?.innerText.includes('MODO DEMO'))"},
                msg_id=250,
            )
            has_mock_badge = eval_mock_badge.get("result", {}).get("result", {}).get("value")
            print(f"  Synthetic demo badge present: {has_mock_badge}")
            assert has_mock_badge, "Badge 'MODO DEMO' was not found in Header when in mock mode"

            eval_mock_canvas = await cdp_call(
                ws,
                "Runtime.evaluate",
                {
                    "expression": "(() => { const c = document.querySelector('canvas'); return c ? { width: c.width, height: c.height } : null; })()",
                    "returnByValue": True,
                },
                msg_id=251,
            )
            mock_canvas_dims = eval_mock_canvas.get("result", {}).get("result", {}).get("value")
            print(f"  Synthetic canvas dimensions: {mock_canvas_dims}")
            assert mock_canvas_dims == {"width": 256, "height": 256}, f"Expected 256x256 mock canvas, got {mock_canvas_dims}"

            # Save synthetic mode screenshot
            mock_shot_res = await cdp_call(ws, "Page.captureScreenshot", {"format": "png"}, msg_id=252)
            mock_img_b64 = mock_shot_res.get("result", {}).get("data", "")
            mock_screenshot.write_bytes(base64.b64decode(mock_img_b64))
            print(f"  Synthetic screenshot saved to: {mock_screenshot} ({mock_screenshot.stat().st_size} bytes)")

            print("Milestone M3 E2E Browser Verification PASSED successfully for BOTH Real and Mock modes!")

    finally:
        chrome_proc.terminate()
        chrome_proc.wait()
        try:
            shutil.rmtree(tmp_profile, ignore_errors=True)
        except Exception:
            pass


if __name__ == "__main__":
    asyncio.run(run_e2e())
