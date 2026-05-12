export const forcedCityStateCountryCodes = new Set(["SG", "HK", "MO", "MC"]);

export const cityStateThreshold = {
  maxVisibleRegions: 1,
  maxVisibleCities: 3
} as const;

export function isCityStateCountry(params: {
  countryCode?: string | null;
  regionCount: number;
  cityCount: number;
}) {
  const countryCode = params.countryCode?.toUpperCase();
  if (!countryCode) return false;
  if (forcedCityStateCountryCodes.has(countryCode)) return true;

  return (
    params.cityCount > 0 &&
    params.cityCount <= cityStateThreshold.maxVisibleCities &&
    params.regionCount <= cityStateThreshold.maxVisibleRegions
  );
}
