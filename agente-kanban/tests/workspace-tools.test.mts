import { test } from "node:test";
import assert from "node:assert/strict";
import {
  effectiveTools,
  routineTools,
  validateResolverCall,
} from "../lib/workspace-tools";
import type { ConnectedTool } from "../lib/workspace-types";

const resolver: ConnectedTool = {
  name: "list_dynamic_enum_values",
  description: "Resolve options",
  schema: {},
  access: "disabled",
  readOnly: true,
};
const board: ConnectedTool = {
  name: "find_cards",
  description: "Read cards",
  readOnly: true,
  access: "read",
  schema: {
    type: "object",
    properties: {
      board: {
        anyOf: [{ type: "string" }, { type: "null" }],
        _meta: { "zapier/dynamic_enum": { resolver: resolver.name } },
      },
    },
  },
};

test("read permissions include only declared read-only helpers and revoke them with the parent", () => {
  const available = effectiveTools([
    board,
    resolver,
    { ...board, name: "move_card", readOnly: false },
  ]);
  assert.equal(
    available.find((tool) => tool.name === "move_card")!.access,
    "disabled",
  );
  assert.deepEqual(
    available.find((tool) => tool.name === resolver.name)!.requiredBy,
    [board.name],
  );
  assert.deepEqual(
    routineTools([board.name], available).map((tool) => tool.name),
    [board.name, resolver.name],
  );
  // The UI may save its effective snapshot. Derived permissions must not become permanent.
  const disabled = effectiveTools(
    available.map((tool) =>
      tool.name === board.name ? { ...tool, access: "disabled" } : tool,
    ),
  );
  assert.equal(
    disabled.find((tool) => tool.name === resolver.name)!.access,
    "disabled",
  );
  assert.equal(
    resolver.access,
    "disabled",
    "The persisted source must not be mutated by a read",
  );
});

test("missing helpers and helpers without an explicit read-only declaration cannot be inherited", () => {
  for (const readOnly of [false, undefined]) {
    const available = effectiveTools([board, { ...resolver, readOnly }]);
    assert.equal(available[1].access, "disabled");
    assert.throws(
      () => routineTools([board.name], available),
      /auxiliar de leitura/,
    );
  }
  assert.throws(
    () => routineTools([board.name], [board]),
    /auxiliar de leitura/,
  );
});

test("resolvers cannot look up fields of a tool outside the routine or unrelated to the helper", () => {
  const allowed = routineTools([board.name], effectiveTools([board, resolver]));
  const helper = allowed.find((tool) => tool.name === resolver.name)!;
  assert.doesNotThrow(() =>
    validateResolverCall(
      helper,
      { tool_name: board.name, property_name: "board" },
      allowed,
    ),
  );
  assert.throws(
    () =>
      validateResolverCall(
        helper,
        { tool_name: "private_other_tool", property_name: "board" },
        allowed,
      ),
    /autorizadas/,
  );
  assert.throws(
    () => validateResolverCall(helper, { tool_name: helper.name }, allowed),
    /autorizadas/,
  );
});
