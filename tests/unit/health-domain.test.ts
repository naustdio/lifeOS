// health-tracking Phase 3 — pure domain predicates mirroring `health` schema's CHECK constraints
// and BEFORE INSERT/UPDATE trigger (design.md Schema, migration `20260804090033_health_schema.sql`
// / `20260804090034_health_security.sql`). Critical-logic focus per openspec/config.yaml
// (`strict_tdd: false`) — this file was written and run RED (before `src/modules/health/domain`
// existed) to confirm each predicate genuinely encodes the DB constraint, not asserted from memory.

import { describe, expect, it } from "vitest";
import {
  accountSatisfiesEventPrivacy,
  boundedProgressLabel,
  costFieldsConsistent,
  dosageAllowed,
  isBoundedSeriesComplete,
  isValidEventType,
  isValidVisibility,
  recurringRequiresCost,
  remainingAfterPost,
  resultSummaryAllowed,
} from "@/modules/health/domain/event";
import { isValidVitalMetric, sortForTrend } from "@/modules/health/domain/vital";
import { bloodTypeAlreadySet, currentFacts, isValidFactType, severityAllowed } from "@/modules/health/domain/profile";

describe("health.events type/column legality (mirrors health_schema.sql CHECKs)", () => {
  it("accepts exactly the five costed event types (change: nutrition-tracking)", () => {
    expect(isValidEventType("study")).toBe(true);
    expect(isValidEventType("consultation")).toBe(true);
    expect(isValidEventType("medication")).toBe(true);
    expect(isValidEventType("vaccine")).toBe(true);
    expect(isValidEventType("nutrition")).toBe(true);
    expect(isValidEventType("surgery")).toBe(false);
  });

  it("accepts exactly household/private visibility", () => {
    expect(isValidVisibility("household")).toBe(true);
    expect(isValidVisibility("private")).toBe(true);
    expect(isValidVisibility("public")).toBe(false);
  });

  it("cost fields must be all-null or all-present (events_cost_all_or_none)", () => {
    expect(costFieldsConsistent({ amountCents: null, accountId: null, categoryId: null })).toBe(true);
    expect(costFieldsConsistent({ amountCents: 5000, accountId: "a", categoryId: "c" })).toBe(true);
    expect(costFieldsConsistent({ amountCents: 5000, accountId: null, categoryId: "c" })).toBe(false);
    expect(costFieldsConsistent({ amountCents: null, accountId: "a", categoryId: "c" })).toBe(false);
  });

  it("result_summary is legal only on a study event (events_result_only_study)", () => {
    expect(resultSummaryAllowed("study")).toBe(true);
    expect(resultSummaryAllowed("consultation")).toBe(false);
    expect(resultSummaryAllowed("medication")).toBe(false);
    expect(resultSummaryAllowed("vaccine")).toBe(false);
  });

  it("dosage is legal only on medication/vaccine (events_dosage_only_meds)", () => {
    expect(dosageAllowed("medication")).toBe(true);
    expect(dosageAllowed("vaccine")).toBe(true);
    expect(dosageAllowed("study")).toBe(false);
    expect(dosageAllowed("consultation")).toBe(false);
  });

  it("a recurring_transaction_id requires a cost (events_recurring_needs_cost)", () => {
    expect(recurringRequiresCost(null, null)).toBe(true);
    expect(recurringRequiresCost(null, 5000)).toBe(true);
    expect(recurringRequiresCost("recurring-id", 5000)).toBe(true);
    expect(recurringRequiresCost("recurring-id", null)).toBe(false);
  });

  it("a private event's funding account must be private and owned by the same user (enforce_private_event_account)", () => {
    expect(accountSatisfiesEventPrivacy("household", "user-a", "acct-1", { visibility: "household", ownerUserId: "user-a" })).toBe(true);
    expect(accountSatisfiesEventPrivacy("private", "user-a", null, null)).toBe(true);
    expect(accountSatisfiesEventPrivacy("private", "user-a", "acct-1", { visibility: "private", ownerUserId: "user-a" })).toBe(true);
    expect(accountSatisfiesEventPrivacy("private", "user-a", "acct-1", { visibility: "household", ownerUserId: "user-a" })).toBe(false);
    expect(accountSatisfiesEventPrivacy("private", "user-a", "acct-1", { visibility: "private", ownerUserId: "user-b" })).toBe(false);
    expect(accountSatisfiesEventPrivacy("private", "user-a", "acct-1", null)).toBe(false);
  });
});

describe("bounded-occurrence math (design.md Decision 6, mirrors confirm_recurring_transaction's cursor)", () => {
  it("decrements installments_remaining by one per post, clamped at 0", () => {
    expect(remainingAfterPost(3)).toBe(2);
    expect(remainingAfterPost(1)).toBe(0);
    expect(remainingAfterPost(0)).toBe(0);
  });

  it("a bounded series is complete exactly when installments_remaining reaches 0", () => {
    expect(isBoundedSeriesComplete(3)).toBe(false);
    expect(isBoundedSeriesComplete(1)).toBe(false);
    expect(isBoundedSeriesComplete(0)).toBe(true);
  });

  it("computes the same '(n/total)' progress label confirm_recurring_transaction hardcodes into the description", () => {
    // A 3-dose series: after the 1st post, 2 remain -> "1/3".
    expect(boundedProgressLabel(3, 2)).toBe("1/3");
    expect(boundedProgressLabel(3, 1)).toBe("2/3");
    expect(boundedProgressLabel(3, 0)).toBe("3/3");
  });
});

describe("health.vital_readings (mirrors health_schema.sql CHECKs)", () => {
  it("accepts exactly the five original vital metrics", () => {
    expect(isValidVitalMetric("weight_kg")).toBe(true);
    expect(isValidVitalMetric("systolic_bp")).toBe(true);
    expect(isValidVitalMetric("diastolic_bp")).toBe(true);
    expect(isValidVitalMetric("glucose_mgdl")).toBe(true);
    expect(isValidVitalMetric("heart_rate")).toBe(true);
    expect(isValidVitalMetric("cholesterol")).toBe(false);
  });

  it("accepts the 14 body-composition metrics added by change: nutrition-tracking", () => {
    expect(isValidVitalMetric("body_fat_pct")).toBe(true);
    expect(isValidVitalMetric("body_fat_kg")).toBe(true);
    expect(isValidVitalMetric("muscle_mass_pct")).toBe(true);
    expect(isValidVitalMetric("muscle_mass_kg")).toBe(true);
    expect(isValidVitalMetric("skinfold_biceps_mm")).toBe(true);
    expect(isValidVitalMetric("skinfold_triceps_mm")).toBe(true);
    expect(isValidVitalMetric("skinfold_subscapular_mm")).toBe(true);
    expect(isValidVitalMetric("skinfold_iliac_crest_mm")).toBe(true);
    expect(isValidVitalMetric("skinfold_supraspinal_mm")).toBe(true);
    expect(isValidVitalMetric("skinfold_abdominal_mm")).toBe(true);
    expect(isValidVitalMetric("waist_cm")).toBe(true);
    expect(isValidVitalMetric("hip_cm")).toBe(true);
    expect(isValidVitalMetric("thigh_cm")).toBe(true);
    expect(isValidVitalMetric("arm_flexed_cm")).toBe(true);
  });

  it("sorts entries chronologically ascending for trend rendering", () => {
    const entries = [
      { metric: "weight_kg" as const, valueNumeric: 80, measuredAt: "2026-03-01" },
      { metric: "weight_kg" as const, valueNumeric: 78, measuredAt: "2026-01-01" },
      { metric: "weight_kg" as const, valueNumeric: 79, measuredAt: "2026-02-01" },
    ];
    expect(sortForTrend(entries).map((e) => e.measuredAt)).toEqual(["2026-01-01", "2026-02-01", "2026-03-01"]);
  });
});

describe("health.profile_facts (mirrors health_schema.sql CHECKs + unique index)", () => {
  it("accepts exactly the three fact types", () => {
    expect(isValidFactType("blood_type")).toBe(true);
    expect(isValidFactType("allergy")).toBe(true);
    expect(isValidFactType("condition")).toBe(true);
    expect(isValidFactType("surgery")).toBe(false);
  });

  it("severity is legal only on an allergy fact (profile_severity_only_allergy)", () => {
    expect(severityAllowed("allergy")).toBe(true);
    expect(severityAllowed("blood_type")).toBe(false);
    expect(severityAllowed("condition")).toBe(false);
  });

  it("flags a duplicate blood_type before the DB's partial unique index would reject it", () => {
    expect(bloodTypeAlreadySet([{ factType: "allergy", active: true }])).toBe(false);
    expect(bloodTypeAlreadySet([{ factType: "blood_type", active: true }])).toBe(true);
  });

  it("returns only active facts as the current state", () => {
    const facts = [
      { factType: "allergy" as const, active: true, label: "peanuts" },
      { factType: "allergy" as const, active: false, label: "shellfish (resolved)" },
    ];
    expect(currentFacts(facts).map((f) => f.label)).toEqual(["peanuts"]);
  });
});
