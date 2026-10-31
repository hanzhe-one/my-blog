---
title: '最少活跃请求，怎么变成了累计请求？'
description: 'Apache ShenYu 的 leastActive 曾把选择次数当成活跃请求。两次修复把计数接回 HTTP、Dubbo 和 WebSocket 的真实生命周期，也说明了为什么选中节点不等于请求正在执行。'
publishDate: '2026-10-31'
tags:
  - Apache ShenYu
  - Java
  - 负载均衡
  - 异步
  - 开源
---

先在两个节点之间选择 100 次，再加入一个新节点。接下来的 50 次选择，全部落到新节点上。

如果使用的是轮询，这个结果很奇怪；如果使用的是「最少活跃请求」，还需要多问一句：这里的「活跃」，究竟统计了什么？

Apache ShenYu 的旧 `leastActive` 实现统计的是节点被选中的累计次数，而不是正在处理的请求数。新节点没有历史记录，于是算法不断让它补齐过去的次数。已经完成的请求，也在影响下一次选择。

这篇复盘对应两条已合并的修复：[apache/shenyu#7986](https://github.com/apache/shenyu/pull/7986) 纠正指标并接上 HTTP 请求及 failover 的生命周期；[apache/shenyu#8043](https://github.com/apache/shenyu/pull/8043) 继续补齐 Dubbo 和 WebSocket。两条 PR 解决的是同一个问题的两层：**先让算法读对指标，再让各协议把指标维护对。**

## 新节点为什么要补历史次数

旧算法在 `LeastActiveLoadBalance` 内维护一张计数表。选择时读取节点对应的 `ActiveCount`，找出最小值，再对被选中的节点调用 `increase()`。

这里有两个关键细节：

- 计数器从 `Long.MIN_VALUE` 开始，而不是从零开始。
- `increase()` 只加一，没有在请求结束时减一的路径。

负数本身并不是根因。即使把初始值改成零，只要计数仍然只增不减，算法比较的还是历史选择次数。

`testNewlyAddedUpstreamIsNotFlooded` 固定了这个场景：先在 a、b 两个节点之间选择 100 次，再加入同权重的 c，继续选择 50 次。a、b 的计数已经被抬高，c 却从初始值开始；旧算法会把后面的 50 次全部交给 c。

这不是在判断 c 当前有多少工作，而是在让它追赶两个老节点的历史记录。如果 c 已经接住了几个耗时很长的请求，旧计数也无法表达「这些请求还没结束」。

修复后的测试要求 c 的命中次数满足：

```text
0 < newNodeHits < 50
```

这个断言保护的是「新节点可以接到请求，但不能连续吞下全部请求」，不是精确保证三个节点各分到三分之一。随机选择的测试不能被解读成严格均分的承诺。

## 最少，应该比较还没结束的工作

新算法不再维护自己的累计计数表，而是读取各 `Upstream` 对象上的状态：

```java
upstream.getInflight().get()
```

`inflight` 表示已经进入执行、尚未结束的工作。它与累计次数的区别可以写成：

```text
当前活跃数 = 统一基线 + 已开始但尚未结束的请求数
```

这里特意保留了「基线」：这两条 PR 中，`Upstream` 的默认 inflight 是 **1，不是 0**。所以一个请求开始时从 1 变成 2，结束后回到 1。所有候选节点基线一致时，不影响大小比较；但读测试时不能把回到 1 误判成泄漏。

选择分两步。先找 inflight 最小的节点集合；如果只有一个，直接返回。如果多个节点并列，再按 `getWeight(upstream)` 得到的有效权重选择，其中包含 warmup 的影响。有效权重相同等情况下，则在并列集合里随机选择。

这意味着「最少活跃」和「按权重」不是互相替代的两种判断：**活跃数先缩小候选范围，权重再打破平局。** 刚启动的节点即使与老节点一样空闲，也不必立刻承担同等流量。

`testCumulativeSelectionsDoNotMaskOutstandingWork` 把指标差异写成了另一条证据：先执行一段历史选择，再把 busy 节点的 inflight 设为 2，随后 20 次选择都应落到 idle 节点。历史选过多少次不再重要，当前还有多少工作才重要。

## 选中节点，不等于请求已经开始

把选择器里的 `increase()` 换成对 inflight 加一，仍然不够。选择器只知道「选中了谁」，不知道后面的工作是否真的执行、何时结束。

修复因此让选择器只读计数，把维护计数的责任交给执行路径。`testInflightCountIsReadNotReserved` 明确检查这一点：两个节点的计数设为 3、1，完成选择后仍然是 3、1。选择本身不占用活跃名额。

HTTP 路径中，`DividePlugin.forwardSelected()` 在 `leastActive` 分支增加计数；响应 Mono 则在 `forwardWithCircuitBreaker()` 中通过终止钩子释放：

```java
.doFinally(signalType -> upstream.getInflight().decrementAndGet())
```

这行代码保护的不只是正常完成。响应出错、调用方取消订阅，同样要释放，否则一次失败就会给节点留下永久的「繁忙」记录。

failover 也有独立的执行过程。`DefaultRetryStrategy.resend()` 为重新发送的尝试增加计数，再通过它自己的 `doFinally` 释放。不能只给第一次请求计数，却让后续尝试在算法眼里消失。

到这里，选择器和执行路径的职责分开了：前者根据状态做选择，后者为实际发生的工作维护状态。但 HTTP 的结束信号，并不能直接套到所有协议上。

## 返回一个对象，不等于工作已经结束

后续 PR 最值得展开的地方，是 Dubbo 和 WebSocket 各自对「结束」的定义。

### Dubbo：调用返回后，RPC 可能还在等待

Dubbo 选择的是 `Invoker`。拿到这个对象，不代表已经发起 RPC；调用 `invoke()` 返回一个 `Result`，也不代表异步结果已经完成。

`InflightInvoker` 因此在真正进入 `invoke()` 时增加计数，在结果完成回调中释放。如果委托调用同步抛出异常，也要走释放路径。

下面是核心流程的原文节选，省略了空结果分支：

```java
upstream.getInflight().incrementAndGet();
AtomicBoolean released = new AtomicBoolean();
Result result;
try {
    result = delegate.invoke(invocation);
} catch (RuntimeException e) {
    release(released);
    throw e;
}
return result.whenCompleteWithContext((response, throwable) -> release(released));
```

`release()` 通过 `compareAndSet(false, true)` 保证一次调用只减一次。更容易忽略的是这个标志的位置：它创建在 **`invoke()` 内部**，不是包装器的字段上。

同一个包装器可以处理多次调用。如果把释放标志绑定到包装器，第一次调用释放后，第二次调用也会看见「已经释放」，它增加的计数就再也减不回去。保护的是一次调用，标志也必须属于一次调用。

### WebSocket：握手结束后，会话才刚开始

WebSocket 的握手请求结束，不等于连接上的工作结束。若把减计数挂在握手 Mono 上，一条仍在传输消息的连接就会被算成空闲。

修复包装的是处理真实会话的 `WebSocketHandler`。其核心流程如下，同样省略了空返回值分支：

```java
return Mono.defer(() -> {
    upstream.getInflight().incrementAndGet();
    Mono<Void> proxied;
    try {
        proxied = delegate.handle(session);
    } catch (RuntimeException e) {
        upstream.getInflight().decrementAndGet();
        throw e;
    }
    return proxied.doFinally(signalType -> upstream.getInflight().decrementAndGet());
});
```

`Mono.defer` 把开始计数推迟到订阅时。仅仅构造出一个尚未订阅的会话 Mono，不会让节点变忙；会话处理结束或被取消时，才把计数还回去。

Dubbo 等的是异步调用结果，WebSocket 等的是会话处理结束。它们都在「开始加一、结束减一」，但这个对称关系必须建立在各自真实的生命周期上，不能只找一个看起来方便的回调。

## 测试为什么要把请求卡在半途

只检查「最终计数回到基线」，不能证明中间统计正确。一段完全没加过计数的代码，也可能满足这个断言。

这些回归测试有意让工作暂时不结束，再观察计数：

| 测试                                                                     | 怎样保留未完成状态                           | 关键观察                                     |
| ------------------------------------------------------------------------ | -------------------------------------------- | -------------------------------------------- |
| `DividePluginTest.leastActiveInflightShouldBeReleasedOnCancellation`     | 响应使用 `Mono.never()`                      | 初始 2，订阅后 3，取消后回到 2               |
| `ApacheDubboGrayLoadBalanceTest.leastActiveShouldCountTheRpcWhileItRuns` | 保留未完成的 `CompletableFuture`             | 等待期间基线加一，完成后回到基线             |
| `WebSocketPluginTest.leastActiveShouldCountTheSessionAndNotTheHandshake` | 握手用 `Mono.empty()`，会话用 `Mono.never()` | 握手完成不改计数；会话订阅后加一，取消后恢复 |

`Mono.never()` 在这些用例里不是模拟故障，而是把时间停在「正在执行」这个阶段，让测试能检查到中间状态。未完成的 future 起的是同样的作用。

另一个用例 `leastActiveShouldReleaseEveryInvocationOnAReusedWrapper` 对同一个 Dubbo 包装器调用两次，检查最终能回到基线。它验证的正是前面那个不太显眼的约束：释放标志必须按调用创建。

这些测试没有给出吞吐量提升的基准，也没有证明所有协议都已接入活跃计数。它们证明的是更具体的事：**真实工作存在时，计数能反映它；工作结束或取消后，计数不会残留。**

## 从这次修复能带走的判断

**先确认指标在数什么。** 「调用过多少次」「当前有多少请求」「当前有多少连接」都可能是合理指标，但回答的是不同问题。变量叫 `ActiveCount`，不代表它真的描述活跃状态；要沿着更新路径看，它在什么时候增加，又在什么时候减少。

**状态要跟着它所描述的那件事走。** 选择节点、构造异步对象、完成握手，都不等于完成实际工作。一次调用的释放标志不能放到可复用对象上，一条会话的计数也不能随着握手提前结束。

**测试要观察过程，不只观察终点。** 把异步工作保留在未完成状态，分别检查开始、等待、正常结束和取消，才能分清「从没计数」与「正确释放」。

最后还要保留修复的边界：这两条 PR 覆盖了 HTTP、Dubbo 和 WebSocket 的相关路径；gRPC picker、TCP proxy 和 Java SDK 的相关路径每次重建 `Upstream`，无法跨请求保留同一个计数器，仍退化为按权重选择。补齐 inflight 也不意味着 `shortestResponse` 的平均耗时统计一起得到了修复。

即使在已接入的路径上，leastActive 读取的也是选择时的状态，不是一个跨所有实例的全局调度承诺。这次修复最重要的变化，不是换了一个更漂亮的公式，而是终于让「最少」比较的东西，与请求实际正在做的工作对上了。
