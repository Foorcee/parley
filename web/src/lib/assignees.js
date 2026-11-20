/* The summarizer stores compound assignees ("Devin, Vineel") and name variants
   ("Devin" vs "Devin Robinson"). Split + canonicalize by word-prefix folding. */
export function splitAssignees(s) {
  if (s == null) return [];
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

export function buildCanonical(names) {
  const uniq = [...new Set(names)];
  const longestFirst = [...uniq].sort((a, b) => b.length - a.length);
  const map = new Map();
  for (const n of uniq) {
    const nl = n.toLowerCase();
    map.set(n, longestFirst.find((c) => {
      const cl = c.toLowerCase();
      return cl === nl || cl.startsWith(nl + ' ');
    }) || n);
  }
  return map;
}

export function peopleOf(todo, canon) {
  return [...new Set(splitAssignees(todo.assignee).map((n) => canon.get(n) || n))];
}
