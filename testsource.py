import requests

urls = [
    "https://raw.githubusercontent.com/Aabishkar2/nepse-data/main/data/company/ADBL.csv",
    "https://raw.githubusercontent.com/Aabishkar2/nepse-data/main/data/company/NABIL.csv",
    "https://raw.githubusercontent.com/Aabishkar2/nepse-data/main/data/company/UPPER.csv",
]

for url in urls:
    name = url.split("/")[-1]
    r = requests.get(url, timeout=15)
    if r.status_code == 200:
        lines = r.text.strip().split("\n")
        print(f"OK  {name}: {len(lines)} rows")
        print(f"    Header : {lines[0]}")
        print(f"    First  : {lines[1]}")
        print(f"    Last   : {lines[-1]}")
        print()
    else:
        print(f"FAIL {name}: HTTP {r.status_code}")
        print()