# 与 clawbridge-platform 对接说明

## 1. 文档目标

本文档作为插件仓库的对外主入口，面向：

- 需要把业务系统接入 OpenClaw 的平台集成方
- 需要和 `clawbridge-platform` 联调的插件协同方

本文档收口以下内容：

- 平台与插件之间谁调用谁
- 需要提供哪些接口
- 每个接口的入参出参
- HMAC 签名如何做
- `Java` / `Python` 最小示例

协议正式口径仍以上游平台仓库为准：

1. [`generic-http protocol v1`](https://github.com/KittyMi/openclaw-http-bridge/blob/main/docs/02-protocol-v1.md)
2. [`security spec v1`](https://github.com/KittyMi/openclaw-http-bridge/blob/main/docs/06-security-spec.md)
3. [`session routing spec v1`](https://github.com/KittyMi/openclaw-http-bridge/blob/main/docs/08-session-routing-spec.md)
4. [`openapi-v1.yaml`](https://github.com/KittyMi/openclaw-http-bridge/blob/main/docs/openapi-v1.yaml)

## 2. 对接拓扑

```text
Third-party System
    -> POST /webhooks/inbound/messages
    -> POST /webhooks/inbound/events
clawbridge-platform
    -> GET /stream/inbound
openclaw-generic-http
    -> OpenClaw Core
openclaw-generic-http
    -> POST /outbound/messages
Third-party System
```

说明：

- 第三方系统把外部用户消息推给平台
- 插件主动从平台拉取入站事件
- OpenClaw 生成回复后，插件再把出站消息推回平台
- 平台负责最终投递到第三方系统或其业务接口

## 3. 对接职责划分

| 角色 | 需要实现/调用 | 说明 |
| --- | --- | --- |
| 第三方系统 | 调用 `POST /webhooks/inbound/messages`、`POST /webhooks/inbound/events` | 把外部入站消息和系统事件写入平台 |
| `clawbridge-platform` | 暴露完整协议端点 | 承接签名校验、幂等、路由、事件缓存、出站转发 |
| `openclaw-generic-http` | 调用 `GET /stream/inbound`、`POST /stream/acks`、`POST /outbound/messages`、`POST /probe`、`POST /resolve` | 负责插件侧 transport / mapping / callback |

如果你的场景是“业务系统如何接 OpenClaw”，通常只需要关心：

1. 如何把入站消息写到平台
2. 如何接收平台转发回来的出站消息
3. 如何按统一签名规范验签

## 4. 必备配置项

平台和插件至少要共享以下配置：

| 配置项 | 用途 |
| --- | --- |
| `baseUrl` | 平台协议地址，例如 `https://bridge.example.com` |
| `apiKey` | 请求身份标识，通过 `X-Api-Key` 传递 |
| `signingSecret` | HMAC-SHA256 签名密钥 |
| `accountId` | 接入账号标识，路由与权限边界的核心键 |

## 5. 通用请求头与签名

除非明确说明，协议请求都应带以下请求头：

```text
Content-Type: application/json
Accept: application/json
X-Generic-Http-Version: 1
X-Request-Id: <uuid>
X-Api-Key: <api-key>
X-Timestamp: <unix-epoch-seconds>
X-Nonce: <random-string>
X-Signature: <hmac-sha256-hex>
```

签名原文：

```text
METHOD + "\n" +
PATH + "\n" +
TIMESTAMP + "\n" +
NONCE + "\n" +
SHA256(rawBody)
```

关键约束：

- `PATH` 只取路径，不包含域名和 query
- `rawBody` 必须是原始请求体字节，不能重序列化后再签
- 空 body 使用空字节数组的 SHA-256
- 签名结果使用十六进制小写字符串
- 时间戳默认允许偏差窗口为 300 秒

## 6. 核心对象模型

### 6.1 Conversation

```json
{
  "conversationId": "room_123",
  "type": "dm",
  "title": "Alice"
}
```

字段约束：

- `conversationId` 必须是稳定 ID，不要用展示名
- `type` 取值：`dm` / `group` / `room` / `ticket`

### 6.2 Sender

```json
{
  "id": "user_123",
  "name": "alice",
  "type": "user"
}
```

字段约束：

- `sender.id` 在同一 `accountId` 下必须稳定且唯一
- `sender.name` 只做展示，不参与主路由

### 6.3 MessagePayload

```json
{
  "messageId": "msg_001",
  "text": "hello",
  "attachments": [],
  "replyToMessageId": null,
  "metadata": {}
}
```

### 6.4 路由主键

正式路由主键为：

- `accountId`
- `conversation.conversationId`
- `threadId`

规则：

- `threadId = null` 时，消息归到根会话
- `dm` 场景建议确保不同业务成员不会共用同一个 `conversationId`
- 非 `dm` 会话必须使用第三方系统中的真实稳定 ID

## 7. 平台暴露给插件/第三方的协议接口

## 7.1 `GET /health`

用途：

- 健康检查

成功响应：

```json
{
  "success": true,
  "status": "UP",
  "service": "clawbridge-platform",
  "version": "0.2.x",
  "timestamp": "2026-06-15T08:00:00Z"
}
```

## 7.2 `GET /capabilities`

用途：

- 返回平台支持的协议能力

成功响应：

```json
{
  "success": true,
  "capabilities": {
    "textInbound": true,
    "textOutbound": true,
    "attachments": true,
    "threading": true,
    "replies": true,
    "deliveryReceipt": false
  }
}
```

## 7.3 `POST /probe`

用途：

- 插件探测指定 `accountId` 是否可用

请求体：

```json
{
  "accountId": "default"
}
```

成功响应：

```json
{
  "success": true,
  "status": "UP",
  "accountId": "default",
  "checks": [
    {
      "name": "profile",
      "status": "PASS"
    },
    {
      "name": "outbound",
      "status": "PASS"
    }
  ]
}
```

## 7.4 `POST /resolve`

用途：

- 将名称、别名或业务标识解析为稳定 ID

请求体：

```json
{
  "accountId": "default",
  "kind": "sender",
  "query": "alice"
}
```

成功响应：

```json
{
  "success": true,
  "results": [
    {
      "id": "user_123",
      "name": "Alice Demo",
      "kind": "sender"
    }
  ]
}
```

约束：

- `kind` 取值：`conversation` / `sender`
- 无命中时返回空数组，不要伪造占位 ID

## 7.5 `POST /webhooks/inbound/messages`

用途：

- 第三方系统向平台推送入站消息

请求体：

```json
{
  "eventId": "evt_001",
  "eventType": "message.created",
  "accountId": "default",
  "conversation": {
    "conversationId": "default_user_123",
    "type": "dm",
    "title": "Alice"
  },
  "threadId": null,
  "sender": {
    "id": "user_123",
    "name": "alice",
    "type": "user"
  },
  "message": {
    "messageId": "msg_001",
    "text": "hello openclaw",
    "attachments": [],
    "replyToMessageId": null,
    "metadata": {}
  },
  "occurredAt": "2026-06-15T08:00:00Z",
  "idempotencyKey": "idem_001",
  "metadata": {
    "source": "crm"
  }
}
```

成功响应：`HTTP 202`

```json
{
  "success": true,
  "code": "ACCEPTED",
  "requestId": "req_001",
  "eventId": "evt_001",
  "deduplicated": false,
  "message": "accepted"
}
```

## 7.6 `POST /webhooks/inbound/events`

用途：

- 推送非消息事件，例如成员加入、会话关闭、运行时诊断事件

请求体结构：

- 与 `POST /webhooks/inbound/messages` 相同

## 7.7 `GET /stream/inbound`

用途：

- 插件主动拉取待消费的入站事件

查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `accountId` | 是 | 插件当前消费的账号 |
| `limit` | 否 | 单次最多拉取多少条，默认 `10` |
| `waitSeconds` | 否 | 无事件时最长等待秒数 |

请求示例：

```text
GET /stream/inbound?accountId=default&limit=10&waitSeconds=30
```

响应格式：

- `Content-Type: text/event-stream`
- 每条 SSE 事件形如：

```text
event: inbound
data: {"eventId":"evt_001","eventType":"inbound-message","accountId":"default", ...}
```

说明：

- 平台侧事件在 ack 前可能被重复拉到
- 插件必须把消费完成后的事件主动 ack

## 7.8 `POST /stream/acks`

用途：

- 插件确认已成功消费的平台入站事件

请求体：

```json
{
  "accountId": "default",
  "eventIds": [
    "evt_001",
    "evt_002"
  ]
}
```

成功响应：

```json
{
  "success": true,
  "accountId": "default",
  "ackedEventIds": [
    "evt_001",
    "evt_002"
  ]
}
```

## 7.9 `POST /outbound/messages`

用途：

- 插件把 OpenClaw 生成的回复投递回平台

请求体：

```json
{
  "requestId": "req_out_001",
  "accountId": "default",
  "conversation": {
    "conversationId": "default_user_123",
    "type": "dm",
    "title": "Alice"
  },
  "threadId": null,
  "message": {
    "messageId": "out_msg_001",
    "text": "hello from OpenClaw",
    "attachments": [],
    "replyToMessageId": "msg_001",
    "metadata": {}
  },
  "idempotencyKey": "idem_out_001"
}
```

成功响应：

```json
{
  "success": true,
  "code": "DELIVERED",
  "providerMessageId": "remote_888",
  "acceptedAt": "2026-06-15T08:01:00Z"
}
```

## 8. 最小错误响应

统一错误响应格式：

```json
{
  "success": false,
  "code": "INVALID_SIGNATURE",
  "message": "signature verification failed",
  "retryable": false
}
```

常见错误码：

| code | HTTP | 说明 |
| --- | --- | --- |
| `INVALID_REQUEST` | `400` | 请求结构或字段不合法 |
| `INVALID_SIGNATURE` | `401` | 签名不通过 |
| `TIMESTAMP_EXPIRED` | `401` | 时间戳超出窗口 |
| `NONCE_REPLAYED` | `409` | nonce 重放 |
| `ACCOUNT_NOT_FOUND` | `404` | `accountId` 无效 |
| `UPSTREAM_UNAVAILABLE` | `503` | 平台下游暂时不可达 |

## 9. Java 示例

## 9.1 Java 发送入站消息到平台

```java
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.ByteArrayOutputStream;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

public class GenericHttpInboundDemo {
    private static final ObjectMapper MAPPER = new ObjectMapper();

    public static void main(String[] args) throws Exception {
        String baseUrl = "http://127.0.0.1:18082";
        String apiKey = "local-dev-api-key";
        String signingSecret = "local-dev-signing-secret";
        String path = "/webhooks/inbound/messages";

        Map<String, Object> payload = new LinkedHashMap<String, Object>();
        payload.put("eventId", "evt_001");
        payload.put("eventType", "message.created");
        payload.put("accountId", "default");
        payload.put("threadId", null);
        payload.put("occurredAt", "2026-06-15T08:00:00Z");
        payload.put("idempotencyKey", "idem_001");

        Map<String, Object> conversation = new LinkedHashMap<String, Object>();
        conversation.put("conversationId", "default_user_123");
        conversation.put("type", "dm");
        conversation.put("title", "Alice");
        payload.put("conversation", conversation);

        Map<String, Object> sender = new LinkedHashMap<String, Object>();
        sender.put("id", "user_123");
        sender.put("name", "alice");
        sender.put("type", "user");
        payload.put("sender", sender);

        Map<String, Object> message = new LinkedHashMap<String, Object>();
        message.put("messageId", "msg_001");
        message.put("text", "hello openclaw");
        message.put("attachments", new Object[0]);
        payload.put("message", message);

        String body = MAPPER.writeValueAsString(payload);
        String timestamp = String.valueOf(Instant.now().getEpochSecond());
        String nonce = UUID.randomUUID().toString().replace("-", "");
        String signature = sign("POST", path, timestamp, nonce, body, signingSecret);

        HttpURLConnection connection = (HttpURLConnection) new URL(baseUrl + path).openConnection();
        connection.setRequestMethod("POST");
        connection.setDoOutput(true);
        connection.setRequestProperty("Content-Type", "application/json");
        connection.setRequestProperty("Accept", "application/json");
        connection.setRequestProperty("X-Generic-Http-Version", "1");
        connection.setRequestProperty("X-Request-Id", UUID.randomUUID().toString());
        connection.setRequestProperty("X-Api-Key", apiKey);
        connection.setRequestProperty("X-Timestamp", timestamp);
        connection.setRequestProperty("X-Nonce", nonce);
        connection.setRequestProperty("X-Signature", signature);

        try (OutputStream outputStream = connection.getOutputStream()) {
            outputStream.write(body.getBytes(StandardCharsets.UTF_8));
        }

        int status = connection.getResponseCode();
        InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
        System.out.println("status=" + status);
        System.out.println(readFully(stream));
    }

    private static String sign(
        String method,
        String path,
        String timestamp,
        String nonce,
        String body,
        String secret
    ) throws Exception {
        String canonical = method.toUpperCase() + "\n"
            + path + "\n"
            + timestamp + "\n"
            + nonce + "\n"
            + sha256Hex(body.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return toHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha256Hex(byte[] raw) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        return toHex(digest.digest(raw));
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }

    private static String readFully(InputStream inputStream) throws Exception {
        if (inputStream == null) {
            return "";
        }
        ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
        byte[] buffer = new byte[1024];
        int read;
        while ((read = inputStream.read(buffer)) >= 0) {
            outputStream.write(buffer, 0, read);
        }
        return new String(outputStream.toByteArray(), StandardCharsets.UTF_8);
    }
}
```

## 9.2 Java Spring Boot 接收插件回调的出站消息

```java
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.ResponseEntity;
import org.springframework.util.StreamUtils;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import javax.servlet.http.HttpServletRequest;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@RestController
public class OutboundMessageController {
    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final String API_KEY = "local-dev-api-key";
    private static final String SIGNING_SECRET = "local-dev-signing-secret";

    @PostMapping("/outbound/messages")
    public ResponseEntity<?> receiveOutbound(HttpServletRequest request) throws Exception {
        String rawBody = StreamUtils.copyToString(request.getInputStream(), StandardCharsets.UTF_8);
        verifySignedRequest(request, "/outbound/messages", rawBody);

        Map<?, ?> payload = MAPPER.readValue(rawBody, Map.class);
        Map<?, ?> conversation = (Map<?, ?>) payload.get("conversation");
        Map<?, ?> message = (Map<?, ?>) payload.get("message");

        String conversationId = String.valueOf(conversation.get("conversationId"));
        String text = String.valueOf(message.get("text"));

        System.out.println("deliver to conversation=" + conversationId + ", text=" + text);

        Map<String, Object> result = new LinkedHashMap<String, Object>();
        result.put("success", true);
        result.put("code", "DELIVERED");
        result.put("providerMessageId", "remote_888");
        result.put("acceptedAt", Instant.now().toString());
        return ResponseEntity.ok(result);
    }

    private static void verifySignedRequest(HttpServletRequest request, String path, String rawBody) throws Exception {
        String apiKey = request.getHeader("X-Api-Key");
        String timestamp = request.getHeader("X-Timestamp");
        String nonce = request.getHeader("X-Nonce");
        String signature = request.getHeader("X-Signature");
        if (!API_KEY.equals(apiKey)) {
            throw new IllegalStateException("invalid api key");
        }
        if (timestamp == null || nonce == null || signature == null) {
            throw new IllegalStateException("missing signature headers");
        }
        long now = Instant.now().getEpochSecond();
        long ts = Long.parseLong(timestamp);
        if (Math.abs(now - ts) > 300L) {
            throw new IllegalStateException("timestamp expired");
        }
        String expected = sign(request.getMethod(), path, timestamp, nonce, rawBody, SIGNING_SECRET);
        if (!expected.equals(signature.toLowerCase())) {
            throw new IllegalStateException("invalid signature");
        }
    }

    private static String sign(String method, String path, String timestamp, String nonce, String body, String secret)
        throws Exception {
        String canonical = method.toUpperCase() + "\n"
            + path + "\n"
            + timestamp + "\n"
            + nonce + "\n"
            + sha256Hex(body.getBytes(StandardCharsets.UTF_8));
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        return toHex(mac.doFinal(canonical.getBytes(StandardCharsets.UTF_8)));
    }

    private static String sha256Hex(byte[] raw) throws Exception {
        return toHex(MessageDigest.getInstance("SHA-256").digest(raw));
    }

    private static String toHex(byte[] bytes) {
        StringBuilder builder = new StringBuilder(bytes.length * 2);
        for (byte value : bytes) {
            builder.append(String.format("%02x", value));
        }
        return builder.toString();
    }
}
```

## 10. Python 示例

## 10.1 Python 发送入站消息到平台

```python
import hashlib
import hmac
import json
import time
import uuid

import requests


def sha256_hex(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sign(method: str, path: str, timestamp: str, nonce: str, body: bytes, secret: str) -> str:
    canonical = "\n".join(
        [
            method.upper(),
            path,
            timestamp,
            nonce,
            sha256_hex(body),
        ]
    )
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


base_url = "http://127.0.0.1:18082"
path = "/webhooks/inbound/messages"
api_key = "local-dev-api-key"
signing_secret = "local-dev-signing-secret"

payload = {
    "eventId": "evt_001",
    "eventType": "message.created",
    "accountId": "default",
    "conversation": {
        "conversationId": "default_user_123",
        "type": "dm",
        "title": "Alice",
    },
    "threadId": None,
    "sender": {
        "id": "user_123",
        "name": "alice",
        "type": "user",
    },
    "message": {
        "messageId": "msg_001",
        "text": "hello openclaw",
        "attachments": [],
    },
    "occurredAt": "2026-06-15T08:00:00Z",
    "idempotencyKey": "idem_001",
    "metadata": {"source": "crm"},
}

body = json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
timestamp = str(int(time.time()))
nonce = uuid.uuid4().hex
signature = sign("POST", path, timestamp, nonce, body, signing_secret)

headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Generic-Http-Version": "1",
    "X-Request-Id": str(uuid.uuid4()),
    "X-Api-Key": api_key,
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
}

response = requests.post(base_url + path, data=body, headers=headers, timeout=10)
print(response.status_code)
print(response.text)
```

## 10.2 Python FastAPI 接收 `POST /outbound/messages`

```python
import hashlib
import hmac
import time
from datetime import datetime, timezone

from fastapi import FastAPI, HTTPException, Request


app = FastAPI()
API_KEY = "local-dev-api-key"
SIGNING_SECRET = "local-dev-signing-secret"
ALLOWED_SKEW_SECONDS = 300


def sha256_hex(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def sign(method: str, path: str, timestamp: str, nonce: str, body: bytes, secret: str) -> str:
    canonical = "\n".join(
        [
            method.upper(),
            path,
            timestamp,
            nonce,
            sha256_hex(body),
        ]
    )
    return hmac.new(secret.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


@app.post("/outbound/messages")
async def outbound_messages(request: Request):
    raw_body = await request.body()
    api_key = request.headers.get("x-api-key")
    timestamp = request.headers.get("x-timestamp")
    nonce = request.headers.get("x-nonce")
    signature = request.headers.get("x-signature")

    if api_key != API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")
    if not timestamp or not nonce or not signature:
        raise HTTPException(status_code=401, detail="missing signature headers")

    now = int(time.time())
    if abs(now - int(timestamp)) > ALLOWED_SKEW_SECONDS:
        raise HTTPException(status_code=401, detail="timestamp expired")

    expected = sign(request.method, request.url.path, timestamp, nonce, raw_body, SIGNING_SECRET)
    if not hmac.compare_digest(expected, signature.lower()):
        raise HTTPException(status_code=401, detail="invalid signature")

    payload = await request.json()
    conversation = payload["conversation"]["conversationId"]
    text = payload["message"].get("text", "")

    print(f"deliver to {conversation}: {text}")

    return {
        "success": True,
        "code": "DELIVERED",
        "providerMessageId": "remote_888",
        "acceptedAt": datetime.now(timezone.utc).isoformat(),
    }
```

## 11. 联调顺序建议

建议按这个顺序联调：

1. 先打通 `GET /health`
2. 再确认签名成功与签名失败场景
3. 再验证 `POST /webhooks/inbound/messages` 返回 `202 ACCEPTED`
4. 再验证插件可以从 `GET /stream/inbound` 拉到事件
5. 再验证 `POST /stream/acks`
6. 最后验证 `POST /outbound/messages` 最终投递

## 12. 最小验收清单

- `accountId`、`conversationId`、`threadId` 路由规则已经固定
- `X-Api-Key` 与 `signingSecret` 在平台和调用方一致
- 签名基于原始 body 字节而不是重序列化 JSON
- 重试请求复用相同 `idempotencyKey`
- `threadId` 缺失时明确传 `null`
- 插件已经实现 stream 拉取后主动 ack
- 出站回调能返回统一 `DeliveryResult`

## 13. 相关文档

- [README.md](../README.md)
- [01-installation-guide.md](./01-installation-guide.md)
- [03-local-dev.md](./03-local-dev.md)
- [05-compatibility-matrix.md](./05-compatibility-matrix.md)
- [上游平台协议仓库](https://github.com/KittyMi/openclaw-http-bridge)
