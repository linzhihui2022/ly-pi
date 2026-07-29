import json

p = '/Users/lychee/.pi/agent/settings.json'
d = json.load(open(p))
if 'extensions' not in d:
    d['extensions'] = []
path = '/Users/lychee/.pi/agent/extensions/ly-pi/index.js'
if path not in d['extensions']:
    d['extensions'].append(path)
json.dump(d, open(p, 'w'), indent=2, ensure_ascii=False)
print("Added", path, "to extensions")
print(json.dumps(d, indent=2, ensure_ascii=False))
