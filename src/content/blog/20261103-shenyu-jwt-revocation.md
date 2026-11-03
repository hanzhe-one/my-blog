---
title: '密码改了，旧 JWT 为什么还能用？'
description: 'Apache ShenYu 的 Admin 改密后，旧 JWT 仍可能通过认证。拆解用户级 tokenVersion 如何撤销会话，以及 SQL 原子递增、事务和滚动升级为何都是这次修复的一部分。'
publishDate: '2026-11-03'
tags:
  - Apache ShenYu
  - Java
  - JWT
  - 认证
  - 开源
draft: true
---

密码已经改了，拿着修改前签发的 JWT，仍然可以通过认证。

这不一定是签名校验出了错。旧 token 没有被篡改，也还没过期；签发它的密钥没有变化。它仍然能证明「服务端曾经签发过这份凭证」，却不能证明「服务端现在还愿意接受这份凭证」。

Apache ShenYu 的 Admin 原来会验证 JWT 的签名、有效期和当前账号状态，但修改密码只更新密码哈希，没有让已经签发的 token 失效。[apache/shenyu#8235](https://github.com/apache/shenyu/pull/8235) 补上的是这条断开的关系：**凭据变化以后，旧会话应当怎样被拒绝。**

修复没有更换所有 Admin 实例共用的签名密钥，也没有给每一枚 token 建立黑名单。它为每个用户保存一个版本号，让 token 携带签发时的版本，再在认证时比较两者。

## 签名有效，不等于现在仍然有效

密码和 JWT 签名密钥是两种不同的东西。

密码哈希用于检查登录时提交的密码；JWT 则使用配置中的签名密钥签发。成功登录后，客户端拿到 token，后续认证不需要重新提交密码。因此，数据库中的密码哈希变了，不会自动改变旧 token 的签名，也不会改掉它已经写好的过期时间。

这也是为什么不能只把问题归结为「JWT 有效期太长」。缩短有效期可以缩短旧凭证被接受的窗口，但不能表达「这次改密已经发生，从现在起拒绝之前的 token」。

签名和过期时间回答的是凭证本身的问题，撤销机制回答的是当前服务端状态的问题。两种判断需要同时成立，不能互相替代。

在 ShenYu 中，这并不是从一个完全不查状态的系统，突然变成每次认证都保存一份服务端会话。`ShiroRealm` 的这条认证路径本来就会查询当前用户，用来检查账号是否存在、是否启用等状态。修复把用户的 token 版本也放进了这次判断。

## 给一个用户的会话划分版本

新字段是 `dashboard_user.token_version`，新账号从 0 开始。登录签发 JWT 时，`JwtUtils.generateToken` 把当前值写进 `tokenVersion` claim。

可以把它理解成一个用户的「会话批次」：版本还是 0 时签发的 token，都属于第 0 批；版本变成 1 后，重新登录拿到的 token 属于第 1 批。

认证时，保留原来的账号检查和签名、有效期验证，再执行这段版本比较：

```java
long tokenVersion = JwtUtils.getTokenVersion(token);
long currentTokenVersion = Optional.ofNullable(dashboardUserVO.getTokenVersion())
        .orElse(JwtUtils.LEGACY_TOKEN_VERSION);
if (tokenVersion != currentTokenVersion) {
    throw new AuthenticationException("token has been revoked.");
}
```

`getTokenVersion` 只是读取 claim，并不负责验签。所以这段代码不能代替前面的 `verifyToken`。claim 是签名覆盖的内容：想接受其中的版本值，先要确认整枚 token 能通过验证。

在签名、有效期和账号检查都通过的前提下，版本判断是：

| token 携带的版本 | 用户当前版本 | 结果             |
| ---------------- | ------------ | ---------------- |
| 0                | 0            | 版本匹配         |
| 0                | 1            | 旧会话被拒绝     |
| 1                | 1            | 新会话的版本匹配 |

这不是比较签发时间，也不是问 token 的版本「够不够大」，而是要求它**等于当前版本**。

于是，自助改密、管理员重置密码和显式撤销，都可以通过递增用户版本，让这个用户之前版本的 token 在后续认证中失效。其他用户的版本没有变化，不需要一起退出登录。

代价和范围也很明确：它撤销的是这个账号之前版本的全部 token，不是只撤销某一台设备的一枚 token；已经通过认证并开始执行的请求，也不会被这次版本变化追溯取消。

## 加一，为什么一定要放进 SQL

版本号看起来只是一个普通数字，很容易写成：先查用户，取出版本，加一，再更新回去。

但如果两次撤销同时读到版本 0，它们都可能写回 1。数据库最后只前进了一次，而不是两次。

这不是普通统计计数少了一条那么简单。假设第一次撤销写入 1 后，有一次登录签发了版本 1 的 token；第二次撤销随后仍写入自己早先算出的 1，就无法让这枚中间签发的 token 失效。在更多交错中，迟到的旧值写回还可能让版本倒退。

修复因此不让这些改密和撤销路径计算一个绝对版本值，而是调用 `DashboardUserMapper.incrementTokenVersion`，让数据库对当前行执行递增：

```sql
UPDATE dashboard_user
   SET token_version = token_version + 1,
       date_updated = #{dateUpdated, jdbcType=TIMESTAMP}
 WHERE id = #{id, jdbcType=VARCHAR}
```

这里的 `#{...}` 是 MyBatis 参数占位符。关键不在 SQL 写得短，而在于**读取当前版本并加一，是这条数据库更新的一部分**。调用方不再拿着旧读数覆盖新状态。

mapper 的全量 `update` 也刻意不写 `token_version`，避免一次普通账号更新把撤销状态带回旧值。这不是说所有 mapper 方法都禁止写绝对版本：`updateSelective` 仍支持这个字段，所以撤销路径坚持使用原子递增，本身就是需要维护的约束。

另外，密码更新和版本递增必须在同一个事务里。否则就可能出现密码修改已经成功，撤销操作却失败的中间状态。

`DashboardUserServiceImpl` 因此给改密、管理员更新和显式撤销入口加上了 `@Transactional(rollbackFor = Exception.class)`。这两件事应该一起提交；发生导致回滚的异常时，也应该一起撤回。只有版本比较，没有可靠的版本更新，仍然不能完成这次修复。

## 兼容旧 token，不等于旧节点也会撤销

升级前签发的 JWT 没有 `tokenVersion` claim。修复把这种 token 视为版本 0：

- 用户当前版本还是 0，旧 token 仍可以通过版本检查。
- 第一次改密或撤销把版本推进到 1，旧 token 的版本 0 就不再匹配。

这样不必让所有现存会话在升级当天立即失效。但它兼容的是**旧 token 的格式**，不是旧的数据库结构，更不是旧服务的行为。

数据库需要先具备 `token_version` 列；PR 补充了初始化和升级 SQL。所有 Admin 节点也需要运行新版代码，才能在改密时递增版本，并在认证时检查版本。

如果滚动升级中还混着旧节点，会出现两种缺口：

- 改密请求落到旧节点，它只更新密码，不递增版本。
- 认证请求落到旧节点，它不比较版本，仍可能接受已被新版节点撤销的 token。

因此，「版本在共享数据库里」并不自动等于「任何部署阶段都能全局撤销」。需要所有相关节点运行新逻辑，并读取更新后的用户状态。这条 PR 的操作要求是：**完成升级以后，再执行密码重置或撤销。**

这里值得区分的是三个层次：数据是否共享、代码是否都会维护数据、认证是否都会检查数据。只解决第一个，另外两处仍然会漏掉撤销。

## 测试分别保护哪一层

版本比较和数据库递增，需要不同层次的证据。

`ShiroRealmTest.testDoGetAuthenticationInfoRejectsRevokedToken` 先让 token 版本和用户版本同为 1，确认能通过；再把用户当前版本改成 2，确认同一枚 token 被拒绝。另一条 legacy 测试固定了「缺少 claim 时，在版本 0 接受、推进到 1 后拒绝」的兼容规则。

`testPasswordChangeInvalidatesOldTokenAndAcceptsFreshLogin` 则串起旧 token 失效、新版本 token 通过的判断。但它直接修改测试中的用户对象版本，再调用 `JwtUtils.generateToken` 生成新 token；查询用户的 service 是 mock。

所以这个名字不能被扩写成「已经验证了真实 HTTP 改密，再真实登录的完整端到端流程」。它证明的是认证层在版本变化后的接受和拒绝行为。

数据库层的证据来自 `DashboardUserMapperTest.testConcurrentIncrementsAreAtomic`。它创建初始版本为 0 的用户，启动 8 个线程，每个线程调用递增 SQL 5 次，然后读取数据库中的最终值：

```java
assertEquals((long) threads * incrementsPerThread,
        dashboardUserMapper.selectById(record.getId()).getTokenVersion());
```

预期是 40。这个 mapper 集成测试保护的是并发递增不丢更新，不是用 mock 返回一个预先写好的 40。

service 层还有另一种检查：`testModifyPasswordBumpsTokenVersion` 验证改密调用了 `incrementTokenVersion`，并断言传给普通 `updateSelective` 的对象里，`tokenVersion` 是 null。它防止业务代码又回到「算出一个旧值加一，作为普通字段写回」的做法。

这些证据可以相互补充，但不能互相冒充：认证测试证明比较规则，mapper 测试证明实际 SQL 的并发行为，service 测试证明更新入口使用了正确路径。它们没有证明混合版本部署也安全，更没有取消已经在执行的请求。

## 从这次修复能带走的判断

**凭证曾经有效，不代表现在仍应接受。** 签名、有效期和撤销状态分别回答不同问题。读认证代码时，不能因为已经调用验签方法，就认为账号状态和会话撤销也自然成立。

**安全状态不能被当成普通字段随手覆盖。** 版本号不是展示用的统计数字，它决定哪些凭证还会被接受。原子更新、事务边界，以及普通更新是否会回写旧值，都属于这项机制的一部分。

**部署中的每个校验者，都必须理解新状态。** 新数据库字段和新 token 格式只是数据层面的准备。只要还有节点不维护或不检查版本，共享数据就不能替它完成撤销。

这次修复没有改变 JWT 的签名原理，而是在凭证之外补上一个当前状态：服务端仍能确认「这份 token 是我签发的」，也终于能继续判断「它属于我现在还接受的那一批会话吗」。
