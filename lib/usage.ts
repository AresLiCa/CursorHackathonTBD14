export const USAGE_API_URL = "/api/usage"; // REQUEST URL HERE

type UsageResponse = {
  usage: number;
};

export async function fetchUsageData(): Promise<UsageResponse> {
  const response = await fetch(USAGE_API_URL, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Usage request failed with ${response.status}`);
  }

  const data: unknown = await response.json();

  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as UsageResponse).usage !== "number" ||
    !Number.isFinite((data as UsageResponse).usage)
  ) {
    throw new Error("Usage response must include a numeric usage value");
  }

  return {
    usage: Math.max(0, (data as UsageResponse).usage),
  };
}
