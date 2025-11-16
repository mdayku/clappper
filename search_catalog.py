import json

# Load catalog
with open('master_index.json', 'r') as f:
    data = json.load(f)

# Search for furniture
tables = [a for a in data['assets'] if 'table' in a['name'].lower()]
chairs = [a for a in data['assets'] if 'chair' in a['name'].lower()]
furniture = [a for a in data['assets'] if 'furniture' in ' '.join(a['tags']).lower()]

print(f"Found {len(tables)} tables")
print(f"Found {len(chairs)} chairs")
print(f"Found {len(furniture)} furniture items")

print("\n=== Sample Tables ===")
for t in tables[:5]:
    print(f"  {t['name']} - {t['s3_path']}")

print("\n=== Sample Chairs ===")
for c in chairs[:5]:
    print(f"  {c['name']} - {c['s3_path']}")

print("\n=== Furniture Packs ===")
packs = {}
for f in furniture:
    pack = f['pack']
    packs[pack] = packs.get(pack, 0) + 1
for pack, count in sorted(packs.items(), key=lambda x: -x[1]):
    print(f"  {pack}: {count} items")

