/**
 * Pure identity entity — zero Supabase/framework imports (module-architecture
 * spec: `domain/` stays pure).
 */
export type Profile = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
};
