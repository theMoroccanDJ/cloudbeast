const VM_SKU_PRICING: Record<string, number> = {
  Standard_B2s: 35,
  Standard_B4ms: 70,
  Standard_D2s_v3: 120,
  Standard_D4s_v3: 240,
  Standard_D8s_v3: 480,
  Standard_E2s_v3: 160,
  Standard_E4s_v3: 320,
};

const VM_DOWNSIZE_TARGET: Record<string, string> = {
  Standard_D8s_v3: "Standard_D4s_v3",
  Standard_D4s_v3: "Standard_D2s_v3",
  Standard_D2s_v3: "Standard_B4ms",
  Standard_B4ms: "Standard_B2s",
  Standard_E4s_v3: "Standard_E2s_v3",
};

const DISK_SKU_PRICING_PER_GB: Record<string, number> = {
  Premium_LRS: 0.12,
  Premium_ZRS: 0.14,
  StandardSSD_LRS: 0.08,
  StandardSSD_ZRS: 0.09,
  Standard_LRS: 0.06,
  Standard_ZRS: 0.065,
};

const DISK_DOWNGRADE_TARGET: Record<string, string> = {
  Premium_LRS: "StandardSSD_LRS",
  Premium_ZRS: "StandardSSD_ZRS",
  StandardSSD_LRS: "Standard_LRS",
  StandardSSD_ZRS: "Standard_ZRS",
};

const STORAGE_TIER_PRICING_PER_GB: Record<string, number> = {
  Hot: 0.02,
  Cool: 0.015,
  Archive: 0.002,
};

const STORAGE_TIER_DOWNGRADE_TARGET: Record<string, string> = {
  Hot: "Cool",
  Cool: "Archive",
};

const SQL_SKU_PRICING: Record<string, number> = {
  GP_Gen5_8: 600,
  GP_Gen5_4: 330,
  GP_Gen5_2: 180,
  GP_Gen5_1: 95,
  HS_Gen5_8: 680,
};

const SQL_DOWNSIZE_TARGET: Record<string, string> = {
  GP_Gen5_8: "GP_Gen5_4",
  GP_Gen5_4: "GP_Gen5_2",
  GP_Gen5_2: "GP_Gen5_1",
  HS_Gen5_8: "GP_Gen5_4",
};

const APP_SERVICE_SKU_PRICING: Record<string, number> = {
  P3v3: 400,
  P2v3: 250,
  P1v3: 130,
  S2: 90,
  S1: 60,
  B1: 30,
};

const APP_SERVICE_DOWNGRADE_TARGET: Record<string, string> = {
  P3v3: "P2v3",
  P2v3: "P1v3",
  S2: "S1",
  S1: "B1",
};

function diffPositive(current: number, target: number): number {
  const delta = current - target;
  return delta > 0 ? delta : 0;
}

export function getRecommendedVmSku(currentSku: string | null | undefined): string | null {
  if (!currentSku) {
    return null;
  }
  return VM_DOWNSIZE_TARGET[currentSku] ?? null;
}

export function estimateVmResizeSavings(currentSku: string, targetSku: string): number {
  const current = VM_SKU_PRICING[currentSku];
  const target = VM_SKU_PRICING[targetSku];
  if (!current || !target) {
    return 0;
  }
  return diffPositive(current, target);
}

export function getRecommendedDiskSku(currentSku: string | null | undefined): string | null {
  if (!currentSku) {
    return null;
  }
  return DISK_DOWNGRADE_TARGET[currentSku] ?? null;
}

export function estimateDiskSkuSavings(
  currentSku: string,
  targetSku: string,
  sizeGb: number | null | undefined,
): number {
  const currentRate = DISK_SKU_PRICING_PER_GB[currentSku];
  const targetRate = DISK_SKU_PRICING_PER_GB[targetSku];
  if (!currentRate || !targetRate || !sizeGb || sizeGb <= 0) {
    return 0;
  }
  return diffPositive(currentRate * sizeGb, targetRate * sizeGb);
}

export function getRecommendedStorageTier(currentTier: string | null | undefined): string | null {
  if (!currentTier) {
    return null;
  }
  return STORAGE_TIER_DOWNGRADE_TARGET[currentTier] ?? null;
}

export function estimateStorageTierSavings(
  currentTier: string,
  targetTier: string,
  sizeGb: number | null | undefined,
): number {
  const currentRate = STORAGE_TIER_PRICING_PER_GB[currentTier];
  const targetRate = STORAGE_TIER_PRICING_PER_GB[targetTier];
  if (!currentRate || !targetRate || !sizeGb || sizeGb <= 0) {
    return 0;
  }
  return diffPositive(currentRate * sizeGb, targetRate * sizeGb);
}

export function getRecommendedSqlSku(currentSku: string | null | undefined): string | null {
  if (!currentSku) {
    return null;
  }
  return SQL_DOWNSIZE_TARGET[currentSku] ?? null;
}

export function estimateSqlSkuSavings(currentSku: string, targetSku: string): number {
  const current = SQL_SKU_PRICING[currentSku];
  const target = SQL_SKU_PRICING[targetSku];
  if (!current || !target) {
    return 0;
  }
  return diffPositive(current, target);
}

export function getRecommendedAppServiceSku(currentSku: string | null | undefined): string | null {
  if (!currentSku) {
    return null;
  }
  return APP_SERVICE_DOWNGRADE_TARGET[currentSku] ?? null;
}

export function estimateAppServicePlanSavings(currentSku: string, targetSku: string): number {
  const current = APP_SERVICE_SKU_PRICING[currentSku];
  const target = APP_SERVICE_SKU_PRICING[targetSku];
  if (!current || !target) {
    return 0;
  }
  return diffPositive(current, target);
}

export const PUBLIC_IP_MONTHLY_COST = 3;
export const LOAD_BALANCER_MONTHLY_COST = 18;
