---
"@shazhou/proman": patch
---

fix: defaultSpawn 改用 stdio: "pipe" 捕获子进程输出

`defaultSpawn` 之前用 `stdio: "inherit"`，导致 `result.stdout/stderr` 为 `null`，
`runOrThrow` 构建的 Error message 为空字符串，`isAlreadyPublished` 正则匹不上，
已发布的包无法被正确跳过。

改为 `stdio: "pipe"` 捕获输出并转发到终端，确保错误信息完整传递。

Closes #72
