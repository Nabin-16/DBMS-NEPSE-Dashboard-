"""
Test the confirmed merolagani TechnicalChartHandler endpoint.
Run: python test_confirmed.py
"""
import requests
import json
import time

session = requests.Session()
session.headers.update({
    "User-Agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer":     "https://www.merolagani.com/CompanyDetail.aspx?symbol=ADBL",
    "Accept":      "*/*",
    "Origin":      "https://www.merolagani.com",
})

# First visit company page to get session cookie
print("Getting session cookie...")
session.get("https://www.merolagani.com/CompanyDetail.aspx?symbol=ADBL", timeout=15)
print(f"Cookies: {dict(session.cookies)}")
print()

# Test 1: Exact URL from browser (recent range)
print("=== Test 1: Exact browser URL ===")
url = (
    "https://www.merolagani.com/handlers/TechnicalChartHandler.ashx"
    "?type=get_advanced_chart&symbol=ADBL&resolution=1D"
    "&rangeStartDate=1740035825&rangeEndDate=1774163885"
    "&from=&isAdjust=1&currencyCode=NPR"
)
r = session.get(url, timeout=15)
print(f"Status: {r.status_code}  Length: {len(r.text)}")
print(f"First 500 chars:\n{r.text[:500]}")
print()

time.sleep(1)

# Test 2: 180 days range
# 180 days ago from now in unix timestamp
import time as t
now       = int(t.time())
days_180  = now - (180 * 86400)
days_365  = now - (365 * 86400)
days_730  = now - (730 * 86400)  # 2 years

print("=== Test 2: 180 days ===")
url2 = (
    "https://www.merolagani.com/handlers/TechnicalChartHandler.ashx"
    f"?type=get_advanced_chart&symbol=ADBL&resolution=1D"
    f"&rangeStartDate={days_180}&rangeEndDate={now}"
    "&from=&isAdjust=1&currencyCode=NPR"
)
r2 = session.get(url2, timeout=15)
print(f"Status: {r2.status_code}  Length: {len(r2.text)}")
if r2.status_code == 200 and len(r2.text) > 10:
    try:
        data = r2.json()
        print(f"Keys: {list(data.keys())}")
        # Print structure
        for k, v in data.items():
            if isinstance(v, list):
                print(f"  {k}: list of {len(v)} items, first={v[0] if v else 'empty'}")
            else:
                print(f"  {k}: {str(v)[:80]}")
    except:
        print(f"Raw: {r2.text[:400]}")
print()

time.sleep(1)

# Test 3: 2 years range
print("=== Test 3: 2 years ===")
url3 = (
    "https://www.merolagani.com/handlers/TechnicalChartHandler.ashx"
    f"?type=get_advanced_chart&symbol=NABIL&resolution=1D"
    f"&rangeStartDate={days_730}&rangeEndDate={now}"
    "&from=&isAdjust=1&currencyCode=NPR"
)
r3 = session.get(url3, timeout=15)
print(f"Status: {r3.status_code}  Length: {len(r3.text)}")
if r3.status_code == 200 and len(r3.text) > 10:
    try:
        data3 = r3.json()
        print(f"Keys: {list(data3.keys())}")
        for k, v in data3.items():
            if isinstance(v, list):
                print(f"  {k}: {len(v)} items")
                if v:
                    print(f"    first: {v[0]}")
                    print(f"    last:  {v[-1]}")
    except:
        print(f"Raw: {r3.text[:400]}")