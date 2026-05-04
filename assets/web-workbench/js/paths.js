export function parentPath(value) {
  const normalized = String(value || "").replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  return index > 0 ? normalized.slice(0, index) : "";
}

export function joinPath(parent, child) {
  return parent ? `${parent}/${child}` : child;
}

export function isSameOrChildPath(parent, child) {
  return child === parent || child.startsWith(`${parent}/`);
}
