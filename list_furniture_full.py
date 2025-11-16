import json

with open('master_index.json', 'r') as f:
    data = json.load(f)

furniture = [a for a in data['assets'] if a['pack'] == 'Furniture_Misc']

# Get unique asset names from S3 paths
unique_assets = {}
for f in furniture:
    path = f['s3_path']
    # Extract meaningful name from path
    parts = path.split('/')
    if len(parts) > 0:
        asset_name = parts[-1] if parts[-1] else parts[-2]
        unique_assets[asset_name] = path

print(f"Unique furniture assets: {len(unique_assets)}")
print("\n=== Available Furniture (first 30) ===")
for i, (name, path) in enumerate(list(unique_assets.items())[:30]):
    print(f"{i+1}. {name}")

