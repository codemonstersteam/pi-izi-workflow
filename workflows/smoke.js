log("smoke: start");
const res = await shell("echo hello-from-shell");
const say = await agent("Reply with exactly the word: PONG. Nothing else.", { label: "ping" });
return { exitCode: res.exitCode, stdout: res.stdout.trim(), say: String(say).trim() };
