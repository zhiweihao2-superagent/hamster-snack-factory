import os

TOOLS = os.path.dirname(os.path.abspath(__file__))
src = os.path.join(TOOLS, "p_A2c_idle_T2b.txt")
dst = os.path.join(TOOLS, "p_A2c_idle_T2c.txt")
s = open(src, encoding="utf-8").read()

old = "`TWO` thick bright red #c8342a firecracker sticks lying side by side across the LOWER belly, each 3 blocks thick with ONE dark brown #3a241e band and a rounded cap."
new = ("`TWO` thick bright red #c8342a firecracker sticks lying HORIZONTALLY, one directly above the other, "
       "stacked like two short logs across the LOWER belly. Each stick is 3 blocks thick, runs LEFT-TO-RIGHT, "
       "and has ONE dark brown #3a241e band. They are NOT standing upright, NOT vertical, NOT two vertical bars.")
if old not in s:
    raise SystemExit("T2 提示词里找不到炸药原句，请手动检查")
s = s.replace(old, new)
open(dst, "w", encoding="utf-8").write(s)
print("T2c written; HORIZONTALLY present:", "HORIZONTALLY" in s)
