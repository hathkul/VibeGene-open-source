export type DatabaseManagerPresentationTreeNode = {
  id: string
  name: string
  children: DatabaseManagerPresentationTreeNode[]
}

export function mapPresentationTreeNodes(
  nodes: readonly { id: string; name: string; children: readonly unknown[] }[],
): DatabaseManagerPresentationTreeNode[] {
  return nodes.map((node) => ({
    id: node.id,
    name: node.name,
    children: mapPresentationTreeNodes(
      node.children as readonly { id: string; name: string; children: readonly unknown[] }[],
    ),
  }))
}
