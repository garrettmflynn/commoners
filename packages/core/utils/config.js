
const builtIns = [
  "node:child_process",
  "node:fs",
  "node:url",
  "node:path",
  "node:net",
  "node:util",
  "node:os",
  "node:http",
  "node:https",
  "node:module",
  "node:crypto"
]

export const nodeBuiltIns = [...builtIns, ...builtIns.map((b) => b.replace("node:", ""))]