import test from "node:test";
import assert from "node:assert/strict";
import { unavailableMessage } from "@/lib/checkout-fulfilment";

test("names the lines the address's warehouse cannot supply; silent otherwise", () => {
  assert.equal(unavailableMessage({ serviceable: true, unavailableLines: ["QA TEST ITEM"] }, "110054"),
    "QA TEST ITEM isn't in stock for delivery to 110054. Choose another address.");
  assert.equal(unavailableMessage({ serviceable: true, unavailableLines: [] }, "190008"), null);
  assert.equal(unavailableMessage({ serviceable: false, unavailableLines: [] }, "999999"), null, "unserved has its own message");
  assert.equal(unavailableMessage(null, "190008"), null, "no quote yet");
});
