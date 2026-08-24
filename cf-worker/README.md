# 托管代理：让访客不用填自己的 API Key

这个 Worker 挡在浏览器和火山方舟之间：你的真实 API Key 只作为 Cloudflare 的 secret 存在服务端，
永远不会出现在浏览器里、也不会进 git 历史。访客打开网站直接就能聊天。

## 部署步骤

需要一个 Cloudflare 账号（免费）。

```bash
# 1. 安装 wrangler（Cloudflare 的部署工具）
npm install -g wrangler

# 2. 登录
wrangler login

# 3. 进入这个目录
cd cf-worker

# 4. 创建一个 KV 命名空间，用来做限流计数
wrangler kv namespace create RATE_LIMIT
# 命令会输出一个 id，把它填进 wrangler.toml 里 kv_namespaces 那一行的 id = "..."

# 5. 设置两个 secret（不会写进任何文件，只存在 Cloudflare 后台）
wrangler secret put ARK_API_KEY
# 粘贴你的火山方舟真实 API Key，回车

wrangler secret put APP_TOKEN
# 随便填一串你自己定的随机字符串，比如用 `openssl rand -hex 16` 生成一个
# 这个值稍后要原样填进 index.html 的 HOSTED_APP_TOKEN 常量里

# 6. 编辑 worker.js 顶部三个常量：
#    ALLOWED_ORIGIN  -> 你的 GitHub Pages 地址，例如 "https://jing0712.github.io"
#    DEFAULT_MODEL   -> 你的火山方舟推理接入点 ID
#    RATE_LIMIT_PER_HOUR -> 每个访客每小时最多几次请求，按你的预算调

# 7. 部署
wrangler deploy
```

部署成功后会打印一个网址，形如：
`https://xiaomeng-ai-proxy.<你的账号>.workers.dev`

## 接下来在 index.html 里填两个常量

搜索 `HOSTED_PROXY_URL`，填成上一步拿到的网址 + `/chat`（比如
`https://xiaomeng-ai-proxy.你的账号.workers.dev/chat`），
`HOSTED_APP_TOKEN` 填成第 5 步你自己设的那串随机字符串。

## 关于费用和滥用

- Cloudflare Workers 免费额度每天 10 万次请求，配额本身不太可能是瓶颈。
- 真正要控制的是火山方舟那边的账单：worker.js 里已经做了「每个访客 IP 每小时最多
  `RATE_LIMIT_PER_HOUR` 次请求」的限制，但这只能防止单个访客无限刷，防不住很多人一起用。
- **强烈建议**去火山方舟控制台给这个 API Key 设置消费上限/用量告警，这才是真正兜底的地方，
  代码层面的限流只是第一道防线。
- 如果发现被滥用，直接在 Cloudflare 后台把这个 Worker 停用或改 `APP_TOKEN`，不需要动火山方舟的 Key。

## 想同时保留"用户自己填 Key"的选项吗？

已经保留了。index.html 里如果用户在设置里自己填了 API Key，会优先用用户自己的 Key 直连火山方舟，
跟以前一样；只有当用户什么都没填、且这两个 HOSTED_* 常量非空时，才会自动走这个代理。
