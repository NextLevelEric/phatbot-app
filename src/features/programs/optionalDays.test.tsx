import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canSkipOptionalDay, findDayOption, optionalDaysLabel, type ProgramDayOption } from "./optionalDays";

// Exercise the real rendered controls and RPC handlers without a DOM dependency.
const harness = vi.hoisted(() => ({ states: [] as unknown[], cursor: 0, rpc: vi.fn() }));
vi.mock("react", async (original) => ({
  ...await original<typeof import("react")>(),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [harness.states[index], (value: unknown) => { harness.states[index] = value; }];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.states)) harness.states[index] = { current: initial };
    return harness.states[index];
  },
}));
vi.mock("@/lib/supabase", () => ({ createSupabaseBrowserClient: () => ({ rpc: harness.rpc }) }));
import OptionalProgramDayActions from "@/components/OptionalProgramDayActions";

const option: ProgramDayOption = {
  assignment_id: "assignment", program_day_id: "six", day_number: 6,
  is_optional: true, next_program_day_id: "six", cursor_revision: 42, following_day_number: 1,
};
type Node = { type?: unknown; props?: { children?: unknown; onClick?: () => void; disabled?: boolean } };
function nodes(value: unknown): Node[] {
  if (Array.isArray(value)) return value.flatMap(nodes);
  if (!value || typeof value !== "object") return [];
  const node = value as Node;
  return [node, ...nodes(node.props?.children)];
}
const refreshed = vi.fn();
const location = { href: "" };
function render(value = option, disabled = false) {
  harness.cursor = 0;
  return OptionalProgramDayActions({ option: value, disabled, onSkipped: refreshed });
}
const buttons = (value = option, disabled = false) => nodes(render(value, disabled)).filter(node => node.type === "button");
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
beforeEach(() => {
  harness.states = []; harness.rpc.mockReset(); refreshed.mockReset(); location.href = "";
  vi.stubGlobal("window", { location });
});
afterEach(() => vi.unstubAllGlobals());

describe("optional-day athlete controls", () => {
  it("offers start and skip only on the expected optional day", () => {
    expect(buttons()).toHaveLength(2);
    expect(JSON.stringify(render())).toContain("Start Day 6");
    expect(canSkipOptionalDay({ ...option, is_optional: false })).toBe(false);
    expect(render({ ...option, is_optional: false })).toBeNull();
  });
  it("retains a bonus start after skipping, without offering another skip", () => {
    const bonus = { ...option, next_program_day_id: "one" };
    expect(buttons(bonus)).toHaveLength(1);
    expect(JSON.stringify(render(bonus))).toContain("won't move your next normal workout");
  });
  it.each([true, false])("reloads the authority after skip result %s using the exact revision", async (data) => {
    harness.rpc.mockResolvedValue({ data, error: null });
    buttons()[1].props?.onClick?.(); await flush();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("skip_my_optional_program_day", {
      p_assignment_id: "assignment", p_program_day_id: "six", p_cursor_revision: 42,
    });
    expect(refreshed).toHaveBeenCalledOnce();
  });
  it("starts a real optional session and navigates to the returned session", async () => {
    harness.rpc.mockResolvedValue({ data: "session-id", error: null });
    buttons({ ...option, next_program_day_id: "one" })[0].props?.onClick?.(); await flush();
    expect(harness.rpc).toHaveBeenCalledExactlyOnceWith("start_my_optional_program_workout", {
      p_assignment_id: "assignment", p_program_day_id: "six",
    });
    expect(location.href).toBe("/sessions/session-id");
  });
  it("blocks rapid duplicate actions while a request is unresolved", () => {
    harness.rpc.mockReturnValue(new Promise(() => {}));
    const controls = buttons();
    controls[0].props?.onClick?.(); controls[0].props?.onClick?.(); controls[1].props?.onClick?.();
    expect(harness.rpc).toHaveBeenCalledOnce();
    expect(buttons().every(node => node.props?.disabled)).toBe(true);
  });
  it("honors the in-progress/empty-prescription disabled state", () => {
    for (const button of buttons(option, true)) { expect(button.props?.disabled).toBe(true); button.props?.onClick?.(); }
    expect(harness.rpc).not.toHaveBeenCalled();
  });
  it("shows recovery on uncertain network failure without retrying or claiming rollback", async () => {
    harness.rpc.mockRejectedValue(new Error("network lost"));
    buttons()[0].props?.onClick?.(); await flush();
    expect(JSON.stringify(render())).toContain("couldn't confirm that action");
    expect(location.href).toBe(""); expect(refreshed).not.toHaveBeenCalled(); expect(harness.rpc).toHaveBeenCalledOnce();
  });
  it("does not accept a malformed skip result as successful", async () => {
    harness.rpc.mockResolvedValue({ data: null, error: null });
    buttons()[1].props?.onClick?.(); await flush();
    expect(refreshed).not.toHaveBeenCalled(); expect(JSON.stringify(render())).toContain("couldn't confirm");
  });
  it("scopes labels and lookup to the exact assignment", () => {
    const options = [option, { ...option, assignment_id: "other", is_optional: false }];
    expect(optionalDaysLabel(options, "assignment")).toBe("Day 6 optional");
    expect(optionalDaysLabel(options, "other")).toBeNull();
    expect(findDayOption(options, "other", "six")?.is_optional).toBe(false);
    expect(findDayOption(options, "missing", "six")).toBeNull();
  });
});
