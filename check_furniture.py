import json

with open('master_index.json', 'r') as f:
    data = json.load(f)

furniture = [a for a in data['assets'] if a['pack'] == 'Furniture_Misc']

print(f"Total Furniture_Misc items: {len(furniture)}")
print("\n=== Sample Assets ===")
for f in furniture[:20]:
    print(f"  {f['name']}")

# Look for dining-related items
dining = [f for f in furniture if any(word in f['name'].lower() for word in ['dining', 'table', 'chair', 'seat'])]
print(f"\n=== Dining-related items: {len(dining)} ===")
for d in dining[:10]:
    print(f"  {d['name']} - {d['s3_path']}")

