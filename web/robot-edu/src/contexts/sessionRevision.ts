export function nextSessionRevision(previousToken: string | null, nextToken: string | null, currentRevision: number) {
  return previousToken === nextToken ? currentRevision : currentRevision + 1;
}
