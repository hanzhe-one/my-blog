---
title: '请求体只能读一次：AI 改写插件为什么只在真实流量上失败'
description: 'ShenYu 的 AI 请求改写插件把请求体读了两次，可重复订阅的 mock body 藏住了问题。看 WebFlux 里这条一次性的流，以及缓存加重放怎么把它接回来。'
publishDate: '2026-11-04'
tags:
  - Apache ShenYu
  - Java
  - WebFlux
  - 网关
  - 开源
---

作者本地跑的 20 条单测全绿，真实请求的第一笔改写就失败。

日志里是 `IllegalStateException`。签名逻辑没动过，配置也没问题，坏的是更基础的一件事：这个插件把同一个请求体读了两次。

[apache/shenyu#8265](https://github.com/apache/shenyu/pull/8265) 改的就是这里。它没有换框架，也没给 body 加锁，只是把「读一次、存下来、按需重放」这条线重新画直。

（这篇涉及 WebFlux。如果只学到 Servlet，可以把 `Flux` 理解成「分几次送到的异步数据」，跳过代码细节读现象和结论也成立。）

## 插件要做的事，本来就需要两次 body

`AiRequestTransformerPlugin` 让模型改写请求：把 method、path、headers、body 交给模型，模型回一段新的 HTTP 报文，插件照它重写请求再往下转发；模型失败时要原样放行。

于是 body 在三个地方出现：

1. 组装 prompt 时，`assembleMessage()` 订阅 `request.getBody()`，把字节读成字符串拼进模型输入。
2. 模型返回后，`rewriteRequestBody` 通过 `ServerRequest.bodyToMono(String.class)` 又读一次**原始** body，用来生成替换后的请求体。
3. 模型失败时，回退逻辑把原 exchange 直接交给下游，下游再读一次。

前两处是代码显式要求的，第三处是被动踩到。它们都建立在同一个前提上：body 可以随便读。这个前提在 mock 里成立，在 Netty 上不成立。

## 第二次订阅，为什么会失败

`ServerHttpRequest.getBody()` 的返回值声明是 `Flux<DataBuffer>`，接口本身没有承诺「只能读一次」。一次性是当前实现的行为：Spring 把它接到 reactor-netty 的 `HttpServerRequest.receive()`，下面这层 `FluxReceive` 只认第一个订阅者。

这里的「失败」指读不到数据，不一定抛异常——下面会看到，最麻烦的那条路恰恰什么错都不报。

```java
final void startReceiver(CoreSubscriber<? super Object> s) {
    if (!subscribedOnce) {
        subscribedOnce = true;
        // 第一次订阅：正常接管
        receiver = s;
        s.onSubscribe(this);
    } else {
        if (inboundDone && getPending() == 0) {
            // 数据已经收完、也发完了：静默完成，什么都不发
            Operators.complete(s);
        } else {
            // 还有数据没发完：直接拒绝
            String msg = "Rejecting additional inbound receiver. State=" + toString(false);
            Operators.error(s, new IllegalStateException(msg));
        }
    }
}
```

（片段做了简化：真实方法里还有 `isCancelled()`、`inboundError` 两个兜底分支，以及 event-loop 调度；逻辑主干就是这两条。）

第二个订阅者会走到 `else` 分支，然后分成两条路：数据早已收完、队列为空时，它拿到的是一个**空的完成信号**，不报错；数据还在传输中时，它拿到 `IllegalStateException: Rejecting additional inbound receiver`。

这里要分清两个不一样的东西：

| 这时订阅，会拿到什么 | 结果 | 含义 |
| --- | --- | --- |
| 请求本来就没有 body（GET、无体 POST） | 空流，正常完成 | 合法，body 确实为空 |
| body 已经被别人读完 | 空流，正常完成 | 假象：字节存在过，只是拿不回来了 |
| body 还在发，被别人抢先订阅 | `IllegalStateException` | 明确报错 |

中间那一行最容易误判。如果第二次订阅落在这条分支上，旧代码的 `bodyToMono(String.class)` 拿到的是空，跟着 `switchIfEmpty(Mono.just(""))` 把它兜成空字符串，改写逻辑就会拿一个空 body 去拼报文。这类静默为空比抛异常更难查，日志里什么都看不到。

还有一种情况也落在这张表里：如果链上游的别的插件先读过 body，本插件的第一次订阅落到 `inboundDone` 那一支，同样是空流。没有异常，也没有数据。

单元测试没发现，是因为 `MockServerHttpRequest.post("/test").body("{}")` 里那串字符被构造成了一个可以反复订阅的 Flux：订阅几次，就重新发几次同样的字节。替身比真实世界宽容，绿色对勾于是把问题留给了线上。

修复之后，下游拿到的 body 来自缓存的 `byte[]`，空就只可能是真空，不会再出现「看起来是空、其实是读过」的情况。

顺带纠正一个说法。issue 里记录的异常文案是 `request body already consumed`，我在 ShenYu 和 reactor-netty 的源码里都搜过：仓库里这句话只出现在测试的模拟异常中，框架本身抛的是 `Rejecting additional inbound receiver`。所以那句日志更可能是报告者的转述，不是真实抛出的文本。至于生产环境当时走的是「静默空流」还是「抛异常」，我没有起服务复现，仍属未验证。

## 修复的第一步：把流读成字节，只读一次

新的入口不再让各段代码各自订阅，而是先读一次，再围绕这份字节做事：

```java
private static Mono<byte[]> readRequestBody(final Flux<DataBuffer> body) {
    return DataBufferUtils.join(body, MAX_REQUEST_BODY_SIZE_BYTES)
            .map(dataBuffer -> {
                try {
                    byte[] bytes = new byte[dataBuffer.readableByteCount()];
                    dataBuffer.read(bytes);
                    return bytes;
                } finally {
                    DataBufferUtils.release(dataBuffer);
                }
            })
            .defaultIfEmpty(new byte[0]);
}
```

`join` 把分片拼成一个 `DataBuffer`，等于把这条流读干，全流程只有这一次订阅。`release` 必须写：入站 buffer 来自池化分配，引用计数归零才回到池子，`finally` 保证拷贝抛异常也不会漏。`defaultIfEmpty` 处理无体请求，让后面的重放能表达「这里什么都没有」。

## 第二步：用装饰器把字节还给下游

拿到 `byte[]` 之后，给请求包一层：

```java
private static ServerHttpRequest bodyRequest(final ServerWebExchange exchange,
                                             final byte[] body,
                                             final boolean chunked) {
    ServerHttpRequest request = exchange.getRequest();
    DataBufferFactory bufferFactory = exchange.getResponse().bufferFactory();
    return new ServerHttpRequestDecorator(request) {
        @Override
        public Flux<DataBuffer> getBody() {
            return body.length == 0
                    ? Flux.empty()
                    : Flux.defer(() -> Flux.just(bufferFactory.wrap(body)));
        }

        @Override
        public HttpHeaders getHeaders() {
            return chunked ? ResponseUtils.chunkedHeader(request.getHeaders()) : request.getHeaders();
        }
    };
}
```

`ServerHttpRequestDecorator` 是 Spring 提供的包装类，原请求对象不动，只覆盖需要改的方法。这里覆盖 `getBody()`，让它每次被订阅时都从缓存的 `byte[]` 重新产出一个 `DataBuffer`。

`Flux.defer` 在这里不是装饰：`wrap` 出来的 `DataBuffer` 带读写位置，第二次读会从第一次读过的地方继续。写成 `Flux.just(wrap(body))`，两个订阅者拿到同一个对象；写成 `defer`，包装动作发生在每次订阅时，两个订阅者各拿一个视图，底层的 `byte[]` 只读共享。`wrap` 本身不拷贝字节，只是用 `Unpooled.wrappedBuffer` 把数组包起来。

于是模型那一路和回退那一路各自订阅读一次，互不影响，而原始入站流从头到尾只被消费一次。

## 换了 body，长度头就不作数了

模型生成的 body 和原来长度不同，旧的 `Content-Length` 不再是事实。`chunkedHeader` 把它删掉，换成 `Transfer-Encoding: chunked`：

```java
httpHeaders.remove(HttpHeaders.CONTENT_LENGTH);
httpHeaders.set(HttpHeaders.TRANSFER_ENCODING, CHUNKED);
```

`bodyRequest` 的 `chunked` 参数就是分叉点：改写成功传 `true`，回退透传传 `false`（字节没变，头也不该变）。

这行头是 HTTP/1.1 的表达方式。RFC 9113 §8.2.2 规定，HTTP/2 消息里不允许出现 `Transfer-Encoding` 这类连接级头字段，中间设备从 HTTP/1.x 转 HTTP/2 时必须摘掉它们。所以如果上游是 HTTP/2，ShenYu 下游的客户端要么替你删掉这个头，要么把它当成畸形请求——具体走哪条，取决于客户端实现，我没有验证，这里按待确认看待。

## 回退为什么必须提前决定

```java
.onErrorResume(throwable -> {
    LOG.error("AI request transformation failed, proceeding without AI transformation", throwable);
    return Mono.just(replayExchange);
})
.flatMap(chain::execute);
```

`onErrorResume` 在 `chain.execute` 之前，回退对象是 body 完整的 `replayExchange`。原因是 ShenYu 的链里有一个游标：

```java
private int index;

public Mono<Void> execute(final ServerWebExchange exchange) {
    return Mono.defer(() -> {
        if (this.index < plugins.size()) {
            ShenyuPlugin plugin = plugins.get(this.index++);
```

`index++` 每进一层前进一格，重入 `execute` 拿到的是下一个插件，不是从头再来。所以「失败后再放行一次原请求」不能靠重新调用链，只能靠进链之前准备好的 exchange。

`ShenyuPluginChain` 还有一个 `fork()`，能造出一条从头开始的链（agent-gateway 处理内部工具调用时用它）。但 fork 只重置游标，换不回已经被读走的 body——链可以重来，字节不能。

Servlet 那边常被写成「`filterChain.doFilter()` 只能调一次」，这话要打折：规范只说链应当被调用一次，二次调用会发生什么并没有定义，各家容器不必一致。能确定的是，把「重来」寄托在链上不靠谱。

## 5 MiB 的两道线，和一个没接住的口子

整个 body 读进内存有代价，所以先看声明长度：

```java
long declaredSize = exchange.getRequest().getHeaders().getContentLength();
if (declaredSize > MAX_REQUEST_BODY_SIZE_BYTES) {
    LOG.warn("AI request transformer skipped: the request body of {} bytes exceeds the {} byte limit", declaredSize);
    return chain.execute(exchange);
}
```

超过 5 MiB 直接透传，不缓冲、不订阅、不改写。`join` 的第二个参数是第二道防线，真的读超了会在拼接处抛 `DataBufferLimitException`。

这道防线有个没接住的地方。chunked 编码的请求没有 `Content-Length`，`getContentLength()` 返回 `-1`，判断会放行；如果实际字节确实超过 5 MiB，异常发生在 `readRequestBody` 上，而它位于 `transform()` 之外——那个接住模型失败的 `onErrorResume` 覆盖不到这里。异常最终落到 ShenYu 的 `GlobalErrorHandler`，未分类异常一律 500，顺带发一条告警。

也就是说，声明长度未知且实际超限的请求会得到 500，而不是被原样转发。这是「先信任声明」的代价，代码现在就是这个行为，注释里没写。另外 5 MiB 是写死的常量，没有走配置；同一仓库的响应改写插件用的是 1 MiB 的独立上限。

## 测试怎么让问题重演

新增用例自己造了一条一次性 body：

```java
AtomicInteger subscriptions = new AtomicInteger();
Flux<DataBuffer> oneShotBody = Flux.defer(() -> subscriptions.getAndIncrement() == 0
        ? Flux.just(new DefaultDataBufferFactory().wrap(original.getBytes(StandardCharsets.UTF_8)))
        : Flux.error(new IllegalStateException("request body already consumed")));
```

第一次订阅发字节，第二次报错，替身终于和 Netty 一样小气。然后断言两件事：下游读到的是改写后的 body（模型失败时是原 body），以及 `subscriptions` 等于 1。

参数化跑模型成功和失败两条出口——修复前它们撞的是同一个异常，却是两条完全不同的路径——另外补了空 body、form 表单、按声明超限几类。这些用例守的不是覆盖率，而是「body 只被订阅一次」这条约束：谁再加一次 `join`，测试会先红。

## 同一个仓库里的另一种解法

`AiResponseTransformerPlugin` 要的东西差不多：链下游转发完之后，它还要拿请求体去拼提示词。它没有先读再重放，而是旁路记一份：

```java
public Flux<DataBuffer> getBody() {
    if (!captureEnabled) {
        return super.getBody();
    }
    return super.getBody().doOnNext(this::record);
}
```

`record` 用 `dataBuffer.toByteBuffer(readPosition, len)` 拷一份，不动读位置，下游照常消费；快照上限 1 MiB，压缩请求、二进制、声明超限的 body 一律不记。

两种解法的时序不同：改写要在发送之前拿到完整 body，所以必须「先读再重放」；日志式的旁路只需要「下游读的时候顺手抄一份」，所以可以 tee。选错时序，问题就长成这次的样子。

## 学 Java Web 时先记住这一点

`@RequestBody` 背后是 `HttpMessageConverter` 从 `request.getInputStream()` 读字节。任何在它之前读流的过滤器（验签、请求日志、灰度打标），都会让 Controller 拿到一个已经到末尾的流。

`ContentCachingRequestWrapper` 经常被当成解药，但它只做一半。它把读过的字节 tee 到缓存里，供**链之后**的代码调 `getContentAsByteArray()`；`getInputStream()` 还是那条只能用一次的流。官方 javadoc 写得很直白：只缓存被读取的内容，不主动读，也不重放。

真要重放得自己写：一个 `HttpServletRequestWrapper`，构造时把 body 读完存成 `byte[]`，覆盖 `getInputStream()` 和 `getReader()` 返回基于这份字节的新流。WebFlux 这边 `ServerHttpRequestDecorator` 干的是同一件事，只是换成 `Flux<DataBuffer>`。

## 读完可以带走什么

请求体在传输层是一条流，任何「再读一次」的代码都得先回答：字节从哪来。缓存重放、旁路 tee，是同一问题的两种答案，选哪个取决于谁先读、谁后读。

链的游标和一次性的 body 是两件事，修好一个不等于修好另一个。

## 按现在的进度，哪些要先看

| 知识点 | 建议 |
| --- | --- |
| 请求体只能消费一次 | 现在就搞懂，后面所有「读到空 body」的问题都从这一条出发 |
| 过滤器/拦截器先读 body，Controller 拿到空 | 学 Java Web 就该练，做项目时天天遇到 |
| 缓存 + 重放 | 知道思路和代价就够，不用背实现 |
| 装饰器（`HttpServletRequestWrapper`） | Servlet 版要会写，这是最常用的一个 |
| `Flux` / `Mono` / `DataBuffer` | 能读懂「发布者」「订阅」两个词即可，细节留到学 WebFlux |
| Netty 引用计数、HTTP/2 头规则 | 先知道有这回事，不展开 |

前三行是写业务代码的刚需，后三行先做到「读到能认出来」。

## 没能证明的事

这篇的结论来自读源码，没有把 ShenYu 跑起来复现：异常文案的来源我查清了（仓库里只有测试模拟过它），但线上当时走的是静默空流还是抛异常，没法确认；上游走 HTTP/2 时 `Transfer-Encoding` 由谁删、会不会被判为畸形请求，取决于客户端实现，没有验证；改写只覆盖 JSON 和 form-urlencoded，其他 content type 原样透传，这类请求的 body 如何被读取，文章没有讨论。
