export function shouldSuggestMetadata(query: string, minimumLength = 2) {
  return query.trim().length >= minimumLength;
}
