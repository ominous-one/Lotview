export function getDealershipById(id: number): any {
  return null;
}

export function deriveDealershipOperatorLabel(dealership: any): string {
  if (!dealership) return "Unknown dealership";
  return String(
    dealership.name ||
    dealership.displayName ||
    dealership.legalName ||
    dealership.slug ||
    `Dealership ${dealership.id ?? "unknown"}`,
  );
}
