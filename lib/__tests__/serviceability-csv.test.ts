import assert from "node:assert/strict";
import test from "node:test";
import { parsePincodeCsv, CSV_TEMPLATE } from "@/lib/serviceability-csv";

/**
 * The bulk serviceability import.
 *
 * This is the highest-consequence input on the operations console: one bad file
 * tells a whole district we deliver when we do not, or stops selling to one we
 * do. So the file is validated completely before anything is applied, and every
 * case below is a way a real spreadsheet arrives wrong.
 */
const H = "pincode,warehouse,eta_minutes,delivery_fee_rupees,cod_allowed,active";

test("the template parses as its own valid file", () => {
  /* If the thing we hand people to fill in does not itself import, nothing
     else here matters. */
  const r = parsePincodeCsv(CSV_TEMPLATE);
  assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.issues));
});

test("a good file parses into rows", () => {
  const r = parsePincodeCsv(
    `${H}\n190001,SRINAGAR-CENTRAL,60,49,yes,yes\n190014,SRINAGAR-CENTRAL,,299.50,no,yes\n`
  );
  assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.issues));
  if (!r.ok) return;
  assert.equal(r.rows.length, 2);
  assert.deepEqual(r.rows[0], {
    pincode: "190001",
    warehouseCode: "SRINAGAR-CENTRAL",
    etaMinutes: 60,
    deliveryFeePaise: 4900,
    codAllowed: true,
    isActive: true,
  });
  /* 299.50 must be 29950 paise exactly, and a blank ETA must stay absent. */
  assert.equal(r.rows[1].deliveryFeePaise, 29_950);
  assert.equal(r.rows[1].etaMinutes, 0);
});

test("a blank ETA is not filled in with a promise", () => {
  /* The schema defaults etaMinutes to 60. A blank column becoming a 60-minute
     promise is the same unverified claim this project has already had to
     remove from a product chip and a reporting SLA. */
  const r = parsePincodeCsv(`${H}\n190001,W,,0,no,yes\n`);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.rows[0].etaMinutes, 0, "a blank ETA was turned into a promise");
});

test("nothing is applied when any row is wrong", () => {
  /* All or nothing. A half-applied file leaves coverage in a state nobody
     chose and nobody can see. */
  const r = parsePincodeCsv(`${H}\n190001,W,60,49,yes,yes\n19000X,W,60,49,yes,yes\n`);
  assert.equal(r.ok, false, "a file with a bad row was accepted");
  if (!r.ok) {
    assert.equal(r.issues.length, 1);
    assert.equal(r.issues[0].line, 3, "the error points at the wrong line");
  }
});

test("a pincode outside the market is refused", () => {
  /* 400001 is Mumbai. Accepting it would promise delivery in a city with no
     warehouse behind it. */
  const r = parsePincodeCsv(`${H}\n400001,W,60,49,yes,yes\n`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.issues[0].message, /Jammu & Kashmir/);
});

test("a malformed pincode is refused", () => {
  for (const bad of ["19001", "1900011", "abcdef", "", "19 0001"]) {
    const r = parsePincodeCsv(`${H}\n${bad},W,60,49,yes,yes\n`);
    assert.equal(r.ok, false, `"${bad}" was accepted as a pincode`);
  }
});

test("a duplicate pincode is refused and names the earlier line", () => {
  /* Two rows for one pincode means the file disagrees with itself, and
     whichever won would be an accident of ordering. */
  const r = parsePincodeCsv(`${H}\n190001,W,60,49,yes,yes\n190001,W,90,99,no,no\n`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.issues[0].message, /also on line 2/);
});

test("yes/no is read in the spellings a spreadsheet produces", () => {
  const r = parsePincodeCsv(
    `${H}\n190001,W,60,0,TRUE,1\n190002,W,60,0,N,false\n`
  );
  assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.issues));
  if (!r.ok) return;
  assert.equal(r.rows[0].codAllowed, true);
  assert.equal(r.rows[0].isActive, true);
  assert.equal(r.rows[1].codAllowed, false);
  assert.equal(r.rows[1].isActive, false);
});

test("an ambiguous flag is refused rather than guessed", () => {
  /* "maybe" defaulting to false would silently stop selling to a pincode. */
  const r = parsePincodeCsv(`${H}\n190001,W,60,0,maybe,yes\n`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.issues[0].message, /use yes or no/);
});

test("a fee that is not a rupee amount is refused", () => {
  for (const bad of ["4 9", "₹49", "49.999", "1e3", "-5"]) {
    const r = parsePincodeCsv(`${H}\n190001,W,60,${bad},yes,yes\n`);
    assert.equal(r.ok, false, `fee "${bad}" was accepted`);
  }
});

test("the wrong header is refused before any row is read", () => {
  const r = parsePincodeCsv(`pincode,warehouse\n190001,W\n`);
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.issues[0].line, 1);
});

test("an empty file and a header-only file are both refused", () => {
  assert.equal(parsePincodeCsv("").ok, false);
  assert.equal(parsePincodeCsv(`${H}\n`).ok, false);
});

test("blank lines and CRLF do not break a real export", () => {
  /* Spreadsheets end files with a newline and Windows uses CRLF. Neither is an
     error, and treating them as one would reject most real uploads. */
  const r = parsePincodeCsv(`${H}\r\n190001,W,60,49,yes,yes\r\n\r\n`);
  assert.equal(r.ok, true, r.ok ? "" : JSON.stringify(r.issues));
});
