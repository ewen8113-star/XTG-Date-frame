import assert from "node:assert/strict";
import test from "node:test";
import { parseAuthResponse } from "./auth";

test("auth response keeps server login errors", async () => {
  const response = new Response(JSON.stringify({ error: "账号或密码错误" }), {
    status: 401,
    headers: { "Content-Type": "application/json" }
  });
  await assert.rejects(parseAuthResponse(response), /账号或密码错误/);
});

test("auth response explains an empty proxy response", async () => {
  const response = new Response(null, { status: 502 });
  await assert.rejects(parseAuthResponse(response), /账户服务暂时不可用/);
});

test("auth response explains a non-JSON response", async () => {
  const response = new Response("<html>proxy error</html>", { status: 200 });
  await assert.rejects(parseAuthResponse(response), /账户服务返回异常/);
});
