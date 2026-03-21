"""
Test merolagani endpoints for historical price data per company.
Run: python test_mero_history.py
"""
import requests
import json
import time

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":    "https://www.merolagani.com/",
    "X-Requested-With": "XMLHttpRequest",
}

symbol = "ADBL"

# Test 1: TechnicalChartHandler (used by their chart widget)
# Unix timestamps: 2025-01-01 = 1735689600, 2026-03-21 = 1742860800
print("=== Test 1: TechnicalChartHandler ===")
url1 = (
    "https://www.merolagani.com/handlers/TechnicalChartHandler.ashx"
    f"?type=getPriceHistory&symbol={symbol}&resolution=D"
    "&from=1735689600&to=1742860800"
)
r = requests.get(url1, headers=HEADERS, timeout=15)
print(f"Status: {r.status_code}")
print(f"Content-Type: {r.headers.get('Content-Type','')}")
if r.status_code == 200:
    print(f"First 500 chars: {r.text[:500]}")
print()

time.sleep(1)

# Test 2: LatestMarket handler
print("=== Test 2: LatestMarket handler ===")
url2 = (
    "https://www.merolagani.com/handlers/LatestMarket.ashx"
    f"?type=getPriceHistory&symbol={symbol}"
)
r2 = requests.get(url2, headers=HEADERS, timeout=15)
print(f"Status: {r2.status_code}")
if r2.status_code == 200:
    print(f"First 300 chars: {r2.text[:300]}")
print()

time.sleep(1)

# Test 3: CompanyDetail handler
print("=== Test 3: CompanyDetail history tab (POST) ===")
url3 = "https://www.merolagani.com/CompanyDetail.aspx"
data3 = {
    "__EVENTTARGET": "ctl00$ContentPlaceHolder1$CompanyDetail1$lnkHistoryTab",
    "ctl00$ContentPlaceHolder1$CompanyDetail1$txtSymbol": symbol,
}
r3 = requests.post(url3, headers={**HEADERS, "Content-Type": "application/x-www-form-urlencoded"},
                   data=data3, params={"symbol": symbol}, timeout=15)
print(f"Status: {r3.status_code}")
if r3.status_code == 200:
    # Look for price history table
    if "table" in r3.text.lower():
        import pandas as pd
        from io import StringIO
        try:
            tables = pd.read_html(StringIO(r3.text))
            for i, t in enumerate(tables):
                print(f"Table {i}: {t.shape} cols={list(t.columns)[:5]}")
        except Exception as e:
            print(f"No tables parsed: {e}")
    print(f"First 300 chars: {r3.text[:300]}")
print()

time.sleep(1)

# Test 4: Direct API endpoint many sites use
print("=== Test 4: nepse.com.np API ===")
url4 = f"https://nepse.com.np/api/nots/securityDailyTradeStat/{symbol}"
r4 = requests.get(url4, headers=HEADERS, timeout=15)
print(f"Status: {r4.status_code}")
if r4.status_code == 200:
    print(f"First 500 chars: {r4.text[:500]}")
print()

# Test 5: nepalstock API
print("=== Test 5: nepalstock.com.np API ===")
url5 = f"https://nepalstock.com.np/api/nots/market/export/securities/history/ADBL?startDate=2025-09-01&endDate=2026-03-20&size=500"
r5 = requests.get(url5, headers={**HEADERS, "Referer": "https://nepalstock.com.np/"}, timeout=15)
print(f"Status: {r5.status_code}")
if r5.status_code == 200:
    print(f"First 500 chars: {r5.text[:500]}")