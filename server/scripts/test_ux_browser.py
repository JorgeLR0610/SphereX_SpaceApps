"""M3.5 browser regression checks using installed Chromium and CDP.
Run with Next.js :3000 and FastAPI :8000. Screenshots use authentic cached data.
"""
import asyncio
import base64
import json
import os
import subprocess
import tempfile
from pathlib import Path
import httpx
import websockets
from test_browser_e2e import CHROME_PATH

async def main():
    with tempfile.TemporaryDirectory(prefix='spherex-ux-') as profile:
        proc = subprocess.Popen([os.environ.get('CHROME_PATH', CHROME_PATH), '--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9230', f'--user-data-dir={profile}', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            for _ in range(40):
                try:
                    targets = httpx.get('http://127.0.0.1:9230/json').json()
                    break
                except httpx.HTTPError:
                    await asyncio.sleep(.25)
            async with websockets.connect(next(t['webSocketDebuggerUrl'] for t in targets if t['type']=='page'), max_size=25000000) as ws:
                counter = 0
                runtime_errors = []
                async def cdp_call(ws, method, params, msg_id):
                    await ws.send(json.dumps({'id':msg_id, 'method':method, 'params':params or {}}))
                    while True:
                        event = json.loads(await ws.recv())
                        if event.get('method') == 'Runtime.exceptionThrown': runtime_errors.append(event)
                        if event.get('method') == 'Runtime.consoleAPICalled' and event['params'].get('type') == 'error': runtime_errors.append(event)
                        if event.get('id') == msg_id: return event
                async def call(method, params=None):
                    nonlocal counter
                    counter += 1
                    return (await cdp_call(ws, method, params, counter)).get('result', {})
                async def js(expr):
                    result = await call('Runtime.evaluate', {'expression': expr, 'returnByValue': True, 'awaitPromise': True})
                    assert 'exceptionDetails' not in result, result
                    return result.get('result',{}).get('value')
                async def wait(expr):
                    for _ in range(80):
                        if await js(expr): return
                        await asyncio.sleep(.25)
                    raise AssertionError(expr + '\n' + str(await js('document.body.innerText')))
                async def click(text):
                    assert await js(f"(()=>{{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()==={json.dumps(text)}); if(!b || b.disabled)return false; b.click(); return true;}})()"), text
                    await asyncio.sleep(.15)
                await call('Page.enable')
                await call('Runtime.enable')
                await call('Browser.setDownloadBehavior', {'behavior':'allow', 'downloadPath':profile})
                for mode, size in [('real',30), ('mock',256)]:
                    await call('Page.navigate', {'url': f'http://localhost:3000/?api={mode}'})
                    await wait(f"document.querySelector('canvas')?.width==={size} && document.querySelectorAll('.epoch-selector button').length === {2 if mode=='real' else 4}")
                    assert await js("document.querySelector('.origin').textContent.includes("+json.dumps('Datos reales' if mode=='real' else 'Simulación')+")")
                    assert not await js("document.querySelector('.advanced-tools').open")
                    await click('Activar parpadeo')
                    dates = set()
                    for _ in range(8):
                        dates.add(await js("document.querySelector('.active-date').textContent"))
                        await asyncio.sleep(.2)
                    assert len(dates)>=2, dates
                    await click('Pausar parpadeo')
                    date = await js("document.querySelector('.active-date').textContent")
                    await asyncio.sleep(.7)
                    assert date == await js("document.querySelector('.active-date').textContent")
                    await js("document.querySelector('.epoch-selector button').click()")
                    await click('Diferencia')
                    assert await js("document.querySelector('.mode-selector button:nth-child(2)').getAttribute('aria-pressed')==='true'")
                    assert await js("document.querySelector('.epoch-selector button:nth-child(2)').getAttribute('aria-pressed')==='true'")
                    if mode=='real':
                        assert await js("!document.body.innerText.includes('Gaia DR3')")
                        assert await js("document.querySelector('canvas').getContext('2d').getImageData(0,0,30,30).data.some(v=>v===43)")
                    await click('Normal')
                    for label,w,h in [('desktop',1440,900),('mobile',390,844)]:
                        await call('Emulation.setDeviceMetricsOverride', {'width':w,'height':h,'deviceScaleFactor':1,'mobile':False})
                        await asyncio.sleep(.3)
                        assert await js('document.documentElement.scrollWidth <= window.innerWidth'), (mode,label)
                        metrics = await call('Page.getLayoutMetrics')
                        bounds = metrics['cssContentSize']
                        data = await call('Page.captureScreenshot', {'format':'png', 'captureBeyondViewport':True, 'clip':{**bounds, 'scale':1}})
                        dest=Path(__file__).resolve().parents[2]/'docs/assets'/f'ux-{mode}-{label}.png'
                        dest.write_bytes(base64.b64decode(data['data']))
                    await js("document.querySelector('.advanced-tools').open=true")
                    assert await js("document.querySelector('.advanced-tools').innerText.includes("+json.dumps('2026W' if mode=='real' else 'Modo Detective')+")")
                    await js("document.querySelector('.viewer-advanced').open=true")
                    await click('Descargar PNG')
                    await click('Descargar GIF')
                    for _ in range(50):
                        if list(Path(profile).glob('*.png')) and list(Path(profile).glob('*.gif')): break
                        await asyncio.sleep(.1)
                    assert list(Path(profile).glob('*.png')) and list(Path(profile).glob('*.gif'))
                    for file in Path(profile).glob('SPHEREx*'): file.unlink()
                    await js("document.activeElement?.blur()")
                    await call('Input.dispatchKeyEvent', {'type':'keyDown','key':'d','code':'KeyD'})
                    await call('Input.dispatchKeyEvent', {'type':'keyUp','key':'d','code':'KeyD'})
                    assert await js("document.querySelector('.mode-selector button:nth-child(2)').getAttribute('aria-pressed')==='true'")
                    await click('Normal')
                    await js("document.querySelector('.secondary-menu').open=true")
                    await click('Atajos de teclado')
                    await wait("!!document.querySelector('[role=dialog]')")
                    await call('Input.dispatchKeyEvent', {'type':'keyDown','key':'Escape','code':'Escape'})
                    await wait("!document.querySelector('[role=dialog]')")
                    print(f'PASS {mode}: frames, blink, pause, difference, advanced tools, desktop/mobile screenshots')
                assert not runtime_errors, runtime_errors
                await call('Page.navigate', {'url':'http://localhost:3000/?api=real&ra=0&dec=0'})
                await wait("document.body.innerText.includes('Error') || document.body.innerText.includes('error')")
                assert await js("document.querySelector('.primary-action').disabled")
                print('PASS unsupported real region: explicit error and disabled playback')
                await call('Page.navigate', {'url':'http://localhost:3000/?api=mock&embed=1'})
                await wait("document.querySelector('canvas')?.width===256 && !document.querySelector('header')")
                assert await js("!document.querySelector('header')")
                print('PASS synthetic embed URL')
        finally:
            proc.terminate()
            proc.wait(timeout=10)

if __name__ == '__main__':
    asyncio.run(main())
