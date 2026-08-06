import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getOtpChannel, getOtpProvider } from "../auth-provider";

const ENV_KEYS = ["AUTH_OTP_CHANNEL"] as const;

type MutableEnv = Record<string, string | undefined>;

function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as MutableEnv)[key];
  else (process.env as MutableEnv)[key] = value;
}

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  setEnv("AUTH_OTP_CHANNEL", undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
});

test("getOtpChannel returns email by default", () => {
  assert.equal(getOtpChannel(), "email");
});

test("getOtpChannel returns phone when AUTH_OTP_CHANNEL is phone", () => {
  setEnv("AUTH_OTP_CHANNEL", "phone");
  assert.equal(getOtpChannel(), "phone");
});

test("getOtpChannel returns email when AUTH_OTP_CHANNEL is anything else", () => {
  setEnv("AUTH_OTP_CHANNEL", "unsupported_channel");
  assert.equal(getOtpChannel(), "email");
});

test("getOtpProvider returns a provider matching getOtpChannel", () => {
  setEnv("AUTH_OTP_CHANNEL", "phone");
  const provider = getOtpProvider();
  assert.equal(provider.channel, "phone");
});
