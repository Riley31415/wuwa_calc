import sys
from playwright.sync_api import sync_playwright
url = sys.argv[1]
with sync_playwright() as pw:
    b = pw.chromium.launch(channel="chrome")
    p = b.new_context(locale="en-US").new_page()
    p.goto(url, wait_until="networkidle", timeout=90000)
    p.wait_for_timeout(4000)
    print(p.evaluate("document.body.innerText"))
    b.close()
