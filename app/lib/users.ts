export const defaultUserId = "user-jason";

export const appUsers = [
  { id: defaultUserId, name: "Jason", sortOrder: 0 },
  { id: "user-luyi", name: "Luyi", sortOrder: 1 }
] as const;

export function normalizeUserId(value?: string | null) {
  return appUsers.some((user) => user.id === value) ? value! : defaultUserId;
}
