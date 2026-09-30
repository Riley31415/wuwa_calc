# Insert each action's `node` into a Rust kit file, read off the frozen TS kit it ports.
# python add_nodes.py <ts kit file> <rust kit file>
import re
import sys

ts = open(sys.argv[1], encoding="utf8").read()
rs_path = sys.argv[2]
rs = open(rs_path, encoding="utf8").read()

# every `Action("name", {...` / `xAction("name", {...` with a node inside its own def
nodes = {}
for m in re.finditer(r'[A-Za-z]*[Aa]ction\(\s*"([^"]+)"\s*,\s*\{', ts):
    body = ts[m.end():m.end() + 1500]
    depth, end = 1, 0
    for i, ch in enumerate(body):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                end = i
                break
    node = re.search(r"node:\s*Node\.(\w+)", body[:end])
    if node:
        nodes[m.group(1)] = node.group(1)

count = 0
def put(m):
    global count
    name = m.group(2)
    if name not in nodes:
        return m.group(0)
    count += 1
    return f'{m.group(1)}node: Some(Node::{nodes[name]}), ..{m.group(3)}("{name}")'

rs2 = re.sub(r'(\s*)\.\.(act|spe|ele|fus|basic|heavy|shred)\("([^"]+)"\)', lambda m: m.group(0), rs)
# ..act("Name") inside a struct literal
rs2 = re.sub(r'(\n\s*)\.\.(act|ele|spe|fus)\("([^"]+)"\)', lambda m: (m.group(1) + f'node: Some(Node::{nodes[m.group(3)]}),' + m.group(1) + f'..{m.group(2)}("{m.group(3)}")') if m.group(3) in nodes else m.group(0), rs2)
# ..act("Name") on one line: `, ..act("Name") })`
rs2 = re.sub(r', \.\.(act|ele|spe|fus)\("([^"]+)"\)', lambda m: (f', node: Some(Node::{nodes[m.group(2)]}), ..{m.group(1)}("{m.group(2)}")') if m.group(2) in nodes else m.group(0), rs2)
open(rs_path, "w", encoding="utf8", newline="\n").write(rs2)
print(len(nodes), "nodes in TS;", rs2.count("node: Some(Node::"), "placed in Rust")
