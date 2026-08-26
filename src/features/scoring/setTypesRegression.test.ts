import { describe, expect, it } from "vitest";
import {
  PHATBOT_SET_TYPE_LABELS,
  isPoScoredSetType,
  isPrEligibleSetType,
  isTechniqueProtectedSetType,
  isVolumeSetType,
  type PhatbotSetType,
} from "./setTypes";

const ALL_TYPES: PhatbotSetType[] = ["warmup", "working", "top", "backoff", "drop", "timed", "tempo"];

describe("PHATBOT set-type contract", () => {
  it("keeps every live set type labeled", () => {
    expect(Object.keys(PHATBOT_SET_TYPE_LABELS).sort()).toEqual([...ALL_TYPES].sort());
  });

  it("scores only working, top, and backoff sets for progressive overload", () => {
    expect(ALL_TYPES.filter(isPoScoredSetType)).toEqual(["working", "top", "backoff"]);
  });

  it("allows PRs only from working, top, and backoff sets", () => {
    expect(ALL_TYPES.filter(isPrEligibleSetType)).toEqual(["working", "top", "backoff"]);
  });

  it("counts drop and tempo sets toward workload volume but excludes warmups and timed sets", () => {
    expect(ALL_TYPES.filter(isVolumeSetType)).toEqual(["working", "top", "backoff", "drop", "tempo"]);
  });

  it("protects tempo sets as technique work", () => {
    expect(ALL_TYPES.filter(isTechniqueProtectedSetType)).toEqual(["tempo"]);
  });

  it("locks the intended semantics for special sets", () => {
    expect(isPoScoredSetType("drop")).toBe(false);
    expect(isPrEligibleSetType("drop")).toBe(false);
    expect(isVolumeSetType("drop")).toBe(true);

    expect(isPoScoredSetType("tempo")).toBe(false);
    expect(isPrEligibleSetType("tempo")).toBe(false);
    expect(isTechniqueProtectedSetType("tempo")).toBe(true);
    expect(isVolumeSetType("tempo")).toBe(true);

    expect(isPoScoredSetType("timed")).toBe(false);
    expect(isPrEligibleSetType("timed")).toBe(false);
    expect(isVolumeSetType("timed")).toBe(false);
  });
});
