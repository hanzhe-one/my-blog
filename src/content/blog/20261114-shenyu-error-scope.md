---
title: '一个 onErrorResume 吞了下游的异常'
description: 'ShenYu 的 AI 改写插件用一个 onErrorResume 同时接住模型失败和下游失败，真正的错误被记成「改写失败」，请求还被再送进链一次。'
publishDate: '2026-11-14'
tags:
  - Apache ShenYu
  - Java
  - 网关
  - 异常处理
  - 开源
---

下游明明返回了 500，网关日志里写的却是「AI request transformation failed」——而模型调用是成功的。

这种错位在网关里不罕见：不是某个功能算错了，是**错误处理的范围画大了**，一件事的失败被算到了另一件事头上。[apache/shenyu#8264](https://github.com/apache/shenyu/pull/8264) 修的就是这一行位置问题。

## 修复前的写法

```java
return aiRequestTransformerTemplate.assembleMessage()
        .flatMap(message -> finalClient.prompt().user(message).stream().content()
                .filter(Objects::nonNull)
                .collect(StringBuilder::new, StringBuilder::append)
                .map(StringBuilder::toString)
                .flatMap(aiResponse -> convertHeader(exchange, aiResponse)
                        .flatMap(sw -> convertBody(sw, messageReaders, aiResponse))
                        .flatMap(sw -> rewriteRequestPath(sw, aiResponse))
                        .flatMap(chain::execute)))          // 下游在这里执行
        .onErrorResume(throwable -> {
            LOG.error("AI request transformation failed, proceeding without AI transformation", throwable);
            return chain.execute(exchange);                 // 下游又在这里执行一次
        });
```

`.onErrorResume(...)` 挂在整条流水线的末尾，它接住的是**它上面所有东西**的异常，包括最后那个 `chain.execute`。

## 这个作用域里其实有三件事

1. 组装 prompt：模板渲染、JSON 解析，失败说明输入有问题；
2. 调用模型：超时、限流、返回格式不对，失败说明 AI 那侧有问题；
3. **执行下游插件链**：这才是真正的业务转发。

前两件失败了，插件的策略是「不带 AI 改写继续走」，这个设计没问题——网关不能让模型故障把业务拦住。问题是第三件也被塞进了同一个恢复块，于是下游的失败会被当成「AI 改写失败」来处理：

- 日志写成 `AI request transformation failed`，排查的人第一反应会去看模型配置和 baseUrl；
- 恢复时传的是**原始** `exchange`，已经算出来的改写结果被丢掉；
- 还要把请求再送进链一次。

最后一条最要命。

## 第二次进链，不是「重来」

上一篇文章里提过，ShenYu 的链有一个游标：

```java
private static class DefaultShenyuPluginChain implements ShenyuPluginChain {
    private int index;

    public Mono<Void> execute(final ServerWebExchange exchange) {
        return Mono.defer(() -> {
            if (this.index < plugins.size()) {
                ShenyuPlugin plugin = plugins.get(this.index++);
                ...
```

`index++` 每进一层前进一格，重入 `execute` 拿到的是下一个插件。所以第二次调用 `chain.execute(exchange)` 得到的不是「从头再跑一遍」，而是「从当前游标继续」。具体有三种后果，取决于链跑到哪了：

- 链上后面还有插件：那些插件被跳过，前面已执行的插件也不会重跑，副作用（计数、限流、鉴权记录）出现一次或零次，取决于位置；
- 链已经走到末尾：`return Mono.empty()`，这次的「恢复」以空完成收场——下游那个真实错误就被吞掉了；
- 下游本身有副作用：重复执行的部分会第二次生效。

PR 里的回归测试抓的正是第二种：旧实现下断言结果是 `expected: onError(); actual: onComplete()`——异常没了，请求「成功」了。对一个网关来说，这是最难查的一类故障：上游看到 500，网关日志说模型坏了，客户端拿到 200 或空响应。

## 修法：把链挪出恢复范围

```java
return aiRequestTransformerTemplate.assembleMessage()
        .flatMap(message -> finalClient.prompt().user(message).stream().content()
                .filter(Objects::nonNull)
                .collect(StringBuilder::new, StringBuilder::append)
                .map(StringBuilder::toString)
                .flatMap(aiResponse -> convertHeader(exchange, aiResponse)
                        .flatMap(sw -> convertBody(sw, messageReaders, aiResponse))
                        .flatMap(sw -> rewriteRequestPath(sw, aiResponse))))   // 到这里为止
        .onErrorResume(throwable -> {
            LOG.error("AI request transformation failed, proceeding without AI transformation", throwable);
            return Mono.just(exchange);
        })
        .flatMap(chain::execute);                                               // 只执行一次
```

改动就两处：把 `chain::execute` 从内层挪到 `onErrorResume` 之后；恢复块不再自己调链，只返回「要交给下游的那个对象」。

这样成功和失败两条路都恰好进链一次，而且下游的异常不在恢复范围里，会原样往上抛。往上抛之后落到 `GlobalErrorHandler`，变成 500 和一条告警——这才是下游失败应该有的样子。

（后来 #8265 改这片代码时，恢复块返回的对象换成了带重放 body 的 `replayExchange`，位置和结构没变。）

## 测试怎么证明「只进一次」

三条用例，各自守一个点：

```java
AtomicInteger cursor = new AtomicInteger();
ShenyuPluginChain advancingChain = ignored -> Mono.defer(() -> cursor.getAndIncrement() == 0
        ? Mono.error(downstreamFailure) : Mono.empty());
```

用一个「会前进」的链代替普通 mock：第一次执行失败，第二次变成空完成——这正是真实游标的行为。断言两件事：异常对象是原来那个实例（没被换成别的），`cursor` 等于 1（没有被执行第二次）。

第二条用一个带订阅计数的 publisher，断言 `subscriptions` 等于 1，从另一个角度证明没有被重复订阅。

第三条是反向的：模型失败时，`verify(chain).execute(exchange)` 恰好一次，确认「不带 AI 继续走」这条正常路径没被改坏。

判断这些测试有没有用，看它们在旧代码上的结果：PR 里写了，两条回归用例在旧实现上分别报 `expected: onError(); actual: onComplete()` 和 2 次订阅。能红的测试才是测试。

## 一条能搬走的规则

**错误处理的作用域要等于「谁的失败」。** 你 catch 住哪一段，就只该对那一段负责；超出这一段的东西让它自己冒泡，别替它决定结局。

写 `try/catch` 时也是一样。包得越大，越容易把别人的异常变成自己的「正常返回」。

## JavaWeb 里同样的坑

这段知识在你写业务代码时天天遇到，只是规模小一点：

```java
try {
    filterChain.doFilter(request, response);
} catch (Exception e) {
    log.error("filter error", e);     // 下游炸了，这里吞掉，容器以为请求成功
}
```

过滤器里这样写，下游服务的 500 会变成 200 的空响应。`@ControllerAdvice` 里 `catch (Exception e)` 然后返回一个空对象，效果一样。

降级、默认值、兜底这些动作，只该包住自己那一步（比如「模型调用失败就跳过改写」），不该包住调用方和被调用方的执行。

## 读完可以带走什么

上一篇讲回退的**时机**（必须在进链之前）和**对象**（必须是带重放 body 的那个 exchange），这一篇讲**范围**（只包住自己的失败）。三件事里缺任何一个，都会出现「日志和现场对不上」的问题。

一个方法里如果既有「准备数据」又有「把请求交出去」，这两段就该有不同的错误处理位置。

## 没能证明的事

这篇的结论来自读源码，没有把 ShenYu 跑起来复现：旧实现下第二次进链的具体表现取自 PR 的回归记录，不是我自己跑出来的；「三种后果」是按游标逻辑推的，每次实际命中哪一种，取决于链上插件的数量和副作用。
