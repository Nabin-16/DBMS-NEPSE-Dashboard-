"""
Test the nepal-stock-price package.
Install first: pip install nepal-stock-price --break-system-packages
"""

try:
    from nepse_data import NepseData
    print("Package imported OK")

    nd  = NepseData("ADBL")
    df  = nd.price_history()

    print(f"Rows  : {len(df)}")
    print(f"Cols  : {list(df.columns)}")
    print(f"First : {df.iloc[0].to_dict()}")
    print(f"Last  : {df.iloc[-1].to_dict()}")
    print(f"Range : {df.iloc[0].get('date','?')} -> {df.iloc[-1].get('date','?')}")

except ImportError:
    print("Package not installed. Run:")
    print("  pip install nepal-stock-price")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()