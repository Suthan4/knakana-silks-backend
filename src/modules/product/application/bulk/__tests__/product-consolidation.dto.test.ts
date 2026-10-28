import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ConsolidateSimpleProductsDTOSchema } from "../../product.dto.js";

describe("ConsolidateSimpleProductsDTOSchema", () => {
  const validPayload = {
    parentProductId: "101",
    attributeName: "color" as const,
    products: [
      { productId: "101", attributeValue: "Wine" },
      { productId: "102", attributeValue: "Peach" },
      { productId: "103", attributeValue: "Brown with Pink" },
    ],
  };

  it("accepts a valid consolidation request with distinct product IDs and attribute values", () => {
    assert.equal(ConsolidateSimpleProductsDTOSchema.safeParse(validPayload).success, true);
  });

  it("rejects requests with fewer than two products", () => {
    const result = ConsolidateSimpleProductsDTOSchema.safeParse({
      ...validPayload,
      products: [validPayload.products[0]],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate product IDs", () => {
    const result = ConsolidateSimpleProductsDTOSchema.safeParse({
      ...validPayload,
      products: [
        { productId: "101", attributeValue: "Wine" },
        { productId: "101", attributeValue: "Peach" },
      ],
    });
    assert.equal(result.success, false);
  });

  it("rejects duplicate attribute values regardless of letter case", () => {
    const result = ConsolidateSimpleProductsDTOSchema.safeParse({
      ...validPayload,
      products: [
        { productId: "101", attributeValue: "Wine" },
        { productId: "102", attributeValue: " wine " },
      ],
    });
    assert.equal(result.success, false);
  });

  it("requires the parent to be one of the selected products", () => {
    const result = ConsolidateSimpleProductsDTOSchema.safeParse({
      ...validPayload,
      parentProductId: "999",
    });
    assert.equal(result.success, false);
  });

  it("rejects non-numeric product IDs", () => {
    const result = ConsolidateSimpleProductsDTOSchema.safeParse({
      ...validPayload,
      parentProductId: "not-a-product-id",
    });
    assert.equal(result.success, false);
  });
});
