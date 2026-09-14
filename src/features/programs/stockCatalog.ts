export type StockCatalogFamilyRow = {
  id: string;
  name: string;
  slug: string;
  source_type: string;
  visibility: string;
  status: string;
};

export type StockCatalogVersionRow = {
  id: string;
  program_family_id: string;
  name: string;
  description: string | null;
  version_number: number;
  program_families: StockCatalogFamilyRow | StockCatalogFamilyRow[] | null;
};

export type StockCatalogDayRow = {
  id: string;
  program_id: string;
  day_number: number;
  name: string;
};

export type StockCatalogProgram = Omit<StockCatalogVersionRow, "program_families"> & {
  familyName: string;
  familySlug: string;
  days: StockCatalogDayRow[];
};

function relatedFamily(row: StockCatalogVersionRow): StockCatalogFamilyRow | null {
  return Array.isArray(row.program_families) ? row.program_families[0] ?? null : row.program_families;
}

export function buildStockCatalog(
  versions: StockCatalogVersionRow[],
  days: StockCatalogDayRow[],
): StockCatalogProgram[] {
  const latestByFamily = new Map<string, StockCatalogProgram>();

  for (const version of versions) {
    const family = relatedFamily(version);
    if (
      !family
      || family.source_type !== "phatbot_stock"
      || family.visibility !== "stock_catalog"
      || family.status !== "active"
    ) continue;

    const current = latestByFamily.get(family.id);
    if (current && current.version_number >= version.version_number) continue;

    const { program_families: _family, ...program } = version;
    latestByFamily.set(family.id, {
      ...program,
      familyName: family.name,
      familySlug: family.slug,
      days: days
        .filter((day) => day.program_id === version.id)
        .sort((left, right) => left.day_number - right.day_number),
    });
  }

  return [...latestByFamily.values()].sort((left, right) => left.familyName.localeCompare(right.familyName));
}

export function stockCatalogDescription(program: Pick<StockCatalogProgram, "familySlug" | "description">): string | null {
  if (program.familySlug === "strength-as-a-skill") return "Six-workout strength-focused rotation.";
  return program.description;
}
