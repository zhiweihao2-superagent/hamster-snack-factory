import json, collections

P = r"D:/deepseek/杂项/hamster-snack-factory/art/incoming/codex2/_tools/validate.json"
d = json.load(open(P, encoding="utf-8"))
g = collections.defaultdict(list)
for x in d:
    g[x["file"].split("/")[0]].append(x)

tot = 0
for k, v in sorted(g.items()):
    c = [x["colors"] for x in v]
    cv = [x["coverage"] for x in v]
    hs = sorted(set(x.get("height") for x in v if x["size"] == "64x64"))
    tot += len(v)
    hstr = str(hs) if hs else "-"
    print("%-18s n=%-3d colors=%d-%-3d cov=%s-%s%%  h=%s" % (k, len(v), min(c), max(c), min(cv), max(cv), hstr))

print("TOTAL", tot, "FAIL", sum(1 for x in d if not x["ok"]))
a = [x for x in d if x["file"].startswith("A2b")]
print("A2b files:", len(a), "OK:", sum(1 for x in a if x["ok"]))

for t in (1, 2, 3, 4):
    rows = [x for x in a if x["file"].startswith("A2b-foe-blast-%d/" % t)]
    order = ["idle-1", "idle-2", "action-windup", "action-strike", "hop-air"]
    rows.sort(key=lambda x: order.index(x["file"].split("/")[1][:-4]))
    print("T%d:" % t, " | ".join("%s %d色 %.1f%% y%d" % (
        r["file"].split("/")[1][:-4], r["colors"], r["coverage"], r["foot_row"]) for r in rows))
